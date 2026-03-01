/**
 * BackgroundTaskWorker — polls the background_tasks queue and dispatches
 * ACP sessions for PENDING tasks.
 *
 * Design (Next.js compatible):
 *   - Internally calls `/api/acp` with `session/new` + `session/prompt`
 *     to reuse all existing session-creation logic without duplication.
 *   - The base URL is read from the NEXTAUTH_URL / VERCEL_URL env var, or
 *     defaults to http://localhost:PORT for local dev.
 *   - Runs as a singleton via globalThis to survive HMR.
 *   - In production (Vercel) schedule via a Vercel Cron Job that POST
 *     to `/api/background-tasks/process` instead of long-running interval.
 */

import { getRoutaSystem } from "../routa-system";
import type { BackgroundTask } from "../models/background-task";

// ─── Constants ──────────────────────────────────────────────────────────────

const DISPATCH_INTERVAL_MS = 5_000;
const COMPLETION_INTERVAL_MS = 15_000;
const WORKER_GLOBAL_KEY = "__routa_bg_worker__";
const WORKER_STARTED_KEY = "__routa_bg_worker_started__";

// ─── Internal URL helper ─────────────────────────────────────────────────────

function getInternalBaseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}`;
}

// ─── Worker ──────────────────────────────────────────────────────────────────

export class BackgroundTaskWorker {
  private dispatchTimer: ReturnType<typeof setInterval> | null = null;
  private completionTimer: ReturnType<typeof setInterval> | null = null;
  /** sessionId → backgroundTaskId */
  private sessionToTask = new Map<string, string>();

  start(): void {
    if (this.dispatchTimer) return; // already running
    this.dispatchTimer = setInterval(() => { void this.dispatchPending(); }, DISPATCH_INTERVAL_MS);
    this.completionTimer = setInterval(() => { void this.checkCompletions(); }, COMPLETION_INTERVAL_MS);
    console.log("[BGWorker] Started polling for background tasks.");
  }

  stop(): void {
    if (this.dispatchTimer) { clearInterval(this.dispatchTimer); this.dispatchTimer = null; }
    if (this.completionTimer) { clearInterval(this.completionTimer); this.completionTimer = null; }
    console.log("[BGWorker] Stopped.");
  }

  // ─── Dispatch pending tasks ───────────────────────────────────────────────

  async dispatchPending(): Promise<void> {
    const system = getRoutaSystem();
    let pending: BackgroundTask[];
    try {
      pending = await system.backgroundTaskStore.listPending();
    } catch {
      return; // DB not ready yet (cold start)
    }
    for (const task of pending) {
      await this.dispatchTask(task);
    }
  }

  async dispatchTask(task: BackgroundTask): Promise<void> {
    const system = getRoutaSystem();
    // Optimistically mark RUNNING to prevent re-dispatch
    await system.backgroundTaskStore.updateStatus(task.id, "RUNNING", { startedAt: new Date() });

    try {
      const sessionId = await this.createAndSendPrompt(task);
      await system.backgroundTaskStore.updateStatus(task.id, "RUNNING", {
        startedAt: task.startedAt ?? new Date(),
        resultSessionId: sessionId,
      });
      this.sessionToTask.set(sessionId, task.id);
      console.log(`[BGWorker] Task ${task.id} → session ${sessionId}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[BGWorker] Task ${task.id} dispatch failed:`, err);
      await system.backgroundTaskStore.updateStatus(task.id, "FAILED", {
        errorMessage,
        completedAt: new Date(),
      });
    }
  }

  /**
   * Create an ACP session and fire the prompt via the internal `/api/acp` endpoint.
   * Returns the session ID.
   */
  private async createAndSendPrompt(task: BackgroundTask): Promise<string> {
    const base = getInternalBaseUrl();

    // Known ACP providers — everything else is treated as a specialist ID
    const KNOWN_PROVIDERS = new Set([
      "opencode",
      "gemini",
      "codex",
      "copilot",
      "auggie",
      "kimi",
      "kiro",
      "claude",
      "claude-code-sdk",
    ]);

    // Determine provider and specialistId based on task.agentId
    const isKnownProvider = KNOWN_PROVIDERS.has(task.agentId);
    // Use default provider if agentId is not a known provider (it's a specialist)
    const provider = isKnownProvider ? task.agentId : undefined; // Let API use default
    const specialistId = isKnownProvider ? undefined : task.agentId;

    // 1. Create session
    const newRes = await fetch(`${base}/api/acp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "session/new",
        params: {
          provider,
          specialistId,
          workspaceId: task.workspaceId,
          cwd: process.cwd(),
          role: "CRAFTER",
        },
      }),
    });

    if (!newRes.ok) throw new Error(`session/new HTTP ${newRes.status}`);

    const newBody = (await newRes.json()) as {
      result?: { sessionId?: string };
      error?: { message: string };
    };
    if (newBody.error) throw new Error(newBody.error.message);
    const sessionId = newBody.result?.sessionId;
    if (!sessionId) throw new Error("No sessionId returned from session/new");

    // 2. Send prompt (fire-and-forget — SSE may block; we don't await)
    void fetch(`${base}/api/acp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "session/prompt",
        params: { sessionId, prompt: task.prompt, workspaceId: task.workspaceId },
      }),
    }).catch((err) => {
      console.warn(`[BGWorker] session/prompt fire-and-forget error:`, err);
    });

    return sessionId;
  }

  // ─── Check completed sessions ─────────────────────────────────────────────

  async checkCompletions(): Promise<void> {
    if (this.sessionToTask.size === 0) return;

    const system = getRoutaSystem();
    const { getHttpSessionStore } = await import("../acp/http-session-store");
    const store = getHttpSessionStore();
    const sessionIds = new Set(store.listSessions().map((s) => s.sessionId));

    for (const [sessionId, taskId] of [...this.sessionToTask.entries()]) {
      if (!sessionIds.has(sessionId)) {
        // Session gone → completed
        await system.backgroundTaskStore.updateStatus(taskId, "COMPLETED", {
          completedAt: new Date(),
          resultSessionId: sessionId,
        });
        this.sessionToTask.delete(sessionId);
        console.log(`[BGWorker] Task ${taskId} completed (session removed).`);
      }
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export function getBackgroundWorker(): BackgroundTaskWorker {
  const g = globalThis as Record<string, unknown>;
  if (!g[WORKER_GLOBAL_KEY]) g[WORKER_GLOBAL_KEY] = new BackgroundTaskWorker();
  return g[WORKER_GLOBAL_KEY] as BackgroundTaskWorker;
}

/**
 * Start the background worker singleton. Idempotent across HMR restarts.
 */
export function startBackgroundWorker(): void {
  const g = globalThis as Record<string, unknown>;
  if (g[WORKER_STARTED_KEY]) return;
  g[WORKER_STARTED_KEY] = true;
  getBackgroundWorker().start();
}
