"use client";

/**
 * TracePanel - Displays Agent Trace records for debugging
 *
 * Shows:
 * - Session lifecycle events (start/end)
 * - User messages
 * - Agent responses (messages, thoughts)
 * - Tool calls and results
 * - File modifications
 *
 * Based on the Agent Trace specification: https://github.com/cursor/agent-trace
 */

import { useCallback, useEffect, useState } from "react";
import type { TraceRecord } from "@/core/trace";

interface TracePanelProps {
  sessionId: string | null;
}

export function TracePanel({ sessionId }: TracePanelProps) {
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<{
    totalDays: number;
    totalFiles: number;
    totalRecords: number;
    uniqueSessions: number;
    eventTypes: Record<string, number>;
  } | null>(null);

  const fetchTraces = useCallback(async () => {
    if (!sessionId) {
      setTraces([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ sessionId });
      const res = await fetch(`/api/traces?${params}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Failed to fetch traces: ${res.statusText}`);
      }

      const data = await res.json();
      setTraces(data.traces || []);
    } catch (err) {
      console.error("[TracePanel] Failed to fetch traces:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/traces/stats", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("[TracePanel] Failed to fetch stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchTraces();
    fetchStats();
  }, [fetchTraces, fetchStats]);

  const exportTraces = useCallback(async () => {
    if (!sessionId) return;

    try {
      const params = new URLSearchParams({ sessionId });
      const res = await fetch(`/api/traces/export?${params}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Failed to export traces: ${res.statusText}`);
      }

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.export, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `traces-${sessionId}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[TracePanel] Failed to export traces:", err);
    }
  }, [sessionId]);

  const filteredTraces = traces.filter((trace) => {
    if (filter === "all") return true;
    return trace.eventType === filter;
  });

  const toggleExpand = useCallback((traceId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedIds(new Set(filteredTraces.map(t => t.id)));
  }, [filteredTraces]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const eventTypeColors: Record<string, string> = {
    session_start: "text-green-600 dark:text-green-400",
    session_end: "text-red-600 dark:text-red-400",
    user_message: "text-blue-600 dark:text-blue-400",
    agent_message: "text-purple-600 dark:text-purple-400",
    agent_thought: "text-yellow-600 dark:text-yellow-400",
    tool_call: "text-orange-600 dark:text-orange-400",
    tool_result: "text-cyan-600 dark:text-cyan-400",
  };

  const eventTypeLabels: Record<string, string> = {
    session_start: "Session Start",
    session_end: "Session End",
    user_message: "User",
    agent_message: "Agent",
    agent_thought: "Thought",
    tool_call: "Tool",
    tool_result: "Tool Result",
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getTraceContent = (trace: TraceRecord) => {
    // Conversation content
    if (trace.conversation) {
      return trace.conversation.fullContent || trace.conversation.contentPreview || "";
    }
    // Tool content
    if (trace.tool) {
      if (trace.eventType === "tool_call") {
        return `Calling: ${trace.tool.name}`;
      }
      if (trace.eventType === "tool_result") {
        const output = trace.tool.output;
        if (typeof output === "string") {
          return output.slice(0, 200);
        }
        return JSON.stringify(output)?.slice(0, 200) || "";
      }
    }
    return "";
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#13151d]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-500 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Agent Trace
          </span>
          {traces.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
              {traces.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTraces}
            disabled={loading}
            className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Refresh"}
          </button>
          <button
            onClick={exportTraces}
            disabled={traces.length === 0}
            className="px-2 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
          <span>{stats.totalRecords} total records</span>
          <span>{stats.uniqueSessions} sessions</span>
          <span>{stats.totalDays} days</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 shrink-0 overflow-x-auto">
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
            filter === "all"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("user_message")}
          className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
            filter === "user_message"
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          User
        </button>
        <button
          onClick={() => setFilter("agent_message")}
          className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
            filter === "agent_message"
              ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Agent
        </button>
        <button
          onClick={() => setFilter("tool_call")}
          className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
            filter === "tool_call"
              ? "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => setFilter("agent_thought")}
          className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
            filter === "agent_thought"
              ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
          }`}
        >
          Thoughts
        </button>
        <div className="flex-1" />
        <button
          onClick={expandAll}
          className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors"
        >
          Collapse All
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredTraces.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <svg
              className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {sessionId ? "No traces for this session yet" : "Select a session to view traces"}
            </p>
          </div>
        </div>
      )}

      {/* Trace table */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filteredTraces.map((trace) => {
            const isExpanded = expandedIds.has(trace.id);
            const content = getTraceContent(trace);

            return (
              <div
                key={trace.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
              >
                <div
                  onClick={() => toggleExpand(trace.id)}
                  className="px-4 py-2 cursor-pointer flex items-start gap-3"
                >
                  {/* Timestamp */}
                  <div className="shrink-0 w-16 text-[10px] text-gray-400 dark:text-gray-500 font-mono text-right pt-0.5">
                    {formatTime(trace.timestamp)}
                  </div>

                  {/* Event type badge */}
                  <div className="shrink-0 pt-0.5">
                    <span
                      className={`text-[10px] font-medium uppercase ${
                        eventTypeColors[trace.eventType] || "text-gray-500"
                      }`}
                    >
                      {eventTypeLabels[trace.eventType] || trace.eventType}
                    </span>
                  </div>

                  {/* Content preview (one line) */}
                  <div className="flex-1 min-w-0">
                    {trace.conversation && (
                      <p className="text-xs text-gray-700 dark:text-gray-300 truncate">
                        {trace.conversation.contentPreview || trace.conversation.fullContent || ""}
                      </p>
                    )}
                    {trace.tool && (
                      <div className="flex items-center gap-2">
                        <code className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-700 dark:text-gray-300">
                          {trace.tool.name}
                        </code>
                        {trace.tool.status && (
                          <span
                            className={`text-[10px] ${
                              trace.tool.status === "completed"
                                ? "text-green-600 dark:text-green-400"
                                : trace.tool.status === "failed"
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-yellow-600 dark:text-yellow-400"
                            }`}
                          >
                            {trace.tool.status}
                          </span>
                        )}
                        {trace.tool.output && typeof trace.tool.output === "string" ? (
                          <span className="text-[10px] text-gray-400 truncate max-w-xs">
                            {trace.tool.output.slice(0, 100)}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {/* Expand/collapse icon */}
                  <div className="shrink-0 pt-0.5">
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div
                    className="px-4 pb-3 pl-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-md border border-gray-100 dark:border-gray-800">
                      {/* Full conversation content */}
                      {trace.conversation && (
                        <div className="mb-3">
                          <div className="text-[10px] text-gray-400 mb-1">Content</div>
                          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                            {trace.conversation.fullContent || trace.conversation.contentPreview || ""}
                          </p>
                        </div>
                      )}

                      {/* Tool details */}
                      {trace.tool && (
                        <div className="mb-3">
                          <div className="text-[10px] text-gray-400 mb-1">Tool: {trace.tool.name}</div>
                          {trace.tool.status && (
                            <div className="text-[10px] text-gray-400 mb-1">
                              Status: {trace.tool.status}
                            </div>
                          )}
                          {trace.tool.input != null && (
                            <details className="mt-2">
                              <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300">
                                Input
                              </summary>
                              <pre className="text-[10px] text-gray-700 dark:text-gray-300 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                                {JSON.stringify(trace.tool.input, null, 2)}
                              </pre>
                            </details>
                          )}
                          {trace.tool.output != null && (
                            <details className="mt-2">
                              <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-300">
                                Output
                              </summary>
                              <pre className="text-[10px] text-gray-700 dark:text-gray-300 mt-1 overflow-x-auto whitespace-pre-wrap break-words">
                                {typeof trace.tool.output === "string"
                                  ? trace.tool.output
                                  : JSON.stringify(trace.tool.output, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Files affected */}
                      {trace.files && trace.files.length > 0 && (
                        <div className="mb-3">
                          <div className="text-[10px] text-gray-400 mb-1">Files Affected</div>
                          {trace.files.map((file, idx) => (
                            <div key={idx} className="text-xs">
                              <span className="font-mono text-gray-700 dark:text-gray-300">
                                {file.path}
                              </span>
                              {file.ranges && file.ranges.length > 0 && (
                                <span className="text-[10px] text-gray-400 ml-2">
                                  (lines: {file.ranges.map((r) => `${r.startLine}-${r.endLine}`).join(", ")})
                                </span>
                              )}
                              {file.operation && (
                                <span className="inline-block ml-2 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                                  {file.operation}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="text-[10px] text-gray-400">
                        ID: {trace.id.slice(0, 8)} • Provider: {trace.contributor.provider}
                        {trace.contributor.model && ` • Model: ${trace.contributor.model}`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
