/**
 * Provider Adapter Types
 *
 * Defines the unified message format that all ACP providers normalize to.
 * This abstraction allows different providers (Claude Code, OpenCode, Kimi, etc.)
 * to be handled uniformly by the core system.
 */

/**
 * Supported provider types.
 * Each provider may have different message formats and timing behaviors.
 */
export type ProviderType =
  | "claude"      // Claude Code - uses stream-json protocol
  | "opencode"    // OpenCode - standard ACP with deferred rawInput
  | "kimi"        // Kimi - standard ACP
  | "gemini"      // Gemini - standard ACP
  | "copilot"     // GitHub Copilot - standard ACP
  | "codex"       // OpenAI Codex - standard ACP
  | "auggie"      // Augment Code - standard ACP
  | "kiro"        // Amazon Kiro - standard ACP
  | "standard";   // Generic standard ACP

/**
 * Normalized session update event types.
 * These are the canonical event types used internally.
 */
export type NormalizedEventType =
  | "tool_call"           // Tool invocation started
  | "tool_call_update"    // Tool execution progress/completion
  | "agent_message"       // Agent text message (chunk or complete)
  | "agent_thought"       // Agent thinking/reasoning
  | "user_message"        // User input
  | "plan_update"         // Agent execution plan updated
  | "turn_complete"       // Turn ended
  | "error";              // Error occurred

/**
 * Normalized tool call information.
 * All providers must convert their tool call data to this format.
 */
export interface NormalizedToolCall {
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Tool name (normalized) */
  name: string;
  /** Display title */
  title?: string;
  /** Execution status */
  status: "pending" | "running" | "completed" | "failed";
  /** Tool input parameters - may be populated later for some providers */
  input?: Record<string, unknown>;
  /** Tool output (for completed calls) */
  output?: unknown;
  /** Whether input is finalized (false = may be updated later) */
  inputFinalized: boolean;
}

/**
 * Normalized session update message.
 * This is the unified format that all providers convert to.
 */
export interface NormalizedSessionUpdate {
  /** Session identifier */
  sessionId: string;
  /** Provider that generated this update */
  provider: ProviderType;
  /** Event type */
  eventType: NormalizedEventType;
  /** Timestamp */
  timestamp: Date;

  // Event-specific data (only one should be present based on eventType)

  /** Tool call data (for tool_call and tool_call_update) */
  toolCall?: NormalizedToolCall;
  /** Message content (for agent_message, agent_thought, user_message) */
  message?: {
    role: "user" | "assistant";
    content: string;
    isChunk: boolean;
  };
  /** Turn completion info */
  turnComplete?: {
    stopReason: string;
    usage?: { inputTokens?: number; outputTokens?: number };
  };
  /** Plan update items (for plan_update) */
  planItems?: Array<{ description: string; status: string }>;
  /** Error info */
  error?: {
    code: string;
    message: string;
  };

  /** Original raw notification (for debugging/passthrough) */
  rawNotification?: unknown;
}

/**
 * Provider behavior configuration.
 * Describes how a provider sends messages.
 */
export interface ProviderBehavior {
  /** Provider type */
  type: ProviderType;
  /**
   * Whether tool_call events include rawInput immediately.
   * - true: rawInput is in tool_call (Claude Code)
   * - false: rawInput comes in tool_call_update (OpenCode)
   */
  immediateToolInput: boolean;
  /**
   * Whether the provider uses streaming (chunks).
   */
  streaming: boolean;
}

/**
 * Provider adapter interface.
 * Each provider implements this to normalize its messages.
 */
export interface IProviderAdapter {
  /** Get provider behavior configuration */
  getBehavior(): ProviderBehavior;

  /**
   * Normalize a raw notification to the unified format.
   * May return null if the notification should be skipped.
   * May return multiple messages if one raw notification maps to multiple normalized events.
   */
  normalize(
    sessionId: string,
    rawNotification: unknown
  ): NormalizedSessionUpdate | NormalizedSessionUpdate[] | null;

  /**
   * Handle a tool_call_update that may contain deferred input.
   * Returns the updated tool call if input was populated, null otherwise.
   * This is used by providers that send rawInput in updates rather than initial calls.
   */
  handleDeferredInput?(
    toolCallId: string,
    update: unknown
  ): NormalizedToolCall | null;
}

/**
 * Provider adapter factory type.
 */
export type ProviderAdapterFactory = (provider: ProviderType) => IProviderAdapter;

