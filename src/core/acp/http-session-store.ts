/**
 * HttpSessionStore - In-memory store for ACP sessions and SSE delivery.
 *
 * Tracks sessions for UI listing and delivers `session/update` notifications
 * from opencode processes to the browser via Server-Sent Events.
 *
 * - Buffers notifications until SSE connects (avoids losing early updates)
 * - Supports multiple concurrent sessions with independent SSE streams
 * - Stores user messages for history preservation
 * - Consolidates consecutive agent_message_chunk notifications for efficient storage
 * - Records Agent Trace with file ranges and VCS context
 * - Uses Provider Adapters to normalize different provider message formats
 */

import { getProviderAdapter } from "./provider-adapter";
import { TraceRecorder } from "./provider-adapter/trace-recorder";
import { hydrateSessionsFromDb } from "./session-db-persister";

export interface RoutaSessionRecord {
  sessionId: string;
  /** User-editable display name */
  name?: string;
  cwd: string;
  workspaceId: string;
  routaAgentId?: string;
  provider?: string;
  role?: string;
  modeId?: string;
  /** Model used for this session (e.g. "claude-sonnet-4-20250514") */
  model?: string;
  createdAt: string;
  /** Whether the first prompt has been sent (for coordinator prompt injection) */
  firstPromptSent?: boolean;
  /** Parent session ID for crafter subtasks */
  parentSessionId?: string;
}

type Controller = ReadableStreamDefaultController<Uint8Array>;

export interface SessionUpdateNotification {
  sessionId: string;
  update?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Consolidates consecutive agent_message_chunk notifications into a single message.
 * This reduces storage overhead from hundreds of small chunks to a single entry.
 */
export function consolidateMessageHistory(
  notifications: SessionUpdateNotification[]
): SessionUpdateNotification[] {
  if (notifications.length === 0) return [];

  const result: SessionUpdateNotification[] = [];
  let currentChunks: string[] = [];
  let currentSessionId: string | null = null;

  const flushChunks = () => {
    if (currentChunks.length > 0 && currentSessionId) {
      // Create a consolidated agent_message notification
      result.push({
        sessionId: currentSessionId,
        update: {
          sessionUpdate: "agent_message",
          content: { type: "text", text: currentChunks.join("") },
        },
      });
      currentChunks = [];
    }
  };

  for (const notification of notifications) {
    const update = notification.update as Record<string, unknown> | undefined;
    const sessionUpdate = update?.sessionUpdate;

    if (sessionUpdate === "agent_message_chunk") {
      // Accumulate chunks
      const content = update?.content as { type?: string; text?: string } | undefined;
      if (content?.text) {
        if (currentSessionId !== notification.sessionId) {
          flushChunks();
          currentSessionId = notification.sessionId;
        }
        currentChunks.push(content.text);
      }
    } else {
      // Non-chunk notification - flush any pending chunks first
      flushChunks();
      currentSessionId = notification.sessionId;
      result.push(notification);
    }
  }

  // Flush any remaining chunks
  flushChunks();

  return result;
}

/**
 * HttpSessionStore uses Provider Adapters to handle different provider behaviors.
 * Trace recording is delegated to TraceRecorder which handles deferred input patterns.
 */
class HttpSessionStore {
  private sessions = new Map<string, RoutaSessionRecord>();
  private sseControllers = new Map<string, Controller>();
  private pendingNotifications = new Map<string, SessionUpdateNotification[]>();
  /** Store all notifications per session for history replay */
  private messageHistory = new Map<string, SessionUpdateNotification[]>();
  /** TraceRecorder handles all trace recording with provider-specific normalization */
  private traceRecorder = new TraceRecorder();

  upsertSession(record: RoutaSessionRecord) {
    this.sessions.set(record.sessionId, record);
  }

  listSessions(): RoutaSessionRecord[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getSession(sessionId: string): RoutaSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): boolean {
    // Clean up TraceRecorder buffers for this session
    this.traceRecorder.cleanupSession(sessionId);
    this.messageHistory.delete(sessionId);
    this.pendingNotifications.delete(sessionId);
    // Detach SSE if connected
    this.sseControllers.delete(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Flush and trace any remaining buffered agent message/thought content.
   * Call this when a prompt completes or session ends.
   */
  flushAgentBuffer(sessionId: string): void {
    const sessionRecord = this.sessions.get(sessionId);
    const cwd = sessionRecord?.cwd ?? process.cwd();
    const provider = sessionRecord?.provider ?? "unknown";
    this.traceRecorder.flushSession(sessionId, cwd, provider);
  }

  renameSession(sessionId: string, name: string): boolean {
    const existing = this.sessions.get(sessionId);
    if (!existing) return false;
    existing.name = name;
    return true;
  }

  markFirstPromptSent(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, {
      ...existing,
      firstPromptSent: true,
    });
  }

  updateSessionMode(sessionId: string, modeId: string) {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, {
      ...existing,
      modeId,
    });
  }

  attachSse(sessionId: string, controller: Controller) {
    this.sseControllers.set(sessionId, controller);
    this.flushPending(sessionId);
  }

  detachSse(sessionId: string) {
    this.sseControllers.delete(sessionId);
  }

  /**
   * Store a user message in history. This is called when user sends a prompt.
   * User messages are stored with sessionUpdate: "user_message" for easy identification.
   */
  pushUserMessage(sessionId: string, prompt: string) {
    const notification: SessionUpdateNotification = {
      sessionId,
      update: {
        sessionUpdate: "user_message",
        content: { type: "text", text: prompt },
      },
    };
    const history = this.messageHistory.get(sessionId) ?? [];
    history.push(notification);
    this.messageHistory.set(sessionId, history);

    // ── Trace: user_message using Provider Adapter ──
    const sessionRecord = this.sessions.get(sessionId);
    const cwd = sessionRecord?.cwd ?? process.cwd();
    const provider = sessionRecord?.provider ?? "unknown";

    // Normalize and record trace using adapter
    const adapter = getProviderAdapter(provider);
    const normalized = adapter.normalize(sessionId, notification);
    if (normalized) {
      const updates = Array.isArray(normalized) ? normalized : [normalized];
      for (const update of updates) {
        this.traceRecorder.recordFromUpdate(update, cwd);
      }
    }
  }

  /**
   * Push a session/update notification. If SSE isn't connected yet, buffer it.
   *
   * Accepts the raw notification params from opencode (which may have different shapes).
   * Uses Provider Adapters to normalize messages and handle provider-specific behaviors.
   */
  pushNotification(notification: SessionUpdateNotification) {
    const sessionId = notification.sessionId;

    // Always store in history for session switching
    const history = this.messageHistory.get(sessionId) ?? [];
    history.push(notification);
    this.messageHistory.set(sessionId, history);

    // ── Trace recording using Provider Adapter pattern ──
    const sessionRecord = this.sessions.get(sessionId);
    const cwd = sessionRecord?.cwd ?? process.cwd();
    const provider = sessionRecord?.provider ?? "unknown";

    // Get the appropriate adapter for this provider
    const adapter = getProviderAdapter(provider);

    // Normalize the raw notification using the provider adapter
    const normalized = adapter.normalize(sessionId, notification);

    // Record traces from normalized messages
    if (normalized) {
      const updates = Array.isArray(normalized) ? normalized : [normalized];
      for (const update of updates) {
        this.traceRecorder.recordFromUpdate(update, cwd);
      }
    }

    const controller = this.sseControllers.get(sessionId);

    if (controller) {
      this.writeSse(controller, {
        jsonrpc: "2.0",
        method: "session/update",
        params: notification,
      });
      return;
    }

    const pending = this.pendingNotifications.get(sessionId) ?? [];
    pending.push(notification);
    this.pendingNotifications.set(sessionId, pending);
  }

  /**
   * Get message history for a session (used when switching sessions).
   * Returns raw history without consolidation (for streaming playback).
   */
  getHistory(sessionId: string): SessionUpdateNotification[] {
    return this.messageHistory.get(sessionId) ?? [];
  }

  /**
   * Get consolidated message history for storage.
   * Merges consecutive agent_message_chunk notifications into single messages.
   */
  getConsolidatedHistory(sessionId: string): SessionUpdateNotification[] {
    const history = this.messageHistory.get(sessionId) ?? [];
    return consolidateMessageHistory(history);
  }

  /**
   * Send a one-off "connected" event (useful for UI).
   */
  pushConnected(sessionId: string) {
    const controller = this.sseControllers.get(sessionId);
    if (!controller) return;
    this.writeSse(controller, {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Connected to ACP session." },
        },
      },
    });
  }

  private flushPending(sessionId: string) {
    const controller = this.sseControllers.get(sessionId);
    if (!controller) return;

    const pending = this.pendingNotifications.get(sessionId);
    if (!pending || pending.length === 0) return;

    for (const n of pending) {
      this.writeSse(controller, {
        jsonrpc: "2.0",
        method: "session/update",
        params: n,
      });
    }
    this.pendingNotifications.delete(sessionId);
  }

  private writeSse(controller: Controller, payload: unknown) {
    const encoder = new TextEncoder();
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    try {
      controller.enqueue(encoder.encode(event));
    } catch {
      // controller closed - drop silently
    }
  }

  /** Whether DB hydration has been performed */
  private hydrated = false;

  /**
   * Load sessions from the database into the in-memory store.
   * Only runs once per process lifecycle (idempotent).
   */
  async hydrateFromDb(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;

    const dbSessions = await hydrateSessionsFromDb();
    for (const s of dbSessions) {
      if (!this.sessions.has(s.id)) {
        this.upsertSession({
          sessionId: s.id,
          name: s.name,
          cwd: s.cwd,
          workspaceId: s.workspaceId,
          routaAgentId: s.routaAgentId,
          provider: s.provider,
          role: s.role,
          modeId: s.modeId,
          createdAt: s.createdAt?.toISOString() ?? new Date().toISOString(),
        });
      }
    }
    if (dbSessions.length > 0) {
      console.log(`[HttpSessionStore] Hydrated ${dbSessions.length} sessions from database`);
    }
  }
}

// Use globalThis to survive HMR in Next.js dev mode
const GLOBAL_KEY = "__http_session_store__";

export function getHttpSessionStore(): HttpSessionStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new HttpSessionStore();
  }
  return g[GLOBAL_KEY] as HttpSessionStore;
}
