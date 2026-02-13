"use client";

/**
 * ChatPanel - ACP-based chat interface for interacting with Routa
 *
 * Uses inline messages from JSON-RPC prompt response (reliable).
 * SSE updates are shown as supplementary real-time indicators.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useAcp, AcpMessage } from "../hooks/use-acp";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "thinking" | "tool";
  content: string;
  timestamp: Date;
  toolName?: string;
  toolResult?: unknown;
}

interface ChatPanelProps {
  onSessionChange?: () => void;
}

export function ChatPanel({ onSessionChange }: ChatPanelProps) {
  const {
    connected,
    sessionId,
    agentId,
    loading,
    error,
    connect,
    prompt,
    disconnect,
  } = useAcp();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleConnect = useCallback(async () => {
    await connect();
    onSessionChange?.();
  }, [connect, onSessionChange]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setMessages([]);
    onSessionChange?.();
  }, [disconnect, onSessionChange]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || !sessionId) return;

    const text = input;
    setInput("");

    // Add user message immediately
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        timestamp: new Date(),
      },
    ]);

    // Send prompt and get inline response messages
    const responseMessages = await prompt(text);

    // Convert ACP messages to chat messages
    const newMessages: ChatMessage[] = responseMessages
      .filter((m: AcpMessage) => m.role !== "thinking") // skip thinking for cleaner UI
      .map((m: AcpMessage) => ({
        id: crypto.randomUUID(),
        role: (m.role === "tool" ? "tool" : "assistant") as
          | "assistant"
          | "tool",
        content: m.content,
        timestamp: new Date(),
        toolName: m.toolName,
        toolResult: m.toolResult,
      }));

    setMessages((prev) => [...prev, ...newMessages]);
    // Small delay to ensure server state is committed before refreshing agents
    setTimeout(() => onSessionChange?.(), 200);
  }, [input, sessionId, prompt, onSessionChange]);

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
          {sessionId && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
              {sessionId.slice(0, 8)}
            </span>
          )}
          {agentId && (
            <span className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full">
              ROUTA
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
            onClick={handleDisconnect}
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
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-12">
            {connected
              ? 'Send a message to start. Try "list agents", "create agent named worker", or "status".'
              : "Click Connect to start a session with the Routa coordinator."}
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {loading && connected && (
          <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500 text-sm">
            <span className="animate-pulse">Thinking...</span>
          </div>
        )}
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
                ? 'Type a message or /skill-name...'
                : "Connect first..."
            }
            disabled={!connected || loading}
            className="flex-1 px-4 py-2.5 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
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
  const { role, content, toolName } = message;

  if (role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-blue-600 text-white text-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  if (role === "tool") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] rounded-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {toolName ?? "tool"}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              completed
            </span>
          </div>
          <div className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50/50 dark:bg-gray-800/50">
            {content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message - render markdown-like formatting
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100">
        <FormattedContent content={content} />
      </div>
    </div>
  );
}

// ─── Simple Markdown-like formatter ────────────────────────────────────

/** Render inline markdown: **bold** and `code` */
function InlineMarkdown({ text }: { text: string }) {
  // Split on **bold** and `code` patterns
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

  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        // List items (with inline markdown)
        if (line.startsWith("- ")) {
          return (
            <div key={i} className="pl-3 flex gap-1.5">
              <span className="text-gray-400 shrink-0">•</span>
              <span>
                <InlineMarkdown text={line.slice(2)} />
              </span>
            </div>
          );
        }

        // Blockquote
        if (line.startsWith("> ")) {
          return (
            <div
              key={i}
              className="pl-3 border-l-2 border-gray-300 dark:border-gray-500 text-gray-600 dark:text-gray-400 italic"
            >
              <InlineMarkdown text={line.slice(2)} />
            </div>
          );
        }

        // Empty line
        if (line.trim() === "") {
          return <div key={i} className="h-1" />;
        }

        // Normal text (with inline markdown)
        return (
          <div key={i}>
            <InlineMarkdown text={line} />
          </div>
        );
      })}
    </div>
  );
}
