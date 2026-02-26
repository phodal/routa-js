/**
 * HttpSessionStore - In-memory store for ACP sessions and SSE delivery.
 *
 * Tracks sessions for UI listing and delivers `session/update` notifications
 * from opencode processes to the browser via Server-Sent Events.
 *
 * - Buffers notifications until SSE connects (avoids losing early updates)
 * - Supports multiple concurrent sessions with independent SSE streams
 * - Stores user messages for history preservation
 * - Consolidates consecutive agent_message_chunk notifications for efficient storage
 * - Records Agent Trace with file ranges and VCS context
 */

import {
  createTraceRecord,
  withConversation,
  withTool,
  withVcs,
  recordTrace,
  extractFilesFromToolCall,
  getVcsContextLight,
  type TraceRecord,
} from "@/core/trace";

export interface RoutaSessionRecord {
  sessionId: string;
  /** User-editable display name */
  name?: string;
  cwd: string;
  workspaceId: string;
  routaAgentId?: string;
  provider?: string;
  role?: string;
  modeId?: string;
  createdAt: string;
  /** Whether the first prompt has been sent (for coordinator prompt injection) */
  firstPromptSent?: boolean;
}

type Controller = ReadableStreamDefaultController<Uint8Array>;

export interface SessionUpdateNotification {
  sessionId: string;
  update?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Consolidates consecutive agent_message_chunk notifications into a single message.
 * This reduces storage overhead from hundreds of small chunks to a single entry.
 */
export function consolidateMessageHistory(
  notifications: SessionUpdateNotification[]
): SessionUpdateNotification[] {
  if (notifications.length === 0) return [];

  const result: SessionUpdateNotification[] = [];
  let currentChunks: string[] = [];
  let currentSessionId: string | null = null;

  const flushChunks = () => {
    if (currentChunks.length > 0 && currentSessionId) {
      // Create a consolidated agent_message notification
      result.push({
        sessionId: currentSessionId,
        update: {
          sessionUpdate: "agent_message",
          content: { type: "text", text: currentChunks.join("") },
        },
      });
      currentChunks = [];
    }
  };

  for (const notification of notifications) {
    const update = notification.update as Record<string, unknown> | undefined;
    const sessionUpdate = update?.sessionUpdate;

    if (sessionUpdate === "agent_message_chunk") {
      // Accumulate chunks
      const content = update?.content as { type?: string; text?: string } | undefined;
      if (content?.text) {
        if (currentSessionId !== notification.sessionId) {
          flushChunks();
          currentSessionId = notification.sessionId;
        }
        currentChunks.push(content.text);
      }
    } else {
      // Non-chunk notification - flush any pending chunks first
      flushChunks();
      currentSessionId = notification.sessionId;
      result.push(notification);
    }
  }

  // Flush any remaining chunks
  flushChunks();

  return result;
}

/**
 * Pending tool call data awaiting rawInput from tool_call_update.
 * OpenCode sends tool_call with empty rawInput, then tool_call_update with actual args.
 */
interface PendingToolCall {
  toolCallId: string;
  kind: string;
  title: string;
  provider: string;
  cwd: string;
  sessionId: string;
  traced: boolean;
}

class HttpSessionStore {
  private sessions = new Map<string, RoutaSessionRecord>();
  private sseControllers = new Map<string, Controller>();
  private pendingNotifications = new Map<string, SessionUpdateNotification[]>();
  /** Store all notifications per session for history replay */
  private messageHistory = new Map<string, SessionUpdateNotification[]>();
  /** Buffer for accumulating agent message chunks before tracing */
  private agentMessageBuffer = new Map<string, string>();
  /** Buffer for accumulating agent thought chunks before tracing */
  private agentThoughtBuffer = new Map<string, string>();
  /** Buffer for tool calls awaiting rawInput (keyed by toolCallId) */
  private pendingToolCalls = new Map<string, PendingToolCall>();

  upsertSession(record: RoutaSessionRecord) {
    this.sessions.set(record.sessionId, record);
  }

  listSessions(): RoutaSessionRecord[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  getSession(sessionId: string): RoutaSessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  deleteSession(sessionId: string): boolean {
    this.flushAgentBuffer(sessionId); // Trace any remaining buffered content
    this.flushThoughtBuffer(sessionId); // Trace any remaining thought content
    this.messageHistory.delete(sessionId);
    this.pendingNotifications.delete(sessionId);
    this.agentMessageBuffer.delete(sessionId);
    this.agentThoughtBuffer.delete(sessionId);
    // Detach SSE if connected
    this.sseControllers.delete(sessionId);
    return this.sessions.delete(sessionId);
  }

  /**
   * Flush and trace any remaining buffered agent message content.
   * Call this when a prompt completes or session ends.
   */
  flushAgentBuffer(sessionId: string): void {
    const accumulated = this.agentMessageBuffer.get(sessionId);
    if (accumulated && accumulated.length > 0) {
      const sessionRecord = this.sessions.get(sessionId);
      const agentTrace = withConversation(
        createTraceRecord(sessionId, "agent_message", { provider: sessionRecord?.provider ?? "unknown" }),
        {
          role: "assistant",
          contentPreview: accumulated.slice(0, 200),
          fullContent: accumulated,
        }
      );
      recordTrace(sessionRecord?.cwd ?? process.cwd(), agentTrace);
      this.agentMessageBuffer.set(sessionId, "");
    }
  }

  /**
   * Flush and trace any remaining buffered agent thought content.
   * Call this when a prompt completes or session ends.
   */
  flushThoughtBuffer(sessionId: string): void {
    const accumulated = this.agentThoughtBuffer.get(sessionId);
    if (accumulated && accumulated.length > 0) {
      const sessionRecord = this.sessions.get(sessionId);
      const thoughtTrace = withConversation(
        createTraceRecord(sessionId, "agent_thought", { provider: sessionRecord?.provider ?? "unknown" }),
        {
          role: "assistant",
          contentPreview: accumulated.slice(0, 200),
          fullContent: accumulated,
        }
      );
      recordTrace(sessionRecord?.cwd ?? process.cwd(), thoughtTrace);
      this.agentThoughtBuffer.set(sessionId, "");
    }
  }

  renameSession(sessionId: string, name: string): boolean {
    const existing = this.sessions.get(sessionId);
    if (!existing) return false;
    existing.name = name;
    return true;
  }

  markFirstPromptSent(sessionId: string) {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, {
      ...existing,
      firstPromptSent: true,
    });
  }

  updateSessionMode(sessionId: string, modeId: string) {
    const existing = this.sessions.get(sessionId);
    if (!existing) return;
    this.sessions.set(sessionId, {
      ...existing,
      modeId,
    });
  }

  attachSse(sessionId: string, controller: Controller) {
    this.sseControllers.set(sessionId, controller);
    this.flushPending(sessionId);
  }

  detachSse(sessionId: string) {
    this.sseControllers.delete(sessionId);
  }

  /**
   * Store a user message in history. This is called when user sends a prompt.
   * User messages are stored with sessionUpdate: "user_message" for easy identification.
   */
  pushUserMessage(sessionId: string, prompt: string) {
    const notification: SessionUpdateNotification = {
      sessionId,
      update: {
        sessionUpdate: "user_message",
        content: { type: "text", text: prompt },
      },
    };
    const history = this.messageHistory.get(sessionId) ?? [];
    history.push(notification);
    this.messageHistory.set(sessionId, history);

    // ── Trace: user_message ───────────────────────────────────────────────
    const sessionRecord = this.sessions.get(sessionId);
    const cwd = sessionRecord?.cwd ?? process.cwd();
    const provider = sessionRecord?.provider ?? "unknown";

    const userTrace = withConversation(
      createTraceRecord(sessionId, "user_message", { provider }),
      {
        role: "user",
        contentPreview: prompt.slice(0, 200),
        fullContent: prompt,
      }
    );
    recordTrace(cwd, userTrace);
  }

  /**
   * Push a session/update notification. If SSE isn't connected yet, buffer it.
   *
   * Accepts the raw notification params from opencode (which may have different shapes).
   */
  pushNotification(notification: SessionUpdateNotification) {
    const sessionId = notification.sessionId;

    // Always store in history for session switching
    const history = this.messageHistory.get(sessionId) ?? [];
    history.push(notification);
    this.messageHistory.set(sessionId, history);

    // ── Trace recording for various event types ──
    const update = notification.update as Record<string, unknown> | undefined;
    const sessionUpdate = update?.sessionUpdate;
    const sessionRecord = this.sessions.get(sessionId);
    const cwd = sessionRecord?.cwd ?? process.cwd();
    const provider = sessionRecord?.provider ?? "unknown";

    if (sessionUpdate === "agent_thought_chunk") {
      // Accumulate thought chunks in buffer
      const content = update?.content as { type?: string; text?: string } | undefined;
      const text = content?.text ?? "";
      const existing = this.agentThoughtBuffer.get(sessionId) ?? "";
      const accumulated = existing + text;
      this.agentThoughtBuffer.set(sessionId, accumulated);
      // Trace when buffer reaches 100+ chars
      if (accumulated.length >= 100) {
        const thoughtTrace = withConversation(
          createTraceRecord(sessionId, "agent_thought", { provider }),
          {
            role: "assistant",
            contentPreview: accumulated.slice(0, 200),
            fullContent: accumulated,
          }
        );
        recordTrace(cwd, thoughtTrace);
        this.agentThoughtBuffer.set(sessionId, ""); // Reset buffer
      }
    } else if (sessionUpdate === "agent_message_chunk") {
      // Accumulate message chunks in buffer
      const content = update?.content as { type?: string; text?: string } | undefined;
      const text = content?.text ?? "";
      const existing = this.agentMessageBuffer.get(sessionId) ?? "";
      const accumulated = existing + text;
      this.agentMessageBuffer.set(sessionId, accumulated);
      // Trace when buffer reaches 100+ chars (captures meaningful segments)
      if (accumulated.length >= 100) {
        const agentTrace = withConversation(
          createTraceRecord(sessionId, "agent_message", { provider }),
          {
            role: "assistant",
            contentPreview: accumulated.slice(0, 200),
            fullContent: accumulated,
          }
        );
        recordTrace(cwd, agentTrace);
        this.agentMessageBuffer.set(sessionId, ""); // Reset buffer
      }
    } else if (sessionUpdate === "agent_message") {
      // Full message (non-streaming) - trace immediately
      const content = update?.content as { type?: string; text?: string } | undefined;
      const text = content?.text ?? "";
      const agentTrace = withConversation(
        createTraceRecord(sessionId, "agent_message", { provider }),
        {
          role: "assistant",
          contentPreview: text.slice(0, 200),
          fullContent: text,
        }
      );
      recordTrace(cwd, agentTrace);
    } else if (sessionUpdate === "tool_call") {
      // Tool call - OpenCode may send rawInput as empty initially
      const toolCallId = update?.toolCallId as string | undefined;
      const kind = update?.kind as string | undefined;
      const title = update?.title as string | undefined;
      const rawInput = update?.rawInput as Record<string, unknown> | undefined;

      // Check if rawInput is empty or undefined
      const hasInput = rawInput && Object.keys(rawInput).length > 0;

      if (hasInput) {
        // Trace immediately with full input (Claude Code behavior)
        let toolTrace = createTraceRecord(sessionId, "tool_call", { provider });
        toolTrace = withTool(toolTrace, {
          name: kind ?? title ?? "unknown",
          toolCallId,
          status: "running",
          input: rawInput,
        });

        const toolName = kind ?? title ?? "unknown";
        const files = extractFilesFromToolCall(toolName, rawInput);
        if (files.length > 0) {
          toolTrace = { ...toolTrace, files };
        }

        const vcs = getVcsContextLight(cwd);
        if (vcs) {
          toolTrace = withVcs(toolTrace, vcs);
        }

        recordTrace(cwd, toolTrace);
      } else if (toolCallId) {
        // OpenCode behavior: rawInput is empty, wait for tool_call_update
        this.pendingToolCalls.set(toolCallId, {
          toolCallId,
          kind: kind ?? title ?? "unknown",
          title: title ?? kind ?? "unknown",
          provider,
          cwd,
          sessionId,
          traced: false,
        });
      }
    } else if (sessionUpdate === "tool_call_update") {
      // Tool update - may contain rawInput (OpenCode) or just rawOutput (completion)
      const toolCallId = update?.toolCallId as string | undefined;
      const kind = update?.kind as string | undefined;
      const title = update?.title as string | undefined;
      const rawInput = update?.rawInput as Record<string, unknown> | undefined;
      const rawOutput = update?.rawOutput as unknown;
      const status = update?.status as string | undefined;

      // Check if this update has rawInput and the tool_call wasn't traced yet
      const pending = toolCallId ? this.pendingToolCalls.get(toolCallId) : undefined;
      const hasInput = rawInput && Object.keys(rawInput).length > 0;

      if (pending && hasInput && !pending.traced) {
        // Record the tool_call trace now with actual input
        let toolTrace = createTraceRecord(sessionId, "tool_call", { provider });
        toolTrace = withTool(toolTrace, {
          name: kind ?? pending.kind ?? "unknown",
          toolCallId,
          status: "running",
          input: rawInput,
        });

        const toolName = kind ?? pending.kind ?? "unknown";
        const files = extractFilesFromToolCall(toolName, rawInput);
        if (files.length > 0) {
          toolTrace = { ...toolTrace, files };
        }

        const vcs = getVcsContextLight(cwd);
        if (vcs) {
          toolTrace = withVcs(toolTrace, vcs);
        }

        recordTrace(cwd, toolTrace);
        pending.traced = true;
      }

      // Record tool_result trace when status indicates completion or we have output
      const isComplete = status === "completed" || status === "failed" || rawOutput !== undefined;
      if (isComplete) {
        let toolResultTrace = createTraceRecord(sessionId, "tool_result", { provider });
        toolResultTrace = withTool(toolResultTrace, {
          name: kind ?? title ?? "unknown",
          toolCallId,
          status: status ?? "completed",
          output: rawOutput as string | undefined,
        });
        recordTrace(cwd, toolResultTrace);

        // Clean up pending entry
        if (toolCallId) {
          this.pendingToolCalls.delete(toolCallId);
        }
      }
    }

    const controller = this.sseControllers.get(sessionId);

    if (controller) {
      this.writeSse(controller, {
        jsonrpc: "2.0",
        method: "session/update",
        params: notification,
      });
      return;
    }

    const pending = this.pendingNotifications.get(sessionId) ?? [];
    pending.push(notification);
    this.pendingNotifications.set(sessionId, pending);
  }

  /**
   * Get message history for a session (used when switching sessions).
   * Returns raw history without consolidation (for streaming playback).
   */
  getHistory(sessionId: string): SessionUpdateNotification[] {
    return this.messageHistory.get(sessionId) ?? [];
  }

  /**
   * Get consolidated message history for storage.
   * Merges consecutive agent_message_chunk notifications into single messages.
   */
  getConsolidatedHistory(sessionId: string): SessionUpdateNotification[] {
    const history = this.messageHistory.get(sessionId) ?? [];
    return consolidateMessageHistory(history);
  }

  /**
   * Send a one-off "connected" event (useful for UI).
   */
  pushConnected(sessionId: string) {
    const controller = this.sseControllers.get(sessionId);
    if (!controller) return;
    this.writeSse(controller, {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Connected to ACP session." },
        },
      },
    });
  }

  private flushPending(sessionId: string) {
    const controller = this.sseControllers.get(sessionId);
    if (!controller) return;

    const pending = this.pendingNotifications.get(sessionId);
    if (!pending || pending.length === 0) return;

    for (const n of pending) {
      this.writeSse(controller, {
        jsonrpc: "2.0",
        method: "session/update",
        params: n,
      });
    }
    this.pendingNotifications.delete(sessionId);
  }

  private writeSse(controller: Controller, payload: unknown) {
    const encoder = new TextEncoder();
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    try {
      controller.enqueue(encoder.encode(event));
    } catch {
      // controller closed - drop silently
    }
  }
}

// Use globalThis to survive HMR in Next.js dev mode
const GLOBAL_KEY = "__http_session_store__";

export function getHttpSessionStore(): HttpSessionStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new HttpSessionStore();
  }
  return g[GLOBAL_KEY] as HttpSessionStore;
}
