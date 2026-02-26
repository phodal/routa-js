/**
 * Standard ACP Provider Adapter
 *
 * Generic adapter for standard ACP-compliant providers.
 * Handles both immediate and deferred rawInput patterns.
 */

import { BaseProviderAdapter } from "./base-adapter";
import type {
  NormalizedSessionUpdate,
  NormalizedToolCall,
  ProviderBehavior,
  ProviderType,
} from "./types";

/**
 * Adapter for standard ACP providers (Kimi, Gemini, Copilot, etc.)
 *
 * Characteristics:
 * - Uses standard ACP protocol
 * - May have immediate or deferred rawInput (handles both)
 * - Supports streaming
 */
export class StandardAcpAdapter extends BaseProviderAdapter {
  constructor(provider: ProviderType = "standard") {
    super(provider);
  }

  getBehavior(): ProviderBehavior {
    return {
      type: this.provider,
      // Standard ACP: we don't know, so handle both patterns
      immediateToolInput: false,
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
        const rawInput = payload.rawInput as Record<string, unknown> | undefined | null;

        if (!toolCallId) return null;

        // Ensure hasInput is a boolean (handle null/undefined)
        const hasInput = !!(rawInput && typeof rawInput === "object" && Object.keys(rawInput).length > 0);

        const update = this.createUpdate(sessionId, "tool_call", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: "running",
          input: rawInput ?? undefined,
          inputFinalized: hasInput, // True if we have input, false if deferred
        });
        return update;
      }

      case "tool_call_update": {
        const toolCallId = payload.toolCallId as string | undefined;
        const kind = payload.kind as string | undefined;
        const title = payload.title as string | undefined;
        const rawInput = payload.rawInput as Record<string, unknown> | undefined | null;
        const rawOutput = payload.rawOutput;
        const status = payload.status as string | undefined;

        if (!toolCallId) return null;

        // Ensure hasInput is a boolean (handle null/undefined)
        const hasInput = !!(rawInput && typeof rawInput === "object" && Object.keys(rawInput).length > 0);
        const isComplete = status === "completed" || status === "failed" || rawOutput !== undefined;

        const update = this.createUpdate(sessionId, "tool_call_update", rawNotification);
        update.toolCall = this.createToolCall(toolCallId, kind ?? title ?? "unknown", {
          title,
          status: this.mapStatus(status, isComplete),
          input: rawInput ?? undefined,
          output: rawOutput,
          inputFinalized: hasInput || isComplete,
        });
        return update;
      }

      case "agent_message_chunk":
      case "agent_message": {
        const content = payload.content as { type?: string; text?: string } | undefined;
        const text = content?.text ?? (payload.text as string) ?? "";

        const update = this.createUpdate(sessionId, "agent_message", rawNotification);
        update.message = {
          role: "assistant",
          content: text,
          isChunk: updateType === "agent_message_chunk",
        };
        return update;
      }

      case "agent_thought_chunk":
      case "agent_thought": {
        const content = payload.content as { type?: string; text?: string } | undefined;
        const text = content?.text ?? (payload.text as string) ?? "";

        const update = this.createUpdate(sessionId, "agent_thought", rawNotification);
        update.message = {
          role: "assistant",
          content: text,
          isChunk: updateType === "agent_thought_chunk",
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

      default:
        return null;
    }
  }

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
    if (status === "completed" || status === "failed") return status;
    if (isComplete) return "completed";
    if (status === "in_progress" || status === "running") return "running";
    return "pending";
  }
}

