/**
 * Claude API SDK Adapter for Serverless Environments (Vercel)
 *
 * This adapter uses @anthropic-ai/sdk to directly call the Anthropic Messages API
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
 * - ANTHROPIC_MODEL: Model to use (default: claude-sonnet-4-20250514)
 * - API_TIMEOUT_MS: Request timeout in milliseconds (default: 600000)
 */

import type { NotificationHandler, JsonRpcMessage } from "@/core/acp/processer";
import { isServerlessEnvironment } from "@/core/acp/api-based-providers";
import Anthropic from "@anthropic-ai/sdk";

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
   * Send a prompt and stream responses using direct Anthropic API
   */
  async prompt(text: string): Promise<{ stopReason: string }> {
    if (!this._alive || !this.sessionId) {
      throw new Error("No active session");
    }

    const config = getClaudeCodeSdkConfig();
    this.currentAbortController = new AbortController();

    // Debug: Log configuration (mask API key)
    const maskedKey = config.apiKey
      ? `${config.apiKey.substring(0, 8)}...${config.apiKey.substring(config.apiKey.length - 4)}`
      : "undefined";
    console.log(`[ClaudeCodeSdkAdapter] Config: baseUrl=${config.baseUrl}, model=${config.model}, apiKey=${maskedKey}`);

    try {
      // Create Anthropic client with custom configuration
      // BigModel and other providers may require x-api-key header instead of Authorization
      const isBigModel = config.baseUrl?.includes("bigmodel.cn") ?? false;
      console.log(`[ClaudeCodeSdkAdapter] isBigModel=${isBigModel}`);

      const client = new Anthropic({
        apiKey: config.apiKey,
        baseURL: config.baseUrl,
        timeout: config.timeoutMs,
        defaultHeaders: {
          // Explicitly set x-api-key header for BigModel compatibility
          "x-api-key": config.apiKey || "",
        },
      });

      let stopReason = "end_turn";

      // Emit message start
      this.onNotification(createNotification("session/update", {
        sessionId: this.sessionId,
        type: "message_start",
        message: { role: "assistant" },
      }));

      // Build conversation messages
      // For now, we only support single-turn conversations
      // TODO: Add conversation history support for multi-turn
      const messages: Anthropic.MessageParam[] = [
        { role: "user", content: text }
      ];

      // Use streaming API for real-time responses
      const stream = await client.messages.create({
        model: config.model,
        max_tokens: 8192,
        messages,
        stream: true,
      });

      // Process stream events
      for await (const event of stream) {
        if (this.currentAbortController?.signal.aborted) {
          stopReason = "cancelled";
          break;
        }

        this.handleStreamEvent(event);

        // Extract stop reason from message_delta event
        if (event.type === "message_delta" && event.delta) {
          const delta = event.delta as { stop_reason?: string };
          if (delta.stop_reason) {
            stopReason = delta.stop_reason;
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
   * Handle stream events from the Anthropic API
   */
  private handleStreamEvent(event: Anthropic.MessageStreamEvent): void {
    if (!this.sessionId) return;

    switch (event.type) {
      case "content_block_delta":
        // Text delta from the model
        if (event.delta.type === "text_delta") {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "text_delta",
            delta: event.delta.text,
          }));
        }
        break;

      case "content_block_start":
        // New content block started
        if (event.content_block.type === "tool_use") {
          this.onNotification(createNotification("session/update", {
            sessionId: this.sessionId,
            type: "tool_call",
            toolCall: {
              id: event.content_block.id,
              name: event.content_block.name,
              input: {},
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
