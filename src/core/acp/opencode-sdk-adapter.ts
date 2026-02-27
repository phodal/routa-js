/**
 * OpenCode SDK Adapter for Serverless Environments (Vercel)
 *
 * Uses the official @opencode-ai/sdk to connect to a remote OpenCode server
 * and communicate via REST API + Server-Sent Events (SSE). This gives us the
 * full OpenCode agent loop (tools, multi-turn, etc.) while being compatible
 * with Node.js serverless runtimes (e.g. Vercel Pro with 60s timeout).
 *
 * Architecture:
 *   1. Connect to remote OpenCode server (spawned separately, e.g. on a VPS)
 *   2. Create session via REST API
 *   3. Send prompts via promptAsync (fire-and-forget)
 *   4. Stream responses via SSE event subscription
 *   5. Map OpenCode events → ACP session/update notifications
 *
 * Requirements:
 * - A running OpenCode server (e.g., `opencode serve` on a VPS)
 * - Environment variable: OPENCODE_SERVER_URL (e.g., "http://your-server:4096")
 * - Optional: OPENCODE_MODEL (e.g., "anthropic/claude-sonnet-4-20250514")
 *
 * Configuration via environment variables:
 * - OPENCODE_SERVER_URL: Remote server endpoint (required)
 * - OPENCODE_MODEL: Model in "providerID/modelID" format (optional)
 * - OPENCODE_DIRECTORY: Project working directory on the server (optional)
 * - API_TIMEOUT_MS: Request timeout in milliseconds (default: 55000)
 */

import type { NotificationHandler, JsonRpcMessage } from "@/core/acp/processer";
import { isServerlessEnvironment } from "@/core/acp/api-based-providers";

/**
 * Helper to create a JSON-RPC notification message
 */
function createNotification(method: string, params: Record<string, unknown>): JsonRpcMessage {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}

// ─── Minimal type definitions matching @opencode-ai/sdk v2 ────────────────

interface OpencodeClient {
  session: {
    create: (opts?: Record<string, unknown>) => Promise<{ data: OpencodeSession }>;
    prompt: (opts: {
      sessionID: string;
      parts: Array<{ type: string; text?: string; [k: string]: unknown }>;
      model?: { providerID: string; modelID: string };
      system?: string;
      agent?: string;
    }) => Promise<SessionPromptResult>;
    promptAsync: (opts: {
      sessionID: string;
      parts: Array<{ type: string; text?: string; [k: string]: unknown }>;
      model?: { providerID: string; modelID: string };
      system?: string;
      agent?: string;
    }) => Promise<void>;
    abort: (opts: { sessionID: string }) => Promise<void>;
    delete: (opts: { sessionID: string }) => Promise<void>;
    get: (opts: { sessionID: string }) => Promise<{ data: OpencodeSession }>;
  };
  event: {
    subscribe: (opts?: { directory?: string }) => { stream: AsyncIterable<OpencodeEvent> };
  };
  global: {
    health: () => Promise<{ data: unknown }>;
  };
}

interface OpencodeSession {
  id: string;
  title: string;
  slug: string;
  directory: string;
  parentID?: string;
  time: { created: number; updated: number };
}

interface SessionPromptResult {
  data: {
    info: {
      id: string;
      sessionID: string;
      role: string;
      cost: number;
      tokens: {
        input: number;
        output: number;
        reasoning: number;
        cache: { read: number; write: number };
      };
      error?: { name: string; message: string };
    };
    parts: Array<OpencodePart>;
  };
}

interface OpencodePart {
  id: string;
  sessionID: string;
  messageID: string;
  type: string;
  text?: string;
  tool?: string;
  callID?: string;
  state?: {
    status: string;
    input?: Record<string, unknown>;
    output?: string;
    title?: string;
    error?: string;
  };
  [k: string]: unknown;
}

interface OpencodeEvent {
  type: string;
  properties: Record<string, unknown>;
}

/**
 * Check if OpenCode SDK mode is available
 */
export function isOpencodeServerConfigured(): boolean {
  return !!process.env.OPENCODE_SERVER_URL;
}

/**
 * Get the OpenCode server URL from environment
 */
export function getOpencodeServerUrl(): string | null {
  return process.env.OPENCODE_SERVER_URL || null;
}

/**
 * Get OpenCode SDK configuration from environment
 */
export function getOpencodeConfig(): {
  serverUrl: string | undefined;
  model: { providerID: string; modelID: string } | undefined;
  directory: string | undefined;
  timeoutMs: number;
} {
  const modelStr = process.env.OPENCODE_MODEL;
  let model: { providerID: string; modelID: string } | undefined;
  if (modelStr && modelStr.includes("/")) {
    const [providerID, ...rest] = modelStr.split("/");
    model = { providerID, modelID: rest.join("/") };
  }

  return {
    serverUrl: process.env.OPENCODE_SERVER_URL,
    model,
    directory: process.env.OPENCODE_DIRECTORY,
    timeoutMs: parseInt(process.env.API_TIMEOUT_MS || "55000", 10),
  };
}

/**
 * OpenCode SDK Adapter — wraps the official OpenCode SDK to provide an
 * ACP-compatible streaming interface for serverless environments.
 *
 * Session Continuity:
 * - Maintains OpenCode session ID for multi-turn conversations
 * - Uses promptAsync + SSE events for non-blocking streaming
 * - Maps OpenCode events to ACP agent_message_chunk / tool_call notifications
 */
export class OpencodeSdkAdapter {
  private client: OpencodeClient | null = null;
  /** Our ACP session ID (for notifications) */
  private sessionId: string | null = null;
  /** OpenCode server's session ID */
  private opencodeSessionId: string | null = null;
  private onNotification: NotificationHandler;
  private serverUrl: string;
  private _alive = false;
  private abortController: AbortController | null = null;

  constructor(serverUrl: string, onNotification: NotificationHandler) {
    this.serverUrl = serverUrl;
    this.onNotification = onNotification;
  }

  get alive(): boolean {
    return this._alive;
  }

  get acpSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Initialize connection to the OpenCode server
   */
  async connect(): Promise<void> {
    const config = getOpencodeConfig();

    try {
      // Dynamic import to avoid bundling issues when SDK is not installed
      const { createOpencodeClient } = await import("@opencode-ai/sdk/v2/client");

      this.client = createOpencodeClient({
        baseUrl: this.serverUrl,
        ...(config.directory ? { directory: config.directory } : {}),
      }) as unknown as OpencodeClient;

      // Test connection by health check
      await this.client.global.health();

      console.log(`[OpencodeSdkAdapter] Connected to OpenCode server at ${this.serverUrl}`);
      if (config.model) {
        console.log(`[OpencodeSdkAdapter] Using model: ${config.model.providerID}/${config.model.modelID}`);
      }
      this._alive = true;
    } catch (error) {
      console.error("[OpencodeSdkAdapter] Failed to connect:", error);
      throw new Error(`Failed to connect to OpenCode server at ${this.serverUrl}: ${error}`);
    }
  }

  /**
   * Create a new session on the remote OpenCode server
   */
  async createSession(title?: string): Promise<string> {
    if (!this.client) {
      throw new Error("Not connected to OpenCode server");
    }

    const response = await this.client.session.create({
      title: title || "Routa Session",
    });

    this.opencodeSessionId = response.data.id;
    this.sessionId = `opencode-sdk-${this.opencodeSessionId}`;
    this._alive = true;

    console.log(`[OpencodeSdkAdapter] Created session: ${this.opencodeSessionId}`);
    return this.sessionId;
  }

  /**
   * Send a prompt and return a streaming async generator of SSE events.
   * Each yielded string is a complete SSE event (data: JSON\n\n format).
   * This allows the HTTP response to stream in serverless environments.
   *
   * Uses promptAsync + SSE event subscription for real-time streaming.
   *
   * @param text - The prompt text
   * @param acpSessionId - The ACP session ID to use in notifications
   * @param skillContent - Optional skill content to inject via system prompt
   */
  async *promptStream(
    text: string,
    acpSessionId?: string,
    skillContent?: string,
  ): AsyncGenerator<string, void, unknown> {
    if (!this._alive || !this.client || !this.opencodeSessionId) {
      throw new Error("No active session");
    }

    const config = getOpencodeConfig();
    this.abortController = new AbortController();
    const sessionId = acpSessionId ?? this.sessionId!;
    const opcSessionId = this.opencodeSessionId;

    console.log(
      `[OpencodeSdkAdapter] promptStream: serverUrl=${this.serverUrl}, ` +
      `opcSession=${opcSessionId}, model=${config.model ? `${config.model.providerID}/${config.model.modelID}` : "default"}`
    );

    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = "end_turn";

    // Helper to format SSE event
    const formatSseEvent = (notification: JsonRpcMessage): string => {
      return `data: ${JSON.stringify(notification)}\n\n`;
    };

    try {
      // 1. Subscribe to SSE events BEFORE sending the prompt
      //    This ensures we don't miss any events
      const eventStream = this.client.event.subscribe();

      // 2. Send prompt asynchronously (returns immediately with 204)
      const promptBody: Record<string, unknown> = {
        sessionID: opcSessionId,
        parts: [{ type: "text" as const, text }],
      };
      if (config.model) {
        promptBody.model = config.model;
      }
      if (skillContent) {
        promptBody.system = skillContent;
      }

      // Fire prompt asynchronously
      await this.client.session.promptAsync(promptBody as Parameters<OpencodeClient["session"]["promptAsync"]>[0]);

      // 3. Consume SSE events and yield ACP notifications
      for await (const event of eventStream.stream) {
        if (this.abortController?.signal.aborted) {
          stopReason = "cancelled";
          break;
        }

        // Filter events for our session only
        const props = event.properties as Record<string, unknown>;
        const eventSessionId = (props.sessionID as string) ??
          ((props.info as Record<string, unknown>)?.sessionID as string) ??
          ((props.part as Record<string, unknown>)?.sessionID as string);

        if (eventSessionId && eventSessionId !== opcSessionId) {
          continue; // Skip events for other sessions
        }

        // Convert OpenCode event to ACP notification and yield
        const notification = this.createNotificationFromEvent(event, sessionId);
        if (notification) {
          this.onNotification(notification);
          yield formatSseEvent(notification);
        }

        // Track token usage from message.updated events
        if (event.type === "message.updated") {
          const info = props.info as Record<string, unknown> | undefined;
          if (info?.role === "assistant") {
            const tokens = info.tokens as Record<string, number> | undefined;
            if (tokens) {
              inputTokens = tokens.input ?? inputTokens;
              outputTokens = tokens.output ?? outputTokens;
            }
          }
        }

        // Session idle means the agent is done processing
        if (event.type === "session.idle") {
          if (eventSessionId === opcSessionId || !eventSessionId) {
            stopReason = "end_turn";
            break;
          }
        }

        // Session error
        if (event.type === "session.error") {
          const error = props.error as Record<string, unknown> | undefined;
          stopReason = "error";
          const errorNotification = createNotification("session/update", {
            sessionId,
            type: "error",
            error: { message: (error?.message as string) ?? "OpenCode session error" },
          });
          this.onNotification(errorNotification);
          yield formatSseEvent(errorNotification);
          break;
        }
      }

      // Yield turn_complete event
      const completeNotification = createNotification("session/update", {
        sessionId,
        update: {
          sessionUpdate: "turn_complete",
          stopReason,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        },
      });
      this.onNotification(completeNotification);
      yield formatSseEvent(completeNotification);

    } catch (error) {
      if (!this.abortController?.signal.aborted) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[OpencodeSdkAdapter] promptStream failed:", errorMessage);
        const errorNotification = createNotification("session/update", {
          sessionId,
          type: "error",
          error: { message: errorMessage },
        });
        this.onNotification(errorNotification);
        yield formatSseEvent(errorNotification);
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Send a prompt through the OpenCode SDK (blocking version).
   * Streams ACP notifications for real-time UI updates.
   * @deprecated Use promptStream() for serverless streaming
   */
  async prompt(
    text: string,
    model?: { providerID: string; modelID: string },
  ): Promise<{
    stopReason: string;
    content?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    if (!this._alive || !this.client || !this.opencodeSessionId) {
      throw new Error("No active session");
    }

    const config = getOpencodeConfig();
    const sessionId = this.sessionId!;
    const resolvedModel = model ?? config.model;

    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = "end_turn";

    try {
      // Use synchronous prompt (blocks until agent finishes)
      const result = await this.client.session.prompt({
        sessionID: this.opencodeSessionId,
        parts: [{ type: "text", text }],
        ...(resolvedModel ? { model: resolvedModel } : {}),
      });

      const { info, parts } = result.data;

      // Extract tokens
      if (info.tokens) {
        inputTokens = info.tokens.input ?? 0;
        outputTokens = info.tokens.output ?? 0;
      }

      // Check for errors
      if (info.error) {
        stopReason = "error";
        this.onNotification(createNotification("session/update", {
          sessionId,
          type: "error",
          error: { message: info.error.message },
        }));
      }

      // Dispatch parts as ACP notifications
      for (const part of parts) {
        const notification = this.createNotificationFromPart(part, sessionId);
        if (notification) {
          this.onNotification(notification);
        }
        if (part.type === "text" && part.text) {
          fullContent += part.text;
        }
      }

      // Emit turn_complete
      this.onNotification(createNotification("session/update", {
        sessionId,
        update: {
          sessionUpdate: "turn_complete",
          stopReason,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        },
      }));

      return {
        stopReason,
        content: fullContent,
        usage: { inputTokens, outputTokens },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[OpencodeSdkAdapter] Prompt failed:", errorMessage);
      this.onNotification(createNotification("session/update", {
        sessionId,
        type: "error",
        error: { message: errorMessage },
      }));
      throw error;
    }
  }

  /**
   * Convert an OpenCode SSE event to an ACP session/update notification.
   * Returns null if the event doesn't produce a notification.
   *
   * Event mapping:
   *   message.part.delta (text)  → agent_message_chunk  (real-time text)
   *   message.part.updated (text) → agent_message_chunk  (full text fallback)
   *   message.part.updated (tool) → tool_call / tool_call_update
   *   message.part.updated (reasoning) → agent_thought_chunk
   *   message.updated (assistant) → token usage tracking
   *   session.idle              → (triggers turn_complete externally)
   */
  private createNotificationFromEvent(event: OpencodeEvent, sessionId: string): JsonRpcMessage | null {
    const props = event.properties;

    switch (event.type) {
      // ── Streaming text delta (incremental) ──────────────────────────
      case "message.part.delta": {
        const delta = props.delta as string | undefined;
        const content = props.content as string | undefined;
        const field = props.field as string | undefined;
        const text = delta ?? content;

        if (text && field !== "reasoning") {
          return createNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text },
            },
          });
        }
        // Reasoning/thinking delta
        if (text && field === "reasoning") {
          return createNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text },
            },
          });
        }
        return null;
      }

      // ── Part created/updated (text, tool, reasoning) ────────────────
      case "message.part.updated": {
        const part = props.part as OpencodePart | undefined;
        if (!part) return null;
        return this.createNotificationFromPart(part, sessionId);
      }

      // ── Message updated (track tokens, detect errors) ──────────────
      case "message.updated": {
        const info = props.info as Record<string, unknown> | undefined;
        if (!info) return null;

        // Check for error in assistant message
        if (info.role === "assistant" && info.error) {
          const error = info.error as Record<string, unknown>;
          return createNotification("session/update", {
            sessionId,
            type: "error",
            error: { message: (error.message as string) ?? "Agent error" },
          });
        }
        return null;
      }

      // ── Session status changes ─────────────────────────────────────
      case "session.status": {
        const status = props.status as Record<string, string> | undefined;
        if (status?.type === "busy") {
          // Agent started working - could send a status notification
          return null;
        }
        return null;
      }

      // ── File edits (useful for tracking) ───────────────────────────
      case "file.edited": {
        const file = props.file as string | undefined;
        if (file) {
          return createNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "tool_call_update",
              toolCallId: `file-edit-${Date.now()}`,
              title: `Edit: ${file}`,
              status: "completed",
            },
          });
        }
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Convert an OpenCode Part object to an ACP notification.
   */
  private createNotificationFromPart(part: OpencodePart, sessionId: string): JsonRpcMessage | null {
    switch (part.type) {
      case "text": {
        if (part.text) {
          return createNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: part.text },
            },
          });
        }
        return null;
      }

      case "reasoning": {
        const text = part.text;
        if (text) {
          return createNotification("session/update", {
            sessionId,
            update: {
              sessionUpdate: "agent_thought_chunk",
              content: { type: "text", text },
            },
          });
        }
        return null;
      }

      case "tool": {
        const state = part.state;
        if (!state) return null;

        const toolCallId = part.callID ?? part.id;
        const toolName = part.tool ?? "unknown";

        switch (state.status) {
          case "pending":
            return createNotification("session/update", {
              sessionId,
              update: {
                sessionUpdate: "tool_call",
                title: toolName,
                toolCallId,
                status: "running",
                rawInput: state.input,
              },
            });

          case "running":
            return createNotification("session/update", {
              sessionId,
              update: {
                sessionUpdate: "tool_call",
                title: state.title ?? toolName,
                toolCallId,
                status: "running",
                rawInput: state.input,
              },
            });

          case "completed":
            return createNotification("session/update", {
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                title: state.title ?? toolName,
                toolCallId,
                status: "completed",
                rawInput: state.input,
                rawOutput: state.output,
              },
            });

          case "error":
            return createNotification("session/update", {
              sessionId,
              update: {
                sessionUpdate: "tool_call_update",
                title: toolName,
                toolCallId,
                status: "completed",
                rawOutput: state.error ?? "Tool execution failed",
              },
            });

          default:
            return null;
        }
      }

      case "step-start":
        return null;

      case "step-finish": {
        // step-finish contains cost/token info - could track
        return null;
      }

      default:
        return null;
    }
  }

  /**
   * Cancel the in-progress prompt.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Also abort on the server side
    if (this.client && this.opencodeSessionId) {
      this.client.session.abort({ sessionID: this.opencodeSessionId }).catch(() => {});
    }
  }

  /**
   * Close the session and disconnect.
   */
  async close(): Promise<void> {
    this.cancel();
    if (this.client && this.opencodeSessionId) {
      try {
        await this.client.session.delete({ sessionID: this.opencodeSessionId });
      } catch {
        // Ignore cleanup errors
      }
    }
    this.sessionId = null;
    this.opencodeSessionId = null;
    this.client = null;
    this._alive = false;
  }

  /**
   * Synchronous alias for close (used by process-exit handlers).
   */
  kill(): void {
    this.close().catch(() => {});
  }
}

/**
 * Check if we should use the OpenCode SDK adapter
 */
export function shouldUseOpencodeAdapter(): boolean {
  return isServerlessEnvironment() && isOpencodeServerConfigured();
}

/**
 * Create an OpenCode SDK adapter if conditions are met
 */
export function createOpencodeAdapterIfAvailable(
  onNotification: NotificationHandler
): OpencodeSdkAdapter | null {
  const serverUrl = getOpencodeServerUrl();
  if (!serverUrl) return null;

  return new OpencodeSdkAdapter(serverUrl, onNotification);
}

