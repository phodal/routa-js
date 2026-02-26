/**
 * Claude Agent SDK Adapter for Serverless Environments (Vercel)
 *
 * This adapter uses @anthropic-ai/claude-agent-sdk to interact with Claude
 * instead of spawning a local CLI process. This makes it compatible with
 * serverless platforms like Vercel.
 *
 * Requirements:
 * - ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY environment variable
 * - Optional: ANTHROPIC_BASE_URL for custom API endpoint (e.g., BigModel)
 *
 * Configuration via environment variables:
 * - ANTHROPIC_BASE_URL: API endpoint (default: https://api.anthropic.com)
 * - ANTHROPIC_AUTH_TOKEN: API authentication token
 * - ANTHROPIC_MODEL: Model to use (default: GLM-4.7 for BigModel)
 * - API_TIMEOUT_MS: Request timeout in milliseconds (default: 600000)
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

// Types from Claude Agent SDK - simplified for our use case
interface SDKStreamEvent {
  type: "stream_event";
  event: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;
    };
    content_block?: {
      type: string;
      id?: string;
      name?: string;
      input?: unknown;
    };
  };
  session_id: string;
}

interface SDKResultMessage {
  type: "result";
  subtype: "success" | "error" | "interrupted";
  result?: string;
  errors?: Array<{ message: string }>;
  session_id: string;
}

interface SDKSystemMessage {
  type: "system";
  subtype: "init" | "version";
  session_id: string;
}

type SDKMessage = SDKStreamEvent | SDKResultMessage | SDKSystemMessage | Record<string, unknown>;

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
    timeoutMs: parseInt(process.env.API_TIMEOUT_MS || "600000", 10),
  };
}

/**
 * Claude Code SDK Adapter - wraps the SDK to provide ACP-like interface
 */
export class ClaudeCodeSdkAdapter {
  private sessionId: string | null = null;
  private onNotification: NotificationHandler;
  private cwd: string;
  private _alive = false;
  private currentAbortController: AbortController | null = null;

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
   * Initialize the adapter
   */
  async connect(): Promise<void> {
    const config = getClaudeCodeSdkConfig();

    if (!config.apiKey) {
      throw new Error(
        "Claude Code SDK requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY environment variable"
      );
    }

    this.sessionId = `claude-sdk-${Date.now()}`;
    this._alive = true;
    console.log(`[ClaudeCodeSdkAdapter] Initialized with model: ${config.model}`);
    if (config.baseUrl) {
      console.log(`[ClaudeCodeSdkAdapter] Using custom API endpoint: ${config.baseUrl}`);
    }
  }

  /**
   * Create a session (for API compatibility - SDK doesn't need explicit session creation)
   */
  async createSession(title?: string): Promise<string> {
    if (!this._alive) {
      throw new Error("Adapter not connected");
    }
    console.log(`[ClaudeCodeSdkAdapter] Session created: ${this.sessionId} (${title || "untitled"})`);
    return this.sessionId!;
  }

  /**
   * Send a prompt and stream responses
   */
  async prompt(text: string): Promise<{ stopReason: string }> {
    if (!this._alive || !this.sessionId) {
      throw new Error("No active session");
    }

    const config = getClaudeCodeSdkConfig();
    this.currentAbortController = new AbortController();

    try {
      // Dynamic import to avoid bundling issues
      const { query } = await import("@anthropic-ai/claude-agent-sdk");

      // Build environment for the SDK
      const sdkEnv: Record<string, string | undefined> = {};
      if (config.baseUrl) {
        sdkEnv.ANTHROPIC_BASE_URL = config.baseUrl;
      }
      if (config.apiKey) {
        sdkEnv.ANTHROPIC_API_KEY = config.apiKey;
      }
      // Add additional model env vars if configured
      if (process.env.ANTHROPIC_SMALL_FAST_MODEL) {
        sdkEnv.ANTHROPIC_SMALL_FAST_MODEL = process.env.ANTHROPIC_SMALL_FAST_MODEL;
      }
      if (process.env.ANTHROPIC_DEFAULT_SONNET_MODEL) {
        sdkEnv.ANTHROPIC_DEFAULT_SONNET_MODEL = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL;
      }
      if (process.env.API_TIMEOUT_MS) {
        sdkEnv.API_TIMEOUT_MS = process.env.API_TIMEOUT_MS;
      }
      if (process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC) {
        sdkEnv.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC;
      }

      let stopReason = "end_turn";

      // Emit message start
      this.onNotification(createNotification("session/update", {
        sessionId: this.sessionId,
        type: "message_start",
        message: { role: "assistant" },
      }));

      // Use the SDK query function - it returns an AsyncGenerator<SDKMessage>
      const queryResult = query({
        prompt: text,
        options: {
          cwd: this.cwd,
          model: config.model,
          maxTurns: 100,
          permissionMode: "bypassPermissions",
          abortController: this.currentAbortController,
          env: sdkEnv,
        },
      });

      // Iterate over the async generator to handle messages
      for await (const msg of queryResult) {
        this.handleSdkMessage(msg as SDKMessage);

        // Check for result message to get stop reason
        if ((msg as SDKResultMessage).type === "result") {
          const resultMsg = msg as SDKResultMessage;
          if (resultMsg.subtype === "error") {
            stopReason = "error";
          } else if (resultMsg.subtype === "interrupted") {
            stopReason = "cancelled";
          } else {
            stopReason = "end_turn";
          }
        }
      }

      // Emit message end
      this.onNotification(createNotification("session/update", {
        sessionId: this.sessionId,
        type: "message_end",
        message: { role: "assistant", stop_reason: stopReason },
      }));

      return { stopReason };
    } catch (error) {
      if (this.currentAbortController?.signal.aborted) {
        return { stopReason: "cancelled" };
      }
      console.error("[ClaudeCodeSdkAdapter] Prompt failed:", error);
      this.onNotification(createNotification("session/update", {
        sessionId: this.sessionId,
        type: "error",
        error: { message: String(error) },
      }));
      throw error;
    } finally {
      this.currentAbortController = null;
    }
  }

  /**
   * Handle messages from the SDK
   */
  private handleSdkMessage(msg: SDKMessage): void {
    if (!this.sessionId) return;

    switch (msg.type) {
      case "stream_event":
        // Handle streaming events from the API
        this.handleStreamEvent(msg as SDKStreamEvent);
        break;

      case "result":
        // Final result from the SDK
        const resultMsg = msg as SDKResultMessage;
        if (resultMsg.result) {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "text_delta",
            delta: resultMsg.result,
          }));
        }
        if (resultMsg.errors && resultMsg.errors.length > 0) {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "error",
            error: { message: resultMsg.errors.map(e => e.message).join("; ") },
          }));
        }
        break;

      case "system":
        // System initialization message
        const sysMsg = msg as SDKSystemMessage;
        if (sysMsg.session_id) {
          this.sessionId = sysMsg.session_id;
        }
        break;

      default:
        // Other message types - log for debugging
        break;
    }
  }

  /**
   * Handle stream events from the SDK
   */
  private handleStreamEvent(msg: SDKStreamEvent): void {
    if (!this.sessionId) return;

    const { event } = msg;

    switch (event.type) {
      case "content_block_delta":
        // Text delta from the model
        if (event.delta?.type === "text_delta" && event.delta.text) {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "text_delta",
            delta: event.delta.text,
          }));
        }
        break;

      case "content_block_start":
        // New content block started
        if (event.content_block?.type === "tool_use") {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "tool_call",
            toolCall: {
              id: event.content_block.id,
              name: this.normalizeToolName(event.content_block.name || ""),
              input: event.content_block.input,
              state: "running",
            },
          }));
        }
        break;

      case "content_block_stop":
        // Content block finished
        break;

      case "message_start":
      case "message_delta":
      case "message_stop":
        // Message lifecycle events - handled at higher level
        break;

      default:
        break;
    }
  }

  /**
   * Normalize Claude tool names to UI-friendly identifiers
   */
  private normalizeToolName(name: string): string {
    const toolMap: Record<string, string> = {
      str_replace_editor: "edit",
      Read: "read",
      Write: "write",
      Edit: "edit",
      Bash: "bash",
      ListDir: "list_dir",
      Glob: "glob",
      Grep: "grep",
      Task: "task",
      WebFetch: "web_fetch",
      WebSearch: "web_search",
    };
    return toolMap[name] || name.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  }

  /**
   * Cancel the current operation
   */
  cancel(): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Close the adapter
   */
  async close(): Promise<void> {
    this.cancel();
    this.sessionId = null;
    this._alive = false;
  }

  /**
   * Kill/close the adapter (alias for close)
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
