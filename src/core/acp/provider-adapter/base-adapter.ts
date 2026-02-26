/**
 * Base Provider Adapter
 *
 * Provides common functionality for all provider adapters.
 */

import type {
  IProviderAdapter,
  NormalizedSessionUpdate,
  NormalizedToolCall,
  NormalizedEventType,
  ProviderBehavior,
  ProviderType,
} from "./types";

/**
 * Abstract base class for provider adapters.
 * Provides common utilities and enforces the adapter interface.
 */
export abstract class BaseProviderAdapter implements IProviderAdapter {
  protected provider: ProviderType;

  constructor(provider: ProviderType) {
    this.provider = provider;
  }

  abstract getBehavior(): ProviderBehavior;

  abstract normalize(
    sessionId: string,
    rawNotification: unknown
  ): NormalizedSessionUpdate | NormalizedSessionUpdate[] | null;

  /**
   * Create a normalized session update with common fields filled in.
   */
  protected createUpdate(
    sessionId: string,
    eventType: NormalizedEventType,
    rawNotification?: unknown
  ): NormalizedSessionUpdate {
    return {
      sessionId,
      provider: this.provider,
      eventType,
      timestamp: new Date(),
      rawNotification,
    };
  }

  /**
   * Create a normalized tool call object.
   */
  protected createToolCall(
    toolCallId: string,
    name: string,
    options: {
      title?: string;
      status?: NormalizedToolCall["status"];
      input?: Record<string, unknown>;
      output?: unknown;
      inputFinalized?: boolean;
    } = {}
  ): NormalizedToolCall {
    const hasInput = !!(options.input && Object.keys(options.input).length > 0);
    return {
      toolCallId,
      name,
      title: options.title,
      status: options.status ?? "pending",
      input: options.input,
      output: options.output,
      // Input is finalized if explicitly set or if we have non-empty input
      inputFinalized: options.inputFinalized !== undefined ? options.inputFinalized : hasInput,
    };
  }

  /**
   * Extract sessionUpdate type from raw notification.
   * Works with both { update: { sessionUpdate: X } } and { sessionUpdate: X } formats.
   */
  protected getSessionUpdateType(rawNotification: unknown): string | undefined {
    if (!rawNotification || typeof rawNotification !== "object") {
      return undefined;
    }
    const notif = rawNotification as Record<string, unknown>;

    // Try nested format first: { update: { sessionUpdate: "..." } }
    const update = notif.update as Record<string, unknown> | undefined;
    if (update?.sessionUpdate) {
      return update.sessionUpdate as string;
    }

    // Try flat format: { sessionUpdate: "..." }
    if (notif.sessionUpdate) {
      return notif.sessionUpdate as string;
    }

    // Try type field: { type: "..." }
    if (notif.type) {
      return notif.type as string;
    }

    return undefined;
  }

  /**
   * Extract the update payload from raw notification.
   */
  protected getUpdatePayload(rawNotification: unknown): Record<string, unknown> {
    if (!rawNotification || typeof rawNotification !== "object") {
      return {};
    }
    const notif = rawNotification as Record<string, unknown>;

    // If nested, return update object
    if (notif.update && typeof notif.update === "object") {
      return notif.update as Record<string, unknown>;
    }

    // Otherwise return the notification itself
    return notif;
  }
}

