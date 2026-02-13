"use client";

/**
 * ChatPanel - ACP-based chat interface
 *
 * Renders streaming `session/update` SSE notifications from an opencode process.
 * Accumulates `agent_message_chunk` into a single growing assistant message.
 * Shows tool calls, thoughts, and plans inline.
 */

import { useState, useRef, useEffect, useCallback, type ReactElement } from "react";
import type { AcpSessionNotification } from "../acp-client";
import type { UseAcpActions, UseAcpState } from "../hooks/use-acp";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: Date;
  /** For tool messages: tool name and status */
  toolName?: string;
  toolStatus?: string;
  toolCallId?: string;
}

interface ChatPanelProps {
  acp: UseAcpState & UseAcpActions;
  activeSessionId: string | null;
  onEnsureSession: () => Promise<string | null>;
}

export function ChatPanel({
  acp,
  activeSessionId,
  onEnsureSession,
}: ChatPanelProps) {
  const { connected, loading, error, updates, connect, prompt, disconnect } =
    acp;

  const [input, setInput] = useState("");
  const [messagesBySession, setMessagesBySession] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [visibleMessages, setVisibleMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Track the current streaming assistant message ID per session
  const streamingMsgIdRef = useRef<Record<string, string | null>>({});

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  // When active session changes, swap visible transcript
  useEffect(() => {
    if (!activeSessionId) {
      setVisibleMessages([]);
      return;
    }
    setVisibleMessages(messagesBySession[activeSessionId] ?? []);
  }, [activeSessionId, messagesBySession]);

  // Convert ACP SSE updates into messages (store per session)
  useEffect(() => {
    if (!updates.length) return;
    const last = updates[updates.length - 1] as AcpSessionNotification;
    const sid = last.sessionId;

    // Support both nested (update.sessionUpdate) and flat (params.sessionUpdate) formats
    const update = (last.update ?? last) as Record<string, unknown>;
    const kind = update.sessionUpdate as string | undefined;

    if (!kind) return;

    const extractText = (): string => {
      // Try content.text (ACP standard)
      const content = update.content as
        | { type: string; text?: string }
        | undefined;
      if (content?.text) return content.text;
      // Try top-level text
      if (typeof update.text === "string") return update.text;
      return "";
    };

    if (kind === "agent_message_chunk") {
      const text = extractText();
      if (!text) return;

      setMessagesBySession((prev) => {
        const next = { ...prev };
        const arr = next[sid] ? [...next[sid]] : [];
        const streamingId = streamingMsgIdRef.current[sid];

        // Find existing streaming message to append to
        const existingIdx = streamingId
          ? arr.findIndex((m) => m.id === streamingId)
          : -1;

        if (existingIdx >= 0) {
          // Append to the existing streaming assistant message
          arr[existingIdx] = {
            ...arr[existingIdx],
            content: arr[existingIdx].content + text,
          };
        } else {
          // Start a new streaming assistant message
          const newId = crypto.randomUUID();
          streamingMsgIdRef.current[sid] = newId;
          arr.push({
            id: newId,
            role: "assistant",
            content: text,
            timestamp: new Date(),
          });
        }

        next[sid] = arr;
        return next;
      });
    } else if (kind === "agent_thought_chunk") {
      const text = extractText();
      if (!text) return;

      setMessagesBySession((prev) => {
        const next = { ...prev };
        const arr = next[sid] ? [...next[sid]] : [];
        // Thoughts are shown as system messages (don't accumulate)
        arr.push({
          id: crypto.randomUUID(),
          role: "system",
          content: text,
          timestamp: new Date(),
        });
        next[sid] = arr;
        return next;
      });
    } else if (kind === "tool_call") {
      // Start of a new tool call
      const toolCallId = update.toolCallId as string | undefined;
      const title = (update.title as string) ?? "tool";
      const rawInput = update.rawInput
        ? JSON.stringify(update.rawInput, null, 2)
        : "";

      setMessagesBySession((prev) => {
        const next = { ...prev };
        const arr = next[sid] ? [...next[sid]] : [];
        arr.push({
          id: toolCallId ?? crypto.randomUUID(),
          role: "tool",
          content: rawInput
            ? `${title}\n\nInput:\n${rawInput}`
            : title,
          timestamp: new Date(),
          toolName: title,
          toolStatus: (update.status as string) ?? "running",
          toolCallId,
        });
        next[sid] = arr;
        return next;
      });
    } else if (kind === "tool_call_update") {
      const toolCallId = update.toolCallId as string | undefined;
      const status = (update.status as string) ?? "completed";
      const rawOutput = update.rawOutput
        ? typeof update.rawOutput === "string"
          ? update.rawOutput
          : JSON.stringify(update.rawOutput, null, 2)
        : "";

      if (toolCallId) {
        setMessagesBySession((prev) => {
          const next = { ...prev };
          const arr = next[sid] ? [...next[sid]] : [];

          // Find the matching tool_call and update it
          const idx = arr.findIndex(
            (m) => m.toolCallId === toolCallId
          );
          if (idx >= 0) {
            arr[idx] = {
              ...arr[idx],
              toolStatus: status,
              content: rawOutput
                ? `${arr[idx].toolName ?? "tool"}\n\nOutput:\n${rawOutput}`
                : arr[idx].content,
            };
          } else {
            // No matching tool_call found, add as new
            arr.push({
              id: crypto.randomUUID(),
              role: "tool",
              content: rawOutput || `Tool ${status}`,
              timestamp: new Date(),
              toolStatus: status,
              toolCallId,
            });
          }

          next[sid] = arr;
          return next;
        });
      }
    } else if (kind === "plan") {
      const planText =
        typeof update.plan === "string"
          ? update.plan
          : JSON.stringify(update.plan, null, 2);
      setMessagesBySession((prev) => {
        const next = { ...prev };
        const arr = next[sid] ? [...next[sid]] : [];
        arr.push({
          id: crypto.randomUUID(),
          role: "system",
          content: `Plan:\n${planText}`,
          timestamp: new Date(),
        });
        next[sid] = arr;
        return next;
      });
    } else if (kind === "available_commands_update") {
      // Silently note commands update
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updates]);

  const handleConnect = useCallback(async () => {
    await connect();
  }, [connect]);

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const sid = activeSessionId ?? (await onEnsureSession());
    if (!sid) return;

    const text = input;
    setInput("");

    // Clear the streaming message ID so the next response starts fresh
    streamingMsgIdRef.current[sid] = null;

    // Store user msg in active session transcript
    setMessagesBySession((prev) => {
      const next = { ...prev };
      const arr = next[sid] ? [...next[sid]] : [];
      arr.push({
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      });
      next[sid] = arr;
      return next;
    });

    await prompt(text);

    // After prompt completes, clear streaming ID
    streamingMsgIdRef.current[sid] = null;
  }, [input, activeSessionId, onEnsureSession, prompt]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Chat
          </h2>
          <span
            className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`}
          />
          {activeSessionId && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {activeSessionId.slice(0, 8)}
            </span>
          )}
        </div>
        {!connected ? (
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="px-4 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
        {visibleMessages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-12">
            {connected
              ? activeSessionId
                ? "Send a message. Each session runs its own opencode instance."
                : "Select or create a session on the left."
              : "Click Connect to start."}
          </div>
        )}
        {visibleMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              connected
                ? activeSessionId
                  ? "Type a message..."
                  : "Type a message to auto-create a session..."
                : "Connect first..."
            }
            disabled={!connected || loading}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && handleSend()
            }
          />
          <button
            onClick={handleSend}
            disabled={!connected || loading || !input.trim()}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ──────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const { role, content, toolName, toolStatus } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  if (role === "system") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  if (role === "tool") {
    const statusColor =
      toolStatus === "completed"
        ? "bg-green-500"
        : toolStatus === "running"
          ? "bg-yellow-500 animate-pulse"
          : "bg-gray-400";

    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColor}`} />
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {toolName ?? "tool"}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {toolStatus ?? "completed"}
            </span>
          </div>
          <div className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-48 overflow-y-auto bg-gray-50/50 dark:bg-gray-800/50">
            {content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100">
        <FormattedContent content={content} />
      </div>
    </div>
  );
}

// ─── Simple Markdown-like formatter ────────────────────────────────────

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);

  return (
    <>
      {parts.map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={j}
              className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs font-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={j}>{part}</span>;
      })}
    </>
  );
}

function FormattedContent({ content }: { content: string }) {
  const lines = content.split("\n");
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeBlockLang = "";
  const elements: ReactElement[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block handling
    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockLines = [];
        continue;
      } else {
        // End of code block
        inCodeBlock = false;
        elements.push(
          <div key={i} className="my-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
            {codeBlockLang && (
              <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
                {codeBlockLang}
              </div>
            )}
            <pre className="px-3 py-2 text-xs font-mono overflow-x-auto bg-gray-50 dark:bg-gray-800">
              {codeBlockLines.join("\n")}
            </pre>
          </div>
        );
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Heading
    if (line.startsWith("### ")) {
      elements.push(
        <div key={i} className="font-semibold mt-2 text-sm">
          {line.slice(4)}
        </div>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <div key={i} className="font-bold mt-2">
          {line.slice(3)}
        </div>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <div key={i} className="font-bold mt-2 text-lg">
          {line.slice(2)}
        </div>
      );
      continue;
    }

    // List items
    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="pl-3 flex gap-1.5">
          <span className="text-gray-400 shrink-0">•</span>
          <span>
            <InlineMarkdown text={line.slice(2)} />
          </span>
        </div>
      );
      continue;
    }

    // Numbered list
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      elements.push(
        <div key={i} className="pl-3 flex gap-1.5">
          <span className="text-gray-400 shrink-0">{numberedMatch[1]}.</span>
          <span>
            <InlineMarkdown text={numberedMatch[2]} />
          </span>
        </div>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <div
          key={i}
          className="pl-3 border-l-2 border-gray-300 dark:border-gray-500 text-gray-600 dark:text-gray-400 italic"
        >
          <InlineMarkdown text={line.slice(2)} />
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1" />);
      continue;
    }

    // Normal text
    elements.push(
      <div key={i}>
        <InlineMarkdown text={line} />
      </div>
    );
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <div key="unclosed-code" className="my-2 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
        {codeBlockLang && (
          <div className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-600">
            {codeBlockLang}
          </div>
        )}
        <pre className="px-3 py-2 text-xs font-mono overflow-x-auto bg-gray-50 dark:bg-gray-800">
          {codeBlockLines.join("\n")}
        </pre>
      </div>
    );
  }

  return <div className="space-y-1">{elements}</div>;
}
