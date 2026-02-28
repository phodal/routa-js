/**
 * AgentEventBridge
 *
 * Stateful converter from NormalizedSessionUpdate (wire normalization layer)
 * to WorkspaceAgentEvent (semantic layer).
 *
 * One instance per session. Maintains tool call state so that block events
 * can be updated as tool calls progress (in_progress → completed/failed).
 *
 * Inspired by JetBrains AcpToA2UXConverter pattern.
 */

import type { NormalizedSessionUpdate, NormalizedToolCall } from "../provider-adapter/types";
import {
  type WorkspaceAgentEvent,
  type BlockStatus,
  type FileChange,
  type PlanItem,
  type PlanItemStatus,
  classifyToolKind,
  extractFilePaths,
  extractFileChanges,
} from "./types";

// ─── Internal State ───────────────────────────────────────────────────────────

interface TrackedToolCall {
  toolCallId: string;
  toolName: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: BlockStatus;
}

// ─── AgentEventBridge ─────────────────────────────────────────────────────────

export class AgentEventBridge {
  private readonly sessionId: string;
  /** Active tool calls tracked by toolCallId */
  private toolCalls = new Map<string, TrackedToolCall>();

  constructor(sessionId: string) {
    this.sessionId = sessionId;
  }

  /**
   * Convert a NormalizedSessionUpdate into zero or more WorkspaceAgentEvents.
   */
  process(update: NormalizedSessionUpdate): WorkspaceAgentEvent[] {
    const now = new Date();

    switch (update.eventType) {
      case "tool_call":
        return this.handleToolCall(update, now);

      case "tool_call_update":
        return this.handleToolCallUpdate(update, now);

      case "agent_message":
        return this.handleMessage(update, now);

      case "agent_thought":
        return this.handleThought(update, now);

      case "turn_complete":
        return this.handleTurnComplete(update, now);

      case "error":
        return this.handleError(update, now);

      // user_message: not emitted as a WorkspaceAgentEvent (it's input, not output)
      default:
        return [];
    }
  }

  /**
   * Emit an agent_started event. Call this when a session is first created.
   */
  started(provider: string): AgentEventBridge {
    // Stored for consumers that call process() — not emitted here since
    // the bridge is passive. Callers can emit this manually via makeStartedEvent().
    return this;
  }

  /**
   * Clean up internal state for this session.
   */
  cleanup(): void {
    this.toolCalls.clear();
  }

  // ─── Handlers ──────────────────────────────────────────────────────────────

  private handleToolCall(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    const { toolCall } = update;
    if (!toolCall) return [];

    const tracked: TrackedToolCall = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.name,
      title: toolCall.title,
      input: toolCall.input,
      output: toolCall.output,
      status: "in_progress",
    };
    this.toolCalls.set(toolCall.toolCallId, tracked);

    return [this.buildBlockEvent(tracked, now)];
  }

  private handleToolCallUpdate(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    const { toolCall } = update;
    if (!toolCall) return [];

    // Merge into tracked state
    const existing = this.toolCalls.get(toolCall.toolCallId);
    const tracked: TrackedToolCall = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.name || existing?.toolName || "unknown",
      title: toolCall.title ?? existing?.title,
      input: toolCall.input ?? existing?.input,
      output: toolCall.output ?? existing?.output,
      status: mapToolStatus(toolCall.status),
    };
    this.toolCalls.set(toolCall.toolCallId, tracked);

    const event = this.buildBlockEvent(tracked, now);

    // Clean up completed/failed tool calls
    if (tracked.status === "completed" || tracked.status === "failed") {
      this.toolCalls.delete(toolCall.toolCallId);
    }

    return [event];
  }

  private handleMessage(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    const { message } = update;
    if (!message) return [];

    return [
      {
        type: "message_block",
        sessionId: this.sessionId,
        role: message.role,
        content: message.content,
        isChunk: message.isChunk,
        timestamp: now,
      },
    ];
  }

  private handleThought(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    const { message } = update;
    if (!message) return [];

    return [
      {
        type: "thought_block",
        sessionId: this.sessionId,
        content: message.content,
        isChunk: message.isChunk,
        timestamp: now,
      },
    ];
  }

  private handleTurnComplete(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    const { turnComplete } = update;
    if (!turnComplete) return [];

    const events: WorkspaceAgentEvent[] = [];

    // Emit usage if present
    if (turnComplete.usage) {
      events.push({
        type: "usage_reported",
        sessionId: this.sessionId,
        usage: {
          inputTokens: turnComplete.usage.inputTokens,
          outputTokens: turnComplete.usage.outputTokens,
        },
        timestamp: now,
      });
    }

    events.push({
      type: "agent_completed",
      sessionId: this.sessionId,
      stopReason: turnComplete.stopReason,
      usage: turnComplete.usage
        ? {
            inputTokens: turnComplete.usage.inputTokens,
            outputTokens: turnComplete.usage.outputTokens,
          }
        : undefined,
      timestamp: now,
    });

    return events;
  }

  private handleError(update: NormalizedSessionUpdate, now: Date): WorkspaceAgentEvent[] {
    return [
      {
        type: "agent_failed",
        sessionId: this.sessionId,
        message: update.error?.message ?? "Unknown error",
        timestamp: now,
      },
    ];
  }

  // ─── Block Builder ─────────────────────────────────────────────────────────

  /**
   * Build the appropriate block event based on tool kind.
   */
  private buildBlockEvent(tracked: TrackedToolCall, now: Date): WorkspaceAgentEvent {
    const kind = classifyToolKind(tracked.toolName);

    switch (kind) {
      case "mcp":
        return {
          type: "mcp_block",
          sessionId: this.sessionId,
          toolCallId: tracked.toolCallId,
          toolName: tracked.toolName,
          status: tracked.status,
          input: tracked.input,
          output: tracked.output,
          timestamp: now,
        };

      case "read": {
        const files = extractFilePaths(tracked.toolName, tracked.input);
        return {
          type: "read_block",
          sessionId: this.sessionId,
          toolCallId: tracked.toolCallId,
          toolName: tracked.toolName,
          status: tracked.status,
          files,
          timestamp: now,
        };
      }

      case "edit": {
        const changes = extractFileChanges(tracked.toolName, tracked.input);
        return {
          type: "file_changes_block",
          sessionId: this.sessionId,
          toolCallId: tracked.toolCallId,
          toolName: tracked.toolName,
          status: tracked.status,
          changes,
          timestamp: now,
        };
      }

      case "execute": {
        const command = extractCommand(tracked.input);
        const output = typeof tracked.output === "string" ? tracked.output : undefined;
        return {
          type: "terminal_block",
          sessionId: this.sessionId,
          toolCallId: tracked.toolCallId,
          toolName: tracked.toolName,
          status: tracked.status,
          command,
          output,
          timestamp: now,
        };
      }

      default:
        return {
          type: "tool_call_block",
          sessionId: this.sessionId,
          toolCallId: tracked.toolCallId,
          toolName: tracked.toolName,
          title: tracked.title,
          status: tracked.status,
          input: tracked.input,
          output: tracked.output,
          timestamp: now,
        };
    }
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Create a plan_updated event from raw plan data.
 * Called by consumers that receive plan updates outside the normal tool_call flow.
 */
export function makePlanUpdatedEvent(
  sessionId: string,
  rawItems: Array<{ description?: string; status?: string }>
): WorkspaceAgentEvent {
  const items: PlanItem[] = rawItems.map((item) => ({
    description: item.description ?? "",
    status: mapPlanStatus(item.status),
  }));

  return {
    type: "plan_updated",
    sessionId,
    items,
    timestamp: new Date(),
  };
}

/**
 * Create an agent_started event.
 */
export function makeStartedEvent(sessionId: string, provider: string): WorkspaceAgentEvent {
  return {
    type: "agent_started",
    sessionId,
    provider,
    timestamp: new Date(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapToolStatus(status: NormalizedToolCall["status"]): BlockStatus {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "pending":
    case "running":
    default:
      return "in_progress";
  }
}

function mapPlanStatus(status?: string): PlanItemStatus {
  switch (status) {
    case "completed":
    case "done":
      return "done";
    case "failed":
    case "error":
      return "failed";
    case "in_progress":
      return "in_progress";
    case "canceled":
    case "cancelled":
      return "canceled";
    default:
      return "pending";
  }
}

function extractCommand(input?: Record<string, unknown>): string | undefined {
  if (!input) return undefined;
  const cmd = input.command ?? input.cmd ?? input.script ?? input.shell_command;
  return typeof cmd === "string" ? cmd : undefined;
}
