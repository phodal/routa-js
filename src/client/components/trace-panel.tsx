"use client";

/**
 * TracePanel - Displays Agent Trace records for debugging
 *
 * Shows:
 * - Session lifecycle events (start/end)
 * - User messages
 * - Agent responses (messages, thoughts)
 * - Tool calls and results (with input params as table)
 * - File modifications
 *
 * Based on the Agent Trace specification: https://github.com/cursor/agent-trace
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TraceRecord } from "@/core/trace";

interface TracePanelProps {
  sessionId: string | null;
}

/** Render tool input parameters as a visible key-value table */
function ToolInputTable({ input }: { input: unknown }) {
  if (input == null) return null;

  if (typeof input === "object" && !Array.isArray(input)) {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return null;
    return (
      <table className="w-full text-[10px] border-collapse">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
              <td className="py-1 pr-3 font-mono font-semibold text-gray-500 dark:text-gray-400 align-top whitespace-nowrap w-px">
                {key}
              </td>
              <td className="py-1 font-mono text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-all">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <pre className="text-[10px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

/** Group traces by sessionId, preserving insertion order */
function groupBySession(traces: TraceRecord[]): Map<string, TraceRecord[]> {
  const map = new Map<string, TraceRecord[]>();
  for (const trace of traces) {
    const sid = trace.sessionId || "unknown";
    if (!map.has(sid)) map.set(sid, []);
    map.get(sid)!.push(trace);
  }
  return map;
}

export function TracePanel({ sessionId }: TracePanelProps) {
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [expandedOutputIds, setExpandedOutputIds] = useState<Set<string>>(new Set());
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

  const filteredTraces = useMemo(
    () => (filter === "all" ? traces : traces.filter((t) => t.eventType === filter)),
    [traces, filter],
  );

  const sessionGroups = useMemo(() => groupBySession(filteredTraces), [filteredTraces]);

  const toggleOutputExpand = useCallback((traceId: string) => {
    setExpandedOutputIds((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  }, []);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-1.5 shrink-0 overflow-x-auto">
        {(
          [
            { key: "all", label: "All", active: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
            { key: "user_message", label: "User", active: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
            { key: "agent_message", label: "Agent", active: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
            { key: "tool_call", label: "Tool Calls", active: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" },
            { key: "tool_result", label: "Tool Results", active: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300" },
            { key: "agent_thought", label: "Thoughts", active: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" },
          ] as const
        ).map(({ key, label, active }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
              filter === key
                ? active
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
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

      {/* Trace content - grouped by session */}
      <div className="flex-1 overflow-y-auto">
        {Array.from(sessionGroups.entries()).map(([sid, sessionTraces]) => (
          <div key={sid}>
            {/* Session section header */}
            <div className="sticky top-0 z-10 px-4 py-1.5 bg-gray-100 dark:bg-gray-800/90 backdrop-blur border-y border-gray-200 dark:border-gray-700 flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Session
              </span>
              <span className="text-[10px] font-mono text-gray-600 dark:text-gray-300">
                {sid.length > 16 ? `${sid.slice(0, 8)}…${sid.slice(-4)}` : sid}
              </span>
              <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">
                {sessionTraces.length} events
              </span>
            </div>

            {/* Events */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {sessionTraces.map((trace) => {
                const isOutputExpanded = expandedOutputIds.has(trace.id);

                /* ── Session lifecycle ── */
                if (trace.eventType === "session_start" || trace.eventType === "session_end") {
                  return (
                    <div key={trace.id} className="px-4 py-1.5 flex items-center gap-3">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right">
                        {formatTime(trace.timestamp)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide ${
                          trace.eventType === "session_start"
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-500 dark:text-red-400"
                        }`}
                      >
                        {trace.eventType === "session_start" ? "▶ Session Started" : "■ Session Ended"}
                      </span>
                    </div>
                  );
                }

                /* ── User message ── */
                if (trace.eventType === "user_message") {
                  const content =
                    trace.conversation?.fullContent || trace.conversation?.contentPreview || "";
                  return (
                    <div key={trace.id} className="px-4 py-2.5 flex gap-3">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
                        {formatTime(trace.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                            User
                          </span>
                        </div>
                        <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-md px-3 py-2">
                          {content || <span className="italic text-gray-400">(empty)</span>}
                        </p>
                      </div>
                    </div>
                  );
                }

                /* ── Agent message ── */
                if (trace.eventType === "agent_message") {
                  const content =
                    trace.conversation?.fullContent || trace.conversation?.contentPreview || "";
                  return (
                    <div key={trace.id} className="px-4 py-2.5 flex gap-3">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
                        {formatTime(trace.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide">
                            Agent
                          </span>
                          {trace.contributor.model && (
                            <span className="text-[9px] text-gray-400 dark:text-gray-500">
                              {trace.contributor.model}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
                          {content || <span className="italic text-gray-400">(empty)</span>}
                        </p>
                      </div>
                    </div>
                  );
                }

                /* ── Agent thought ── */
                if (trace.eventType === "agent_thought") {
                  const content =
                    trace.conversation?.fullContent || trace.conversation?.contentPreview || "";
                  return (
                    <div key={trace.id} className="px-4 py-2 flex gap-3 bg-yellow-50/40 dark:bg-yellow-900/5">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
                        {formatTime(trace.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">
                          Thought
                        </span>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400 italic whitespace-pre-wrap break-words leading-relaxed">
                          {content}
                        </p>
                      </div>
                    </div>
                  );
                }

                /* ── Tool call ── */
                if (trace.eventType === "tool_call") {
                  return (
                    <div key={trace.id} className="px-4 py-2.5 flex gap-3">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
                        {formatTime(trace.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        {/* Tool header row */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
                            Tool
                          </span>
                          <code className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded border border-orange-100 dark:border-orange-800/40">
                            {trace.tool?.name ?? "unknown"}
                          </code>
                          {trace.tool?.status && (
                            <span
                              className={`text-[10px] font-medium ${
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
                        {/* Input parameters table */}
                        {trace.tool?.input != null && (
                          <div className="rounded-md border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                            <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60">
                              <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                Input Parameters
                              </span>
                            </div>
                            <div className="px-2 py-1.5 bg-white dark:bg-gray-900/40">
                              <ToolInputTable input={trace.tool.input} />
                            </div>
                          </div>
                        )}
                        {/* Files affected */}
                        {trace.files && trace.files.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {trace.files.map((f, i) => (
                              <span
                                key={i}
                                className="text-[9px] font-mono px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700"
                              >
                                {f.operation && (
                                  <span className="text-blue-500 dark:text-blue-400 mr-1">
                                    {f.operation}
                                  </span>
                                )}
                                {f.path}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                /* ── Tool result ── */
                if (trace.eventType === "tool_result") {
                  const rawOutput = trace.tool?.output;
                  const outputStr =
                    rawOutput == null
                      ? ""
                      : typeof rawOutput === "string"
                        ? rawOutput
                        : JSON.stringify(rawOutput, null, 2);
                  const TRUNCATE_LEN = 400;
                  const isTruncated = outputStr.length > TRUNCATE_LEN;
                  const displayOutput = isOutputExpanded
                    ? outputStr
                    : outputStr.slice(0, TRUNCATE_LEN);

                  return (
                    <div key={trace.id} className="px-4 py-2.5 flex gap-3">
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
                        {formatTime(trace.timestamp)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                            Tool Result
                          </span>
                          <code className="text-[11px] font-mono px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 rounded border border-cyan-100 dark:border-cyan-800/40">
                            {trace.tool?.name ?? "unknown"}
                          </code>
                          {trace.tool?.status && (
                            <span
                              className={`text-[10px] font-medium ${
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
                        {outputStr && (
                          <div className="rounded-md border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                            <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60">
                              <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                Output
                              </span>
                            </div>
                            <pre className="px-2 py-1.5 text-[10px] font-mono text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words bg-white dark:bg-gray-900/40">
                              {displayOutput}
                              {isTruncated && !isOutputExpanded && "…"}
                            </pre>
                            {isTruncated && (
                              <button
                                onClick={() => toggleOutputExpand(trace.id)}
                                className="w-full px-2 py-1 text-[10px] text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/40 border-t border-gray-200 dark:border-gray-700/60 transition-colors text-left"
                              >
                                {isOutputExpanded
                                  ? "Show less"
                                  : `Show all (${outputStr.length} chars)`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                /* ── Fallback ── */
                return (
                  <div key={trace.id} className="px-4 py-1.5 flex items-center gap-3">
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right">
                      {formatTime(trace.timestamp)}
                    </span>
                    <span className="text-[10px] text-gray-500 uppercase">{trace.eventType}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
