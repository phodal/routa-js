/**
 * ACP Server API Route - /api/acp
 *
 * Proxies ACP JSON-RPC to a spawned ACP agent process per session.
 * Supports multiple ACP providers (opencode, gemini, codex-acp, auggie, copilot, claude).
 *
 * - POST: JSON-RPC requests (initialize, session/new, session/prompt, etc.)
 *         → forwarded to the ACP agent via stdin, responses returned to client
 * - GET : SSE stream for `session/update` notifications from the agent
 *
 * Flow:
 *   1. Client sends `initialize` → we return our capabilities (no process yet)
 *   2. Client sends `session/new` → we spawn agent, initialize it, create session
 *      - Optional `provider` param selects the agent (default: "opencode")
 *      - For `claude` provider: spawns Claude Code with stream-json protocol
 *   3. Client connects SSE with sessionId → we pipe agent's session/update to SSE
 *   4. Client sends `session/prompt` → we forward to agent, it streams via session/update
 */

import { NextRequest, NextResponse } from "next/server";
import { getAcpProcessManager } from "@/core/acp/processer";
import { getHttpSessionStore } from "@/core/acp/http-session-store";
import { getStandardPresets, getPresetById, resolveCommand } from "@/core/acp/acp-presets";
import { which } from "@/core/acp/utils";
import { fetchRegistry, detectPlatformTarget } from "@/core/acp/acp-registry";
import { ensureMcpForProvider } from "@/core/acp/mcp-setup";
import { getDefaultRoutaMcpConfig } from "@/core/acp/mcp-config-generator";
import { v4 as uuidv4 } from "uuid";
import { isServerlessEnvironment } from "@/core/acp/api-based-providers";
import { shouldUseOpencodeAdapter, isOpencodeServerConfigured } from "@/core/acp/opencode-sdk-adapter";
import type { OpencodeSdkAdapter } from "@/core/acp/opencode-sdk-adapter";
import { isClaudeCodeSdkConfigured } from "@/core/acp/claude-code-sdk-adapter";
import { initRoutaOrchestrator, getRoutaOrchestrator } from "@/core/orchestration/orchestrator-singleton";
import { getRoutaSystem } from "@/core/routa-system";
import { AgentRole } from "@/core/models/agent";
import { buildCoordinatorPrompt, getSpecialistByRole } from "@/core/orchestration/specialist-prompts";
import { AcpError } from "@/core/acp/acp-process";
import {
  createTraceRecord,
  withWorkspaceId,
  withMetadata,
  withConversation,
  recordTrace,
} from "@/core/trace";
import { persistSessionToDb, renameSessionInDb } from "@/core/acp/session-db-persister";
import { resolveSkillContent } from "@/core/skills/skill-resolver";
import type { SessionUpdateNotification } from "@/core/acp/http-session-store";

export const dynamic = "force-dynamic";

// ─── Idempotency cache for session/new requests ─────────────────────────
// Prevents duplicate session creation when user clicks multiple times
// before navigation completes. Cache entries expire after 30 seconds.

interface IdempotencyEntry {
  sessionId: string;
  provider: string;
  role: string;
  createdAt: number;
}

const idempotencyCache = new Map<string, IdempotencyEntry>();
const IDEMPOTENCY_TTL_MS = 30_000; // 30 seconds

function cleanupIdempotencyCache() {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) {
      idempotencyCache.delete(key);
    }
  }
}

// ─── GET: SSE stream for session/update ────────────────────────────────

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId query param" },
      { status: 400 }
    );
  }

  const store = getHttpSessionStore();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      store.attachSse(sessionId, controller);
      store.pushConnected(sessionId);

      request.signal.addEventListener("abort", () => {
        store.detachSse(sessionId);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
    },
  });
}

// ─── POST: JSON-RPC request handler ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, params, id } = body as {
      jsonrpc: "2.0";
      id?: string | number | null;
      method: string;
      params?: Record<string, unknown>;
    };

    // ── initialize ─────────────────────────────────────────────────────
    // No agent process yet; return our own capabilities.
    if (method === "initialize") {
      return jsonrpcResponse(id ?? null, {
        protocolVersion: (params as { protocolVersion?: number })?.protocolVersion ?? 1,
        agentCapabilities: {
          loadSession: false,
        },
        agentInfo: {
          name: "routa-acp",
          version: "0.1.0",
        },
      });
    }

    // ── session/new ────────────────────────────────────────────────────
    // Spawn an ACP agent process and create a session.
    // Optional `provider` param selects the agent.
    // Default provider: claude-code-sdk in serverless (Vercel), opencode otherwise.
    // For `claude` provider: spawns Claude Code with stream-json + MCP.
    // Supports idempotencyKey to prevent duplicate session creation.
    if (method === "session/new") {
      const p = (params ?? {}) as Record<string, unknown>;
      const cwd = (p.cwd as string | undefined) ?? process.cwd();

      // Determine default provider based on environment
      const defaultProvider = isServerlessEnvironment() ? "claude-code-sdk" : "opencode";
      const provider = (p.provider as string | undefined) ?? defaultProvider;

      const modeId = (p.modeId as string | undefined) ?? (p.mode as string | undefined);
      const role = (p.role as string | undefined)?.toUpperCase();
      const model = (p.model as string | undefined);
      const workspaceId = (p.workspaceId as string) || "default";
      const idempotencyKey = p.idempotencyKey as string | undefined;

      // ── Idempotency check ──────────────────────────────────────────────
      // If client provides an idempotencyKey, check if we've already created
      // a session for this key. This prevents duplicate sessions when user
      // clicks "Start" multiple times before navigation completes.
      if (idempotencyKey) {
        cleanupIdempotencyCache();
        const cached = idempotencyCache.get(idempotencyKey);
        if (cached) {
          console.log(`[ACP Route] Returning cached session for idempotencyKey: ${idempotencyKey} -> ${cached.sessionId}`);
          return jsonrpcResponse(id ?? null, {
            sessionId: cached.sessionId,
            provider: cached.provider,
            role: cached.role,
            cached: true,
          });
        }
      }

      const sessionId = uuidv4();

      // Default provider for CRAFTER/GATE delegation (can be overridden per-task)
      const crafterProvider = (p.crafterProvider as string | undefined) ?? provider;
      const gateProvider = (p.gateProvider as string | undefined) ?? provider;

      console.log(`[ACP Route] Creating session: provider=${provider}, cwd=${cwd}, modeId=${modeId}, role=${role ?? "CRAFTER"}, idempotencyKey=${idempotencyKey ?? "none"}`);

      const store = getHttpSessionStore();
      const manager = getAcpProcessManager();
      const forwardSessionUpdate = createSessionUpdateForwarder(store, sessionId);

      const preset = getPresetById(provider);
      const isClaudeCode = preset?.nonStandardApi === true || provider === "claude";
      // claude-code-sdk is the SDK-based adapter for serverless environments
      const isClaudeCodeSdk = provider === "claude-code-sdk";
      // opencode-sdk is the SDK-based adapter for connecting to remote OpenCode server
      const isOpencodeSdk = provider === "opencode-sdk";

      let acpSessionId: string;

      if (isOpencodeSdk) {
        // ── OpenCode SDK: remote server or direct API mode ──────────────
        if (!isOpencodeServerConfigured()) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32002,
            message: "OpenCode SDK not configured. Set OPENCODE_SERVER_URL or OPENCODE_API_KEY (or ANTHROPIC_AUTH_TOKEN) environment variable.",
          });
        }

        acpSessionId = await manager.createOpencodeSdkSession(
          sessionId,
          forwardSessionUpdate
        );
      } else if (isClaudeCodeSdk) {
        // ── Claude Code SDK: direct API calls (for serverless environments) ──
        if (!isClaudeCodeSdkConfigured()) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32002,
            message: "Claude Code SDK not configured. Set ANTHROPIC_AUTH_TOKEN environment variable.",
          });
        }

        // Always use SDK adapter for claude-code-sdk provider
        acpSessionId = await manager.createClaudeCodeSdkSession(
          sessionId,
          cwd,
          forwardSessionUpdate
        );
      } else if (isClaudeCode) {
        // ── Claude Code: stream-json protocol with MCP (CLI process) ───
        const mcpConfigs = buildMcpConfigForClaude(workspaceId);

        acpSessionId = await manager.createClaudeSession(
          sessionId,
          cwd,
          forwardSessionUpdate,
          mcpConfigs,
          modeId,
          role, // Pass role so ROUTA gets bypassPermissions
        );
      } else {
        // ── Standard ACP agent ───────────────────────────────────────
        // Build extra args: pass -m <model> if a model was specified
        const extraArgs: string[] = [];
        if (model && model.trim()) {
          extraArgs.push("-m", model.trim());
        }

        acpSessionId = await manager.createSession(
          sessionId,
          cwd,
          forwardSessionUpdate,
          provider,
          modeId,
          extraArgs.length > 0 ? extraArgs : undefined,
          undefined, // extraEnv
          workspaceId,
        );
      }

      // ── Register with orchestrator if role is ROUTA ──────────────
      let routaAgentId: string | undefined;

      if (role === "ROUTA") {
        // Initialize orchestrator
        // Detect actual server port for MCP URL generation
        const serverPort = process.env.PORT ?? "3000";
        const orchestrator = initRoutaOrchestrator({
          defaultCrafterProvider: crafterProvider,
          defaultGateProvider: gateProvider,
          defaultCwd: cwd,
          serverPort,
        });

        // Create a ROUTA agent record
        const system = getRoutaSystem();
        const agentResult = await system.tools.createAgent({
          name: `routa-coordinator-${sessionId.slice(0, 8)}`,
          role: AgentRole.ROUTA,
          workspaceId: (p.workspaceId as string) || "default",
        });

        if (agentResult.success && agentResult.data) {
          routaAgentId = (agentResult.data as { agentId: string }).agentId;
          orchestrator.registerAgentSession(routaAgentId, sessionId);

          // Set up notification handler for child agent updates
          orchestrator.setNotificationHandler((targetSessionId, data) => {
            store.pushNotification({
              ...data as Record<string, unknown>,
              sessionId: targetSessionId,
            } as never);
          });

          // Set up session registration handler to add child sessions to sidebar
          orchestrator.setSessionRegistrationHandler((childSession) => {
            store.upsertSession({
              sessionId: childSession.sessionId,
              name: childSession.name,
              cwd: childSession.cwd,
              workspaceId: childSession.workspaceId,
              routaAgentId: childSession.routaAgentId,
              provider: childSession.provider,
              role: childSession.role,
              parentSessionId: childSession.parentSessionId,
              createdAt: new Date().toISOString(),
            });
            console.log(
              `[ACP Route] Child session registered: ${childSession.sessionId} (parent: ${childSession.parentSessionId})`
            );
          });

          console.log(
            `[ACP Route] ROUTA coordinator agent created: ${routaAgentId}`
          );
        }
      }

      // Persist session for UI listing
      const now = new Date();
      store.upsertSession({
        sessionId,
        cwd,
        workspaceId,
        routaAgentId: routaAgentId ?? acpSessionId,
        provider,
        role: role ?? "CRAFTER",
        modeId,
        model,
        createdAt: now.toISOString(),
      });

      // Also persist to database (SQLite in dev, Postgres in serverless)
      await persistSessionToDb({
        id: sessionId,
        cwd,
        workspaceId,
        routaAgentId: routaAgentId ?? acpSessionId,
        provider,
        role: role ?? "CRAFTER",
        modeId,
        model,
      });

      console.log(
        `[ACP Route] Session created: ${sessionId} (provider: ${provider}, agent session: ${acpSessionId}, role: ${role ?? "CRAFTER"})`
      );

      // ── Cache for idempotency ─────────────────────────────────────────
      if (idempotencyKey) {
        idempotencyCache.set(idempotencyKey, {
          sessionId,
          provider,
          role: role ?? "CRAFTER",
          createdAt: Date.now(),
        });
      }

      // ── Trace: session_start ────────────────────────────────────────
      const sessionStartTrace = withMetadata(
        withMetadata(
          withWorkspaceId(
            createTraceRecord(sessionId, "session_start", { provider }),
            workspaceId
          ),
          "cwd", cwd
        ),
        "role", role ?? "CRAFTER"
      );
      recordTrace(cwd, sessionStartTrace);

      return jsonrpcResponse(id ?? null, {
        sessionId,
        provider,
        role: role ?? "CRAFTER",
        model,
        routaAgentId,
      });
    }

    // ── session/prompt ─────────────────────────────────────────────────
    // Forward prompt to the ACP agent process (or Claude Code).
    // If session doesn't exist, auto-create one with default settings.
    if (method === "session/prompt") {
      const p = (params ?? {}) as Record<string, unknown>;
      const sessionId = p.sessionId as string;

      if (!sessionId) {
        return jsonrpcResponse(id ?? null, null, {
          code: -32602,
          message: "Missing sessionId",
        });
      }

      const manager = getAcpProcessManager();
      const store = getHttpSessionStore();
      const forwardSessionUpdate = createSessionUpdateForwarder(store, sessionId);

      // Extract prompt text - handle both string and array formats
      const rawPrompt = p.prompt;
      let promptText = "";
      if (typeof rawPrompt === "string") {
        promptText = rawPrompt;
      } else if (Array.isArray(rawPrompt)) {
        const promptBlocks = rawPrompt as Array<{ type: string; text?: string }>;
        promptText = promptBlocks
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("\n");
      }

      // Extract skill context (passed from UI when user selects a /skill)
      const skillName = p.skillName as string | undefined;
      let skillContent = p.skillContent as string | undefined;

      // Load skill content from filesystem/database if skillName is provided but content is missing
      if (skillName && !skillContent) {
        const cwd = (p.cwd as string | undefined) ?? process.cwd();
        console.log(`[ACP Route] Loading skill content for: ${skillName}`);
        skillContent = await resolveSkillContent(skillName, cwd);
        if (!skillContent) {
          console.warn(`[ACP Route] Could not load skill content for: ${skillName}, proceeding without skill`);
        }
      }

      // ── Auto-create session if it doesn't exist ────────────────────────
      // Check if session exists in any of the process managers
      const sessionExists =
        manager.getProcess(sessionId) !== undefined ||
        manager.getClaudeProcess(sessionId) !== undefined ||
        manager.isClaudeCodeSdkSession(sessionId) ||
        manager.isOpencodeAdapterSession(sessionId) ||
        (await manager.isClaudeCodeSdkSessionAsync(sessionId)) ||
        (await manager.isOpencodeSdkSessionAsync(sessionId));

      if (!sessionExists) {
        console.log(`[ACP Route] Session ${sessionId} not found, auto-creating with default settings...`);

        // Use default settings for auto-created session
        const cwd = (p.cwd as string | undefined) ?? process.cwd();
        const defaultProvider = isServerlessEnvironment() ? "claude-code-sdk" : "opencode";
        const provider = (p.provider as string | undefined) ?? defaultProvider;
        const workspaceId = (p.workspaceId as string) || "default";
        const role = "CRAFTER"; // Default role for auto-created sessions

        try {
          const preset = getPresetById(provider);
          const isClaudeCode = preset?.nonStandardApi === true || provider === "claude";
          const isClaudeCodeSdk = provider === "claude-code-sdk";
          const isOpencodeSdk = provider === "opencode-sdk";

          let acpSessionId: string;

          if (isOpencodeSdk) {
            // OpenCode SDK session
            if (!isOpencodeServerConfigured()) {
              return jsonrpcResponse(id ?? null, null, {
                code: -32002,
                message: "Cannot auto-create session: OpenCode SDK not configured. Set OPENCODE_SERVER_URL environment variable.",
              });
            }

            acpSessionId = await manager.createOpencodeSdkSession(
              sessionId,
              forwardSessionUpdate
            );
          } else if (isClaudeCodeSdk) {
            // Claude Code SDK session
            if (!isClaudeCodeSdkConfigured()) {
              return jsonrpcResponse(id ?? null, null, {
                code: -32002,
                message: "Cannot auto-create session: Claude Code SDK not configured. Set ANTHROPIC_AUTH_TOKEN environment variable.",
              });
            }

            acpSessionId = await manager.createClaudeCodeSdkSession(
              sessionId,
              cwd,
              forwardSessionUpdate
            );
          } else if (isClaudeCode) {
            // Claude Code CLI session
            const mcpConfigs = buildMcpConfigForClaude(workspaceId);
            acpSessionId = await manager.createClaudeSession(
              sessionId,
              cwd,
              forwardSessionUpdate,
              mcpConfigs,
              undefined, // modeId
              role,
            );
          } else {
            // Standard ACP session
            acpSessionId = await manager.createSession(
              sessionId,
              cwd,
              forwardSessionUpdate,
              provider,
              undefined, // modeId
              undefined, // extraArgs
              undefined, // extraEnv
              workspaceId,
            );
          }

          // Persist session for UI listing
          const now = new Date();
          store.upsertSession({
            sessionId,
            cwd,
            workspaceId,
            routaAgentId: acpSessionId,
            provider,
            role,
            createdAt: now.toISOString(),
          });

          // Also persist to database (SQLite in dev, Postgres in serverless)
          await persistSessionToDb({
            id: sessionId,
            cwd,
            workspaceId,
            routaAgentId: acpSessionId,
            provider,
            role,
          });

          console.log(`[ACP Route] Auto-created session: ${sessionId} (provider: ${provider}, agent session: ${acpSessionId})`);

          // Trace: session_start
          const sessionStartTrace = withMetadata(
            withMetadata(
              withWorkspaceId(
                createTraceRecord(sessionId, "session_start", { provider }),
                workspaceId
              ),
              "cwd", cwd
            ),
            "role", role
          );
          recordTrace(cwd, sessionStartTrace);
        } catch (err) {
          console.error(`[ACP Route] Failed to auto-create session:`, err);
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: `Failed to auto-create session: ${err instanceof Error ? err.message : "Unknown error"}`,
          });
        }
      }

      // Check if this is a ROUTA coordinator session - inject coordinator context
      const orchestrator = getRoutaOrchestrator();
      if (orchestrator) {
        const sessionRecord = store.getSession(sessionId);
        if (sessionRecord?.routaAgentId) {
          const system = getRoutaSystem();
          const agent = await system.agentStore.get(sessionRecord.routaAgentId);
          if (agent?.role === AgentRole.ROUTA) {
            // First prompt for this coordinator - wrap with coordinator context
            const isFirstPrompt = !sessionRecord.firstPromptSent;
            if (isFirstPrompt) {
              promptText = buildCoordinatorPrompt({
                agentId: agent.id,
                workspaceId: sessionRecord.workspaceId || "default",
                userRequest: promptText,
              });
              store.markFirstPromptSent(sessionId);
            }
          }
        }
      }

      // ── Store user message in history before sending ────────────────
      store.pushUserMessage(sessionId, promptText);

      // ── Trace: user_message ─────────────────────────────────────────
      const sessionRecord = store.getSession(sessionId);
      const userMsgTrace = withConversation(
        createTraceRecord(sessionId, "user_message", { provider: sessionRecord?.provider ?? "unknown" }),
        {
          role: "user",
          contentPreview: promptText.slice(0, 200),
        }
      );
      recordTrace(sessionRecord?.cwd ?? process.cwd(), userMsgTrace);

      // ── OpenCode SDK session (serverless) ──────────────────────────
      if (manager.isOpencodeAdapterSession(sessionId) || await manager.isOpencodeSdkSessionAsync(sessionId)) {
        const opcAdapter = await manager.getOrRecreateOpencodeSdkAdapter(
          sessionId,
          forwardSessionUpdate
        );

        if (!opcAdapter) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: `No OpenCode SDK adapter for session: ${sessionId}`,
          });
        }

        if (!opcAdapter.alive) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: "OpenCode SDK adapter is not connected",
          });
        }

        // Return streaming SSE response
        // Enter streaming mode so pushNotification() skips the persistent SSE
        // EventSource channel — events are already delivered via this response body.
        store.enterStreamingMode(sessionId);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of opcAdapter.promptStream(promptText, sessionId, skillContent, sessionRecord?.workspaceId ?? undefined)) {
                controller.enqueue(encoder.encode(event));
              }
              store.flushAgentBuffer(sessionId);
              store.exitStreamingMode(sessionId);
              controller.close();
            } catch (err) {
              store.flushAgentBuffer(sessionId);
              store.exitStreamingMode(sessionId);
              const errorNotification = {
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId,
                  type: "error",
                  error: { message: err instanceof Error ? err.message : "OpenCode SDK prompt failed" },
                },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorNotification)}\n\n`));
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // ── Claude Code SDK session (serverless) ────────────────────────
      // Use async version to check database in serverless cold starts
      if (await manager.isClaudeCodeSdkSessionAsync(sessionId)) {
        // Use getOrRecreate to handle serverless cold starts - recreate adapter if needed
        const adapter = await manager.getOrRecreateClaudeCodeSdkAdapter(
          sessionId,
          forwardSessionUpdate
        );

        if (!adapter) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: `No Claude Code SDK adapter for session: ${sessionId}`,
          });
        }

        if (!adapter.alive) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: "Claude Code SDK adapter is not connected",
          });
        }

        // Return streaming SSE response to prevent serverless timeout
        // Each event is sent immediately as it's received from the SDK
        // Pass the ACP sessionId so notifications match what client expects
        // Pass skill content as appendSystemPrompt for proper skill integration
        // Enter streaming mode so pushNotification() skips the persistent SSE
        // EventSource channel — events are already delivered via this response body.
        store.enterStreamingMode(sessionId);
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              for await (const event of adapter.promptStream(promptText, sessionId, skillContent)) {
                controller.enqueue(encoder.encode(event));
              }
              store.flushAgentBuffer(sessionId);
              store.exitStreamingMode(sessionId);
              controller.close();
            } catch (err) {
              store.flushAgentBuffer(sessionId);
              store.exitStreamingMode(sessionId);
              // Send error event before closing
              const errorNotification = {
                jsonrpc: "2.0",
                method: "session/update",
                params: {
                  sessionId,
                  type: "error",
                  error: { message: err instanceof Error ? err.message : "Claude Code SDK prompt failed" },
                },
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorNotification)}\n\n`));
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      }

      // ── Claude Code CLI session ───────────────────────────────────────
      if (manager.isClaudeSession(sessionId)) {
        const claudeProc = manager.getClaudeProcess(sessionId);
        if (!claudeProc) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: `No Claude Code process for session: ${sessionId}`,
          });
        }

        if (!claudeProc.alive) {
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: "Claude Code process is not running",
          });
        }

        try {
          const result = await claudeProc.prompt(sessionId, promptText);
          // Flush any remaining buffered agent chunks for tracing
          store.flushAgentBuffer(sessionId);
          return jsonrpcResponse(id ?? null, result);
        } catch (err) {
          store.flushAgentBuffer(sessionId); // Flush even on error
          return jsonrpcResponse(id ?? null, null, {
            code: -32000,
            message: err instanceof Error ? err.message : "Claude Code prompt failed",
          });
        }
      }

      // ── Standard ACP session ────────────────────────────────────────
      const proc = manager.getProcess(sessionId);
      const acpSessionId = manager.getAcpSessionId(sessionId);

      if (!proc || !acpSessionId) {
        return jsonrpcResponse(id ?? null, null, {
          code: -32000,
          message: `No ACP agent process for session: ${sessionId}`,
        });
      }

      if (!proc.alive) {
        const presetId = manager.getPresetId(sessionId) ?? "unknown";
        return jsonrpcResponse(id ?? null, null, {
          code: -32000,
          message: `ACP agent (${presetId}) process is not running`,
        });
      }

      try {
        // Forward to agent (responses stream via session/update → SSE)
        const result = await proc.prompt(acpSessionId, promptText);
        // Flush any remaining buffered agent chunks for tracing
        store.flushAgentBuffer(sessionId);
        return jsonrpcResponse(id ?? null, result);
      } catch (err) {
        store.flushAgentBuffer(sessionId); // Flush even on error
        return jsonrpcResponse(id ?? null, null, {
          code: -32000,
          message: err instanceof Error ? err.message : "Prompt failed",
        });
      }
    }

    // ── session/cancel ─────────────────────────────────────────────────
    if (method === "session/cancel") {
      const p = (params ?? {}) as Record<string, unknown>;
      const sessionId = p.sessionId as string;

      if (sessionId) {
        const manager = getAcpProcessManager();
        const store = getHttpSessionStore();

        // Check if OpenCode SDK session
        if (manager.isOpencodeAdapterSession(sessionId)) {
          const opcAdapter = manager.getOpencodeAdapter(sessionId);
          if (opcAdapter) {
            opcAdapter.cancel();
          }
        }
        // Check if Claude Code SDK session
        else if (manager.isClaudeCodeSdkSession(sessionId)) {
          // Try to get existing adapter, or recreate for cancel (though cancel is less critical)
          const adapter = await manager.getOrRecreateClaudeCodeSdkAdapter(
            sessionId,
            createSessionUpdateForwarder(store, sessionId)
          );
          if (adapter) {
            adapter.cancel();
          }
        }
        // Check if Claude Code CLI session
        else if (manager.isClaudeSession(sessionId)) {
          const claudeProc = manager.getClaudeProcess(sessionId);
          if (claudeProc) {
            await claudeProc.cancel();
          }
        } else {
          const proc = manager.getProcess(sessionId);
          const acpSessionId = manager.getAcpSessionId(sessionId);
          if (proc && acpSessionId) {
            await proc.cancel(acpSessionId);
          }
        }
      }

      return jsonrpcResponse(id ?? null, {});
    }

    // ── session/load ───────────────────────────────────────────────────
    if (method === "session/load") {
      return jsonrpcResponse(id ?? null, null, {
        code: -32601,
        message: "session/load not supported - create a new session instead",
      });
    }

    // ── session/set_mode ───────────────────────────────────────────────
    if (method === "session/set_mode") {
      const p = (params ?? {}) as Record<string, unknown>;
      const sessionId = p.sessionId as string | undefined;
      const modeId = (p.modeId as string | undefined) ?? (p.mode as string | undefined);
      if (!sessionId || !modeId) {
        return jsonrpcResponse(id ?? null, null, {
          code: -32602,
          message: "Missing sessionId or modeId",
        });
      }
      const manager = getAcpProcessManager();
      const store = getHttpSessionStore();
      try {
        await manager.setSessionMode(sessionId, modeId);
        store.updateSessionMode(sessionId, modeId);
        // Push a mode update so UI can immediately reflect the change.
        store.pushNotification({
          sessionId,
          update: {
            sessionUpdate: "current_mode_update",
            currentModeId: modeId,
          },
        } as never);
      } catch (err) {
        return jsonrpcResponse(id ?? null, null, {
          code: -32000,
          message: err instanceof Error ? err.message : "Failed to set mode",
        });
      }
      return jsonrpcResponse(id ?? null, {});
    }

    // ── Extension methods ──────────────────────────────────────────────

    // _providers/list - List available ACP agent presets with install status
    // Merges static presets with dynamically-loaded ACP Registry agents.
    if (method === "_providers/list") {
      const allPresets = [...getStandardPresets()];
      const claudePreset = getPresetById("claude");
      if (claudePreset) allPresets.push(claudePreset);

      type ProviderEntry = {
        id: string;
        name: string;
        description: string;
        command: string;
        status: "available" | "unavailable";
        source: "static" | "registry";
      };

      // Check which static preset commands are installed in parallel
      const staticProviders: ProviderEntry[] = await Promise.all(
        allPresets.map(async (p): Promise<ProviderEntry> => {
          const cmd = resolveCommand(p);
          const resolved = await which(cmd);
          return {
            id: p.id,
            name: p.name,
            description: p.description,
            command: p.command,
            status: resolved ? "available" : "unavailable",
            source: "static",
          };
        })
      );

      // Merge registry agents (including those that overlap with static presets)
      // For overlapping agents, use a different ID to allow both versions to coexist
      const staticIds = new Set(staticProviders.map((p) => p.id));
      try {
        const registry = await fetchRegistry();
        const npxPath = await which("npx");
        const uvxPath = await which("uv");
        const platform = detectPlatformTarget();

        for (const agent of registry.agents) {
          const dist = agent.distribution;
          let command = "";
          let status: "available" | "unavailable" = "unavailable";

          if (dist.npx && npxPath) {
            command = `npx ${dist.npx.package}`;
            status = "available";
          } else if (dist.uvx && uvxPath) {
            command = `uvx ${dist.uvx.package}`;
            status = "available";
          } else if (dist.binary && platform && dist.binary[platform]) {
            command = dist.binary[platform]!.cmd ?? agent.id;
            status = "unavailable"; // binary needs install first
          } else if (dist.npx) {
            command = `npx ${dist.npx.package}`;
            status = "unavailable";
          } else if (dist.uvx) {
            command = `uvx ${dist.uvx.package}`;
            status = "unavailable";
          }

          // If this agent ID conflicts with a built-in preset, use a suffixed ID
          // to allow both versions to coexist in the UI
          const providerId = staticIds.has(agent.id) ? `${agent.id}-registry` : agent.id;
          const providerName = staticIds.has(agent.id) ? `${agent.name} (Registry)` : agent.name;

          staticProviders.push({
            id: providerId,
            name: providerName,
            description: agent.description,
            command,
            status,
            source: "registry",
          });
        }
      } catch (err) {
        console.warn("[ACP Route] Failed to fetch registry for providers:", err);
      }

      const providers = staticProviders;

      // Add OpenCode SDK as a provider option (available in any environment when configured)
      {
        const sdkConfigured = isOpencodeServerConfigured();
        providers.unshift({
          id: "opencode-sdk",
          name: "OpenCode SDK",
          description: sdkConfigured
            ? "OpenCode via SDK (configured)"
            : "OpenCode SDK (set OPENCODE_SERVER_URL or OPENCODE_API_KEY)",
          command: "sdk",
          status: sdkConfigured ? "available" : "unavailable",
          source: "static",
        });
      }

      // Sort: available first, then alphabetical
      providers.sort((a, b) => {
        if (a.status === b.status) return a.name.localeCompare(b.name);
        return a.status === "available" ? -1 : 1;
      });

      return jsonrpcResponse(id ?? null, { providers });
    }

    if (method.startsWith("_")) {
      return jsonrpcResponse(id ?? null, null, {
        code: -32601,
        message: `Extension method not supported: ${method}`,
      });
    }

    return jsonrpcResponse(id ?? null, null, {
      code: -32601,
      message: `Method not found: ${method}`,
    });
  } catch (error) {
    console.error("[ACP Route] Error:", error);

    // Handle AcpError with auth information
    if (error instanceof AcpError) {
      return jsonrpcResponse(null, null, {
        code: error.code,
        message: error.message,
        authMethods: error.authMethods,
        agentInfo: error.agentInfo,
      });
    }

    return jsonrpcResponse(null, null, {
      code: -32603,
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

interface JsonRpcError {
  code: number;
  message: string;
  authMethods?: Array<{ id: string; name: string; description: string }>;
  agentInfo?: { name: string; version: string };
}

function createSessionUpdateForwarder(
  store: ReturnType<typeof getHttpSessionStore>,
  sessionId: string,
) {
  return (msg: { method?: string; params?: Record<string, unknown> }) => {
    if (msg.method !== "session/update" || !msg.params) return;

    const params = msg.params as Record<string, unknown>;
    const notification = {
      ...params,
      sessionId,
    } as SessionUpdateNotification;

    const renamedTitle = extractSetAgentNameTitle(notification);
    if (renamedTitle) {
      void renameSessionFromToolCall(store, sessionId, renamedTitle);
    }

    store.pushNotification(notification);
  };
}

function extractSetAgentNameTitle(notification: SessionUpdateNotification): string | undefined {
  const update = notification.update as Record<string, unknown> | undefined;
  if (!update) return undefined;

  const sessionUpdate = update.sessionUpdate as string | undefined;
  if (!sessionUpdate || !sessionUpdate.startsWith("tool_call")) return undefined;

  const candidates = [
    update.kind,
    update.title,
    update.toolName,
  ]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase());

  const isSetAgentNameCall = candidates.some((c) =>
    c.includes("set_agent_name") || c.includes("set agent name")
  );
  if (!isSetAgentNameCall) return undefined;

  const rawInput =
    typeof update.rawInput === "object" && update.rawInput !== null
      ? (update.rawInput as Record<string, unknown>)
      : undefined;
  const rawName = rawInput?.name;

  if (typeof rawName !== "string") return undefined;
  return normalizeAgentSessionTitle(rawName);
}

function normalizeAgentSessionTitle(rawName: string): string | undefined {
  const trimmed = rawName.trim().replace(/\s+/g, " ");
  if (!trimmed) return undefined;

  const words = trimmed.split(" ").slice(0, 5);
  const normalized = words.join(" ").slice(0, 80).trim();
  return normalized || undefined;
}

async function renameSessionFromToolCall(
  store: ReturnType<typeof getHttpSessionStore>,
  sessionId: string,
  name: string,
): Promise<void> {
  const existing = store.getSession(sessionId);
  if (!existing) return;
  if (existing.name === name) return;

  const renamed = store.renameSession(sessionId, name);
  if (!renamed) return;

  await renameSessionInDb(sessionId, name);

  store.pushNotification({
    sessionId,
    update: {
      sessionUpdate: "session_renamed",
      name,
    },
  });
}

function jsonrpcResponse(
  id: string | number | null,
  result: unknown,
  error?: JsonRpcError
) {
  if (error) {
    return NextResponse.json({ jsonrpc: "2.0", id, error });
  }
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

/**
 * Build MCP configuration JSON for Claude Code.
 * Injects the routa-mcp server so Claude Code can use Routa coordination tools.
 *
 * Claude Code accepts --mcp-config with an inline JSON object.
 * We reuse the shared provider setup path to avoid config drift.
 */
function buildMcpConfigForClaude(workspaceId?: string): string[] {
  // Keep Claude MCP setup consistent with all other providers.
  // Pass workspace ID so it's embedded in the MCP endpoint URL (?wsId=...)
  // allowing the MCP server to bind the session to the correct workspace.
  const config = workspaceId ? getDefaultRoutaMcpConfig(workspaceId) : undefined;
  const result = ensureMcpForProvider("claude", config);
  console.log(`[ACP Route] MCP config for Claude Code: ${result.summary}`);
  return result.mcpConfigs;
}
