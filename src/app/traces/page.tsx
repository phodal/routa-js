"use client";

/**
 * Trace Page - /traces
 *
 * Full-page view for browsing and analyzing Agent Trace records.
 * Features:
 * - Session list sidebar for selecting sessions
 * - Main trace panel showing detailed trace records
 * - Statistics overview
 * - Export functionality
 */

import { useState, useEffect, useCallback } from "react";
import { TracePanel } from "@/client/components/trace-panel";

interface Session {
  sessionId: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

export default function TracePage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Fetch all sessions
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/traces", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Failed to fetch traces: ${res.statusText}`);
      }

      const data = await res.json();
      const traces = data.traces || [];

      // Group traces by session
      const sessionMap = new Map<string, { count: number; first: string; last: string }>();
      for (const trace of traces) {
        const sid = trace.sessionId || "unknown";
        const existing = sessionMap.get(sid);
        if (!existing) {
          sessionMap.set(sid, {
            count: 1,
            first: trace.timestamp,
            last: trace.timestamp,
          });
        } else {
          existing.count++;
          if (trace.timestamp < existing.first) existing.first = trace.timestamp;
          if (trace.timestamp > existing.last) existing.last = trace.timestamp;
        }
      }

      // Convert to array and sort by last timestamp (newest first)
      const sessionList = Array.from(sessionMap.entries())
        .map(([sessionId, { count, first, last }]) => ({
          sessionId,
          count,
          firstTimestamp: first,
          lastTimestamp: last,
        }))
        .sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());

      setSessions(sessionList);

      // Auto-select first session if none selected
      if (!selectedSessionId && sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].sessionId);
      }
    } catch (err) {
      console.error("[TracePage] Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* Header */}
      <header className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="Back to Home"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Agent Trace Viewer
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Browse and analyze agent execution traces
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
          >
            {showSidebar ? "Hide Sessions" : "Show Sessions"}
          </button>
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 transition-colors"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Session Sidebar */}
        {showSidebar && (
          <aside className="w-80 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Sessions
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {sessions.length} session{sessions.length !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && sessions.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading sessions...</p>
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-4 text-center">
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
                  <p className="text-sm text-gray-500 dark:text-gray-400">No sessions found</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Start a conversation to create traces
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sessions.map((session) => (
                    <button
                      key={session.sessionId}
                      onClick={() => setSelectedSessionId(session.sessionId)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        selectedSessionId === session.sessionId
                          ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                          : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <code className="text-xs font-mono text-gray-900 dark:text-gray-100 truncate">
                          {session.sessionId.length > 20
                            ? `${session.sessionId.slice(0, 10)}...${session.sessionId.slice(-6)}`
                            : session.sessionId}
                        </code>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                          {session.count}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{formatTimestamp(session.lastTimestamp)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Trace Panel */}
        <main className="flex-1 min-w-0">
          {selectedSessionId ? (
            <TracePanel sessionId={selectedSessionId} />
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center">
                <svg
                  className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4"
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
                <p className="text-base text-gray-500 dark:text-gray-400 mb-2">
                  No session selected
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  Select a session from the sidebar to view traces
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

