/**
 * OpenCode Provider Adapter
 *
 * Handles OpenCode's ACP protocol messages.
 * OpenCode sends rawInput in tool_call_update events (deferred).
 */

import { BaseProviderAdapter } from "./base-adapter";
import type {
  NormalizedSessionUpdate,
  NormalizedToolCall,
  ProviderBehavior,
} from "./types";

/**
 * Adapter for OpenCode provider.
 *
 * Characteristics:
 * - Uses standard ACP protocol
 * - rawInput is empty in tool_call, arrives in tool_call_update
 * - Supports streaming
 */
export class OpenCodeAdapter extends BaseProviderAdapter {
  constructor() {
    super("opencode");
  }

  getBehavior(): ProviderBehavior {
    return {
      type: "opencode",
      immediateToolInput: false, // OpenCode sends input in updates
      streaming: true,
    };
  }

  normalize(
    sessionId: string,
    rawNotification: unknown
  ): NormalizedSessionUpdate | NormalizedSessionUpdate[] | null {
    const updateType = this.getSessionUpdateType(rawNotification);
    if (!updateType) return null;

    const payload = this.getUpdatePayload(rawNotification);

    switch (updateType) {
      case "tool_call": {
        const toolCallId = payload.toolCallId as string | undefined;
        const kind = payload.kind as string | undefined;
        const title = payload.title as string | undefined;
        const rawInput = payload.rawInput as Record<string, unknown> | undefined;

        if (!toolCallId) return null;

        // Check if input is present and non-empty
        const hasInput = rawInput && Object.keys(rawInput).length > 0;

        const update = this.createUpdate(sessionId, "tool_call", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: "running",
          input: rawInput,
          // Input is NOT finalized if empty (will come in update)
          inputFinalized: hasInput,
        });
        return update;
      }

      case "tool_call_update": {
        const toolCallId = payload.toolCallId as string | undefined;
        const kind = payload.kind as string | undefined;
        const title = payload.title as string | undefined;
        const rawInput = payload.rawInput as Record<string, unknown> | undefined;
        const rawOutput = payload.rawOutput;
        const status = payload.status as string | undefined;

        if (!toolCallId) return null;

        const hasInput = rawInput && Object.keys(rawInput).length > 0;
        const isComplete = status === "completed" || status === "failed" || rawOutput !== undefined;

        const update = this.createUpdate(sessionId, "tool_call_update", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: this.mapStatus(status, isComplete),
          input: rawInput, // May contain deferred input
          output: rawOutput,
          inputFinalized: hasInput || isComplete,
        });
        return update;
      }

      case "agent_message_chunk": {
        const content = payload.content as { type?: string; text?: string } | undefined;
        const text = content?.text ?? "";

        const update = this.createUpdate(sessionId, "agent_message", rawNotification);
        update.message = {
          role: "assistant",
          content: text,
          isChunk: true,
        };
        return update;
      }

      case "agent_thought_chunk": {
        const content = payload.content as { type?: string; text?: string } | undefined;
        const text = content?.text ?? "";

        const update = this.createUpdate(sessionId, "agent_thought", rawNotification);
        update.message = {
          role: "assistant",
          content: text,
          isChunk: true,
        };
        return update;
      }

      case "user_message": {
        const content = payload.content as { type?: string; text?: string } | undefined;
        const text = content?.text ?? (payload.text as string) ?? "";

        const update = this.createUpdate(sessionId, "user_message", rawNotification);
        update.message = {
          role: "user",
          content: text,
          isChunk: false,
        };
        return update;
      }

      case "turn_complete": {
        const stopReason = payload.stopReason as string | undefined;
        const update = this.createUpdate(sessionId, "turn_complete", rawNotification);
        update.turnComplete = {
          stopReason: stopReason ?? "end_turn",
        };
        return update;
      }

      default:
        return null;
    }
  }

  /**
   * Handle deferred input from tool_call_update.
   * Returns the tool call with populated input if found.
   */
  handleDeferredInput(
    toolCallId: string,
    update: unknown
  ): NormalizedToolCall | null {
    const payload = this.getUpdatePayload(update);
    const rawInput = payload.rawInput as Record<string, unknown> | undefined;
    const kind = payload.kind as string | undefined;
    const title = payload.title as string | undefined;

    const hasInput = rawInput && Object.keys(rawInput).length > 0;
    if (!hasInput) return null;

    return this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
      title,
      status: "running",
      input: rawInput,
      inputFinalized: true,
    });
  }

  private mapStatus(
    status: string | undefined,
    isComplete: boolean
  ): "pending" | "running" | "completed" | "failed" {
    if (status === "completed" || status === "failed") {
      return status;
    }
    if (isComplete) return "completed";
    if (status === "in_progress" || status === "running") return "running";
    return "pending";
  }
}

