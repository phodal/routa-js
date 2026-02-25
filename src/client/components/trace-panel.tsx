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
  const [selectedTrace, setSelectedTrace] = useState<TraceRecord | null>(null);
  const [filter, setFilter] = useState<string>("all");
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
    user_message: "User Message",
    agent_message: "Agent Message",
    agent_thought: "Agent Thought",
    tool_call: "Tool Call",
    tool_result: "Tool Result",
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

      {/* Trace list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {filteredTraces.map((trace) => (
            <div
              key={trace.id}
              onClick={() => setSelectedTrace(trace)}
              className={`px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors ${
                selectedTrace?.id === trace.id ? "bg-blue-50 dark:bg-blue-900/10" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Event type badge */}
                <div
                  className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                    eventTypeColors[trace.eventType] || "bg-gray-400"
                  }`}
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[11px] font-medium uppercase ${
                        eventTypeColors[trace.eventType] || "text-gray-500"
                      }`}
                    >
                      {eventTypeLabels[trace.eventType] || trace.eventType}
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(trace.timestamp).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Conversation preview */}
                  {trace.conversation?.contentPreview && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {trace.conversation.contentPreview}
                    </p>
                  )}

                  {/* Tool info */}
                  {trace.tool && (
                    <div className="flex items-center gap-2 mt-1">
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
                    </div>
                  )}

                  {/* Files affected */}
                  {trace.files && trace.files.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      <svg
                        className="w-3 h-3 text-gray-400"
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
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {trace.files.map((f) => f.path).join(", ")}
                      </span>
                    </div>
                  )}

                  {/* Contributor info */}
                  <div className="flex items-center gap-2 mt-1">
                    {trace.contributor.provider && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {trace.contributor.provider}
                      </span>
                    )}
                    {trace.contributor.model && (
                      <>
                        <span className="text-gray-300 dark:text-gray-700">•</span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {trace.contributor.model}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trace detail modal */}
      {selectedTrace && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setSelectedTrace(null)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-[#161922] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[11px] font-medium uppercase ${
                    eventTypeColors[selectedTrace.eventType] || "text-gray-500"
                  }`}
                >
                  {eventTypeLabels[selectedTrace.eventType] || selectedTrace.eventType}
                </span>
                <span className="text-[10px] text-gray-400">
                  {selectedTrace.id.slice(0, 8)}
                </span>
              </div>
              <button
                onClick={() => setSelectedTrace(null)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
              <div className="space-y-4">
                {/* Timestamp */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Timestamp
                  </label>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                    {new Date(selectedTrace.timestamp).toISOString()}
                  </p>
                </div>

                {/* Session ID */}
                <div>
                  <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Session ID
                  </label>
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 font-mono">
                    {selectedTrace.sessionId}
                  </p>
                </div>

                {/* Contributor */}
                {selectedTrace.contributor && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Contributor
                    </label>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">
                      {selectedTrace.contributor.provider}
                      {selectedTrace.contributor.model && ` / ${selectedTrace.contributor.model}`}
                    </p>
                  </div>
                )}

                {/* Conversation */}
                {selectedTrace.conversation && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Conversation
                    </label>
                    <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md">
                      {selectedTrace.conversation.role && (
                        <p className="text-[10px] text-gray-400 mb-1">
                          Role: {selectedTrace.conversation.role}
                        </p>
                      )}
                      {(selectedTrace.conversation.fullContent || selectedTrace.conversation.contentPreview) && (
                        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {selectedTrace.conversation.fullContent || selectedTrace.conversation.contentPreview}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Tool */}
                {selectedTrace.tool && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tool Call
                    </label>
                    <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {selectedTrace.tool.name}
                      </p>
                      {selectedTrace.tool.status && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Status: {selectedTrace.tool.status}
                        </p>
                      )}
                      {selectedTrace.tool.input != null && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-gray-400 cursor-pointer">
                            Input
                          </summary>
                          <pre className="text-[10px] text-gray-700 dark:text-gray-300 mt-1 overflow-x-auto">
                            {JSON.stringify(selectedTrace.tool.input, null, 2)}
                          </pre>
                        </details>
                      )}
                      {selectedTrace.tool.output != null && (
                        <details className="mt-2">
                          <summary className="text-[10px] text-gray-400 cursor-pointer">
                            Output
                          </summary>
                          <pre className="text-[10px] text-gray-700 dark:text-gray-300 mt-1 overflow-x-auto">
                            {typeof selectedTrace.tool.output === "string"
                              ? selectedTrace.tool.output
                              : JSON.stringify(selectedTrace.tool.output, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )}

                {/* Files */}
                {selectedTrace.files && selectedTrace.files.length > 0 && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Files Affected
                    </label>
                    <div className="mt-1 space-y-1">
                      {selectedTrace.files.map((file, idx) => (
                        <div
                          key={idx}
                          className="p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md"
                        >
                          <p className="text-xs text-gray-700 dark:text-gray-300 font-mono">
                            {file.path}
                          </p>
                          {file.ranges && file.ranges.length > 0 && (
                            <p className="text-[10px] text-gray-400 mt-1">
                              Lines: {file.ranges.map((r) => `${r.startLine}-${r.endLine}`).join(", ")}
                            </p>
                          )}
                          {file.operation && (
                            <span className="inline-block mt-1 px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                              {file.operation}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VCS */}
                {selectedTrace.vcs && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Version Control
                    </label>
                    <div className="mt-1 text-xs text-gray-700 dark:text-gray-300">
                      {(selectedTrace.vcs.revision || selectedTrace.vcs.gitSha) && (
                        <p>SHA: {(selectedTrace.vcs.revision || selectedTrace.vcs.gitSha)?.slice(0, 8)}</p>
                      )}
                      {selectedTrace.vcs.branch && <p>Branch: {selectedTrace.vcs.branch}</p>}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedTrace.metadata && Object.keys(selectedTrace.metadata).length > 0 && (
                  <div>
                    <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Metadata
                    </label>
                    <pre className="mt-1 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md text-[10px] text-gray-700 dark:text-gray-300 overflow-x-auto">
                      {JSON.stringify(selectedTrace.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
