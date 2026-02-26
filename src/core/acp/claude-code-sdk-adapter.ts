/**
 * Claude Code Agent SDK Adapter for Serverless Environments (Vercel)
 *
 * Uses the official @anthropic-ai/claude-agent-sdk which spawns the bundled
 * cli.js and communicates via JSONL streams. This gives us the full Claude Code
 * agent loop (tools, multi-turn, etc.) while still being compatible with
 * Node.js serverless runtimes (e.g. Vercel Pro with 60s timeout).
 *
 * Requirements:
 * - ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY environment variable
 * - Node.js runtime (NOT Edge Runtime) — child_process.spawn must be available
 *
 * Configuration via environment variables:
 * - ANTHROPIC_BASE_URL: API endpoint (default: https://api.anthropic.com)
 * - ANTHROPIC_AUTH_TOKEN: API authentication token
 * - ANTHROPIC_MODEL: Model to use (default: claude-sonnet-4-20250514)
 * - API_TIMEOUT_MS: Request timeout in milliseconds (default: 55000)
 */

import type { NotificationHandler, JsonRpcMessage } from "@/core/acp/processer";
import { isServerlessEnvironment } from "@/core/acp/api-based-providers";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { join } from "path";

/**
 * Resolve the path to the Claude Code cli.js binary.
 *
 * The @anthropic-ai/claude-agent-sdk resolves cli.js relative to
 * import.meta.url inside its own bundled code. On Vercel, Next.js webpack
 * bundles the SDK's JS but does NOT copy cli.js to the bundle output, so the
 * auto-resolved path doesn't exist at runtime.
 *
 * We override it explicitly using process.cwd() which is:
 *   - `/var/task`   on Vercel (where node_modules are unpacked)
 *   - project root  in local dev / tests
 */
function resolveCliPath(): string {
  return join(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk/cli.js");
}

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

/**
 * Check if Claude Code SDK is configured
 */
export function isClaudeCodeSdkConfigured(): boolean {
  return !!(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/**
 * Get Claude Code SDK configuration from environment
 */
export function getClaudeCodeSdkConfig(): {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  timeoutMs: number;
} {
  return {
    apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    // Keep 5s below Vercel Pro 60s limit to allow clean shutdown
    timeoutMs: parseInt(process.env.API_TIMEOUT_MS || "55000", 10),
  };
}

/**
 * Claude Code SDK Adapter — wraps the official agent SDK to provide an
 * ACP-compatible streaming interface.
 */
export class ClaudeCodeSdkAdapter {
  private sessionId: string | null = null;
  private onNotification: NotificationHandler;
  private cwd: string;
  private _alive = false;
  private abortController: AbortController | null = null;
  /**
   * Tracks whether native stream_event text deltas have been dispatched during
   * the current prompt turn. Used to avoid double-dispatching text for backends
   * (like native Anthropic) that emit both stream_event and assistant messages.
   * GLM and similar providers only emit assistant messages, so when this is false
   * we fall back to dispatching text from the assistant message blocks.
   */
  private _hasSeenStreamTextDelta = false;

  constructor(cwd: string, onNotification: NotificationHandler) {
    this.cwd = cwd;
    this.onNotification = onNotification;
  }

  get alive(): boolean {
    return this._alive;
  }

  get acpSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Initialize the adapter — validates that credentials are present.
   */
  async connect(): Promise<void> {
    const config = getClaudeCodeSdkConfig();

    if (!config.apiKey) {
      throw new Error(
        "Claude Code SDK requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY environment variable"
      );
    }

    // Ensure env vars are visible to the cli.js child process
    process.env.ANTHROPIC_API_KEY = config.apiKey;
    if (config.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = config.baseUrl;
    }

    this.sessionId = `claude-sdk-${Date.now()}`;
    this._alive = true;
    console.log(`[ClaudeCodeSdkAdapter] Initialized with model: ${config.model}`);
    if (config.baseUrl) {
      console.log(`[ClaudeCodeSdkAdapter] Using custom API endpoint: ${config.baseUrl}`);
    }
  }

  /**
   * Create a session (API compatibility — SDK doesn't need explicit sessions)
   */
  async createSession(title?: string): Promise<string> {
    if (!this._alive) {
      throw new Error("Adapter not connected");
    }
    console.log(`[ClaudeCodeSdkAdapter] Session created: ${this.sessionId} (${title || "untitled"})`);
    return this.sessionId!;
  }

  /**
   * Send a prompt through the official Claude Code Agent SDK.
   * Streams ACP notifications for real-time UI updates.
   */
  async prompt(text: string): Promise<{
    stopReason: string;
    content?: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    if (!this._alive || !this.sessionId) {
      throw new Error("No active session");
    }

    const config = getClaudeCodeSdkConfig();
    this.abortController = new AbortController();
    this._hasSeenStreamTextDelta = false;
    const sessionId = this.sessionId;

    const maskedKey = config.apiKey
      ? `${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`
      : "undefined";
    console.log(
      `[ClaudeCodeSdkAdapter] Sending prompt: model=${config.model}, apiKey=${maskedKey}`
    );

    let stopReason = "end_turn";
    let fullContent = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      const stream = query({
        prompt: text,
        options: {
          cwd: this.cwd || process.cwd(),
          model: config.model,
          maxTurns: 30,
          abortController: this.abortController,
          // Allow the agent to execute tools without interactive permission prompts.
          // Required for autonomous operation in serverless environments.
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          // Explicitly point to cli.js so the SDK doesn't try to resolve it
          // relative to its own import.meta.url (which fails after webpack
          // bundling on Vercel because cli.js is not a statically-imported module
          // and gets stripped from the bundle output unless we force-include it
          // via outputFileTracingIncludes in next.config.ts).
          pathToClaudeCodeExecutable: resolveCliPath(),
        },
      });

      for await (const msg of stream) {
        if (this.abortController?.signal.aborted) {
          stopReason = "cancelled";
          break;
        }

        this.dispatchMessage(msg, sessionId);

        // Accumulate final text from completed assistant messages
        if (msg.type === "assistant") {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              fullContent += block.text;
            }
          }
          if (msg.message.usage) {
            inputTokens = msg.message.usage.input_tokens ?? inputTokens;
            outputTokens = msg.message.usage.output_tokens ?? outputTokens;
          }
        }

        if (msg.type === "result") {
          stopReason = msg.stop_reason ?? (msg.is_error ? "error" : "end_turn");
          if (msg.subtype === "success" && msg.result) {
            fullContent = msg.result;
          }
          if (msg.usage) {
            inputTokens = msg.usage.input_tokens ?? inputTokens;
            outputTokens = msg.usage.output_tokens ?? outputTokens;
          }
        }
      }
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ClaudeCodeSdkAdapter] Prompt failed:", errorMessage);
      this.onNotification(
        createNotification("session/update", {
          sessionId,
          type: "error",
          error: { message: errorMessage },
        })
      );
      throw error;
    } finally {
      this.abortController = null;
    }

    // Emit ACP turn_complete notification
    this.onNotification(
      createNotification("session/update", {
        sessionId,
        update: {
          sessionUpdate: "turn_complete",
          stopReason,
          usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          },
        },
      })
    );

    return {
      stopReason,
      content: fullContent,
      usage: { inputTokens, outputTokens },
    };
  }

  /**
   * Convert an SDKMessage to ACP session/update notifications.
   *
   * Message type mapping:
   *   stream_event (text_delta)      → agent_message_chunk  (real-time text)
   *   stream_event (thinking_delta)  → agent_thought_chunk  (CoT streaming)
   *   stream_event (tool_use start)  → tool_call            (tool starts)
   *   assistant (tool_use blocks)    → tool_call_update     (tool completes)
   *   result (error)                 → error notification
   */
  private dispatchMessage(msg: SDKMessage, sessionId: string): void {
    switch (msg.type) {
      case "stream_event": {
        const event = msg.event;

        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            this._hasSeenStreamTextDelta = true;
            this.onNotification(
              createNotification("session/update", {
                sessionId,
                update: {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: event.delta.text },
                },
              })
            );
          } else if (event.delta.type === "thinking_delta") {
            this.onNotification(
              createNotification("session/update", {
                sessionId,
                update: {
                  sessionUpdate: "agent_thought_chunk",
                  content: { type: "text", text: event.delta.thinking },
                },
              })
            );
          }
        } else if (
          event.type === "content_block_start" &&
          event.content_block.type === "tool_use"
        ) {
          this.onNotification(
            createNotification("session/update", {
              sessionId,
              update: {
                sessionUpdate: "tool_call",
                title: event.content_block.name,
                toolCallId: event.content_block.id,
                status: "running",
              },
            })
          );
        }
        break;
      }

      case "assistant": {
        // For backends that don't emit stream_event text deltas (e.g. GLM via
        // open.bigmodel.cn), dispatch text blocks as agent_message_chunk here.
        // Native Anthropic streams already emitted each delta via stream_event,
        // so we skip to avoid duplicating the complete text.
        if (!this._hasSeenStreamTextDelta) {
          for (const block of msg.message.content) {
            if (block.type === "text" && block.text) {
              this.onNotification(
                createNotification("session/update", {
                  sessionId,
                  update: {
                    sessionUpdate: "agent_message_chunk",
                    content: { type: "text", text: block.text },
                  },
                })
              );
            }
          }
        }
        // Emit tool completion updates for each tool_use block in the message
        for (const block of msg.message.content) {
          if (block.type === "tool_use") {
            this.onNotification(
              createNotification("session/update", {
                sessionId,
                update: {
                  sessionUpdate: "tool_call_update",
                  toolCallId: block.id,
                  title: block.name,
                  status: "completed",
                },
              })
            );
          }
        }
        break;
      }

      case "result": {
        if (msg.is_error || msg.subtype !== "success") {
          const errorText =
            msg.subtype === "error_max_turns"
              ? "Max turns reached"
              : msg.subtype === "error_max_budget_usd"
              ? "Budget limit exceeded"
              : "Agent execution error";
          this.onNotification(
            createNotification("session/update", {
              sessionId,
              type: "error",
              error: { message: errorText },
            })
          );
        }
        break;
      }

      default:
        break;
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
  }

  /**
   * Close the adapter and release all resources.
   */
  async close(): Promise<void> {
    this.cancel();
    this.sessionId = null;
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
 * Check if we should use the Claude Code SDK adapter
 */
export function shouldUseClaudeCodeSdkAdapter(): boolean {
  return isServerlessEnvironment() && isClaudeCodeSdkConfigured();
}

/**
 * Create a Claude Code SDK adapter if conditions are met
 */
export function createClaudeCodeSdkAdapterIfAvailable(
  cwd: string,
  onNotification: NotificationHandler
): ClaudeCodeSdkAdapter | null {
  if (!isClaudeCodeSdkConfigured()) return null;
  return new ClaudeCodeSdkAdapter(cwd, onNotification);
}
