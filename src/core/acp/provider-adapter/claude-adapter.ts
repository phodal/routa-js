/**
 * Claude Code Provider Adapter
 *
 * Handles Claude Code's stream-json protocol messages.
 * Claude Code sends rawInput directly in tool_call events.
 */

import { BaseProviderAdapter } from "./base-adapter";
import type {
  NormalizedSessionUpdate,
  ProviderBehavior,
} from "./types";

/**
 * Adapter for Claude Code provider.
 *
 * Characteristics:
 * - Uses stream-json protocol (non-standard ACP)
 * - rawInput is included immediately in tool_call events
 * - Supports streaming (chunks)
 */
export class ClaudeCodeAdapter extends BaseProviderAdapter {
  constructor() {
    super("claude");
  }

  getBehavior(): ProviderBehavior {
    return {
      type: "claude",
      immediateToolInput: true, // Claude sends input with tool_call
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

        const update = this.createUpdate(sessionId, "tool_call", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: "running",
          input: rawInput,
          inputFinalized: true, // Claude always sends final input
        });
        return update;
      }

      case "tool_call_update": {
        const toolCallId = payload.toolCallId as string | undefined;
        const kind = payload.kind as string | undefined;
        const title = payload.title as string | undefined;
        const rawOutput = payload.rawOutput;
        const status = payload.status as string | undefined;

        if (!toolCallId) return null;

        const update = this.createUpdate(sessionId, "tool_call_update", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: this.mapStatus(status),
          output: rawOutput,
          inputFinalized: true,
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
        const usage = payload.usage as { inputTokens?: number; outputTokens?: number } | undefined;

        const update = this.createUpdate(sessionId, "turn_complete", rawNotification);
        update.turnComplete = {
          stopReason: stopReason ?? "end_turn",
          usage,
        };
        return update;
      }

      case "plan_update": {
        const items = payload.items as Array<{ description?: string; status?: string }> | undefined;
        if (!items) return null;

        const update = this.createUpdate(sessionId, "plan_update", rawNotification);
        update.planItems = items.map((item) => ({
          description: item.description ?? "",
          status: item.status ?? "pending",
        }));
        return update;
      }

      default:
        // Pass through unknown types with raw notification
        return null;
    }
  }

  private mapStatus(status: string | undefined): "pending" | "running" | "completed" | "failed" {
    switch (status) {
      case "completed": return "completed";
      case "failed": return "failed";
      case "running": return "running";
      case "pending": return "pending";
      default: return "completed";
    }
  }
}

