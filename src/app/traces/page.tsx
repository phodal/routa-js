"use client";

/**
 * Trace Page - /traces
 *
 * Full-page view for browsing and analyzing Agent Trace records.
 * Sessions are cross-referenced with /api/sessions to show names.
 *
 * Three view modes:
 * - Chat (original TracePanel)
 * - Trace (EventBridge semantic blocks)
 * - Trace(AG-UI) (AG-UI protocol events)
 */

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { TracePanel } from "@/client/components/trace-panel";
import { EventBridgeTracePanel } from "@/client/components/event-bridge-trace-panel";
import { AGUITracePanel } from "@/client/components/ag-ui-trace-panel";
import type { TraceRecord } from "@/core/trace";

type ViewTab = "chat" | "event-bridge" | "ag-ui";

interface Session {
  sessionId: string;
  name?: string;
  provider?: string;
  role?: string;
  parentSessionId?: string;
  count: number;
  firstTimestamp: string;
  lastTimestamp: string;
}

function TracePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [activeTab, setActiveTab] = useState<ViewTab>("chat");
  const [sessionTraces, setSessionTraces] = useState<TraceRecord[]>([]);
  const [tracesLoading, setTracesLoading] = useState(false);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch traces and session metadata in parallel
      const [tracesRes, sessionsRes] = await Promise.all([
        fetch("/api/traces", { cache: "no-store" }),
        fetch("/api/sessions", { cache: "no-store" }),
      ]);

      const tracesData = tracesRes.ok ? await tracesRes.json() : { traces: [] };
      const sessionsData = sessionsRes.ok ? await sessionsRes.json() : { sessions: [] };

      const traces = tracesData.traces || [];
      const sessionMeta = new Map<string, { name?: string; provider?: string; role?: string; parentSessionId?: string }>(
        (sessionsData.sessions || []).map((s: { sessionId: string; name?: string; provider?: string; role?: string; parentSessionId?: string }) => [
          s.sessionId,
          { name: s.name, provider: s.provider, role: s.role, parentSessionId: s.parentSessionId },
        ])
      );

      // Group traces by session
      const sessionMap = new Map<string, { count: number; first: string; last: string }>();
      for (const trace of traces) {
        const sid = trace.sessionId || "unknown";
        const existing = sessionMap.get(sid);
        if (!existing) {
          sessionMap.set(sid, { count: 1, first: trace.timestamp, last: trace.timestamp });
        } else {
          existing.count++;
          if (trace.timestamp < existing.first) existing.first = trace.timestamp;
          if (trace.timestamp > existing.last) existing.last = trace.timestamp;
        }
      }

      const sessionList = Array.from(sessionMap.entries())
        .map(([sessionId, { count, first, last }]) => ({
          sessionId,
          name: sessionMeta.get(sessionId)?.name,
          provider: sessionMeta.get(sessionId)?.provider,
          role: sessionMeta.get(sessionId)?.role,
          parentSessionId: sessionMeta.get(sessionId)?.parentSessionId,
          count,
          firstTimestamp: first,
          lastTimestamp: last,
        }))
        .sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime());

      setSessions(sessionList);

      // Check URL parameter first, then use first session
      const urlSessionId = searchParams.get("sessionId");
      if (urlSessionId && sessionList.some(s => s.sessionId === urlSessionId)) {
        setSelectedSessionId(urlSessionId);
      } else if (!selectedSessionId && sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].sessionId);
      }
    } catch (err) {
      console.error("[TracePage] Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId, searchParams]);

  // Fetch traces for the selected session (shared across all view tabs)
  const fetchSessionTraces = useCallback(async () => {
    if (!selectedSessionId) {
      setSessionTraces([]);
      return;
    }
    setTracesLoading(true);
    try {
      const params = new URLSearchParams({ sessionId: selectedSessionId });
      const res = await fetch(`/api/traces?${params}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessionTraces(data.traces || []);
      }
    } catch (err) {
      console.error("[TracePage] Failed to fetch traces:", err);
    } finally {
      setTracesLoading(false);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    fetchSessionTraces();
  }, [fetchSessionTraces]);

  // Update URL when session changes
  const handleSessionSelect = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("sessionId", sessionId);
    router.push(`/traces?${params.toString()}`);
  };

  // Copy current URL to clipboard
  const copyCurrentUrl = () => {
    if (typeof window !== "undefined" && selectedSessionId) {
      const url = `${window.location.origin}/traces?sessionId=${selectedSessionId}`;
      navigator.clipboard.writeText(url);
    }
  };

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
          {selectedSessionId && (
            <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
              <button
                onClick={copyCurrentUrl}
                className="group flex items-center gap-2 px-2.5 py-1.5 rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Copy shareable URL"
              >
                <span className="text-xs text-gray-500 dark:text-gray-400">Session:</span>
                <code className="text-xs font-mono text-gray-700 dark:text-gray-300">
                  {selectedSessionId.slice(0, 8)}...
                </code>
                <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View tab switcher */}
          <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 p-0.5">
            {([
              { key: "chat" as ViewTab, label: "Chat", color: "bg-blue-500" },
              { key: "event-bridge" as ViewTab, label: "Trace", color: "bg-purple-500" },
              { key: "ag-ui" as ViewTab, label: "Trace(AG-UI)", color: "bg-indigo-500" },
            ]).map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                  activeTab === key
                    ? `${color} text-white shadow-sm`
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
                  {(() => {
                    // Separate top-level (parent) sessions from child sessions
                    const parentSessions = sessions.filter(s => !s.parentSessionId);
                    const childSessionMap = new Map<string, Session[]>();
                    for (const s of sessions) {
                      if (s.parentSessionId) {
                        const children = childSessionMap.get(s.parentSessionId) ?? [];
                        children.push(s);
                        childSessionMap.set(s.parentSessionId, children);
                      }
                    }

                    const renderSession = (session: Session, isChild = false) => {
                      const roleColor: Record<string, string> = {
                        ROUTA: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
                        CRAFTER: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
                        GATE: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300",
                        DEVELOPER: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
                      };
                      const roleClass = session.role ? (roleColor[session.role] ?? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400") : "";

                      return (
                        <div key={session.sessionId}>
                          <button
                            onClick={() => handleSessionSelect(session.sessionId)}
                            className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                              isChild ? "pl-8 py-2" : ""
                            } ${
                              selectedSessionId === session.sessionId
                                ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                                : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                                {session.name || (
                                  <code className="font-mono">
                                    {session.sessionId.slice(0, 8)}…
                                  </code>
                                )}
                              </span>
                              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 shrink-0">
                                {session.count}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                              <span>{formatTimestamp(session.lastTimestamp)}</span>
                              {session.role && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${roleClass}`}>
                                  {session.role}
                                </span>
                              )}
                              {session.provider && (
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[10px]">
                                  {session.provider}
                                </span>
                              )}
                            </div>
                          </button>
                          {/* Child sessions indented under parent */}
                          {!isChild && childSessionMap.has(session.sessionId) && (
                            <div className="border-l-2 border-gray-200 dark:border-gray-700 ml-4">
                              {(childSessionMap.get(session.sessionId) ?? []).map(child => renderSession(child, true))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    return [
                      ...parentSessions.map(s => renderSession(s, false)),
                      // Any sessions without a recognized parent (orphans) shown at bottom
                      ...sessions.filter(s => s.parentSessionId && !sessions.some(p => p.sessionId === s.parentSessionId)).map(s => renderSession(s, false)),
                    ];
                  })()}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Trace Panel */}
        <main className="flex-1 min-w-0">
          {selectedSessionId ? (
            <>
              {activeTab === "chat" && (
                <TracePanel sessionId={selectedSessionId} />
              )}
              {activeTab === "event-bridge" && (
                <EventBridgeTracePanel sessionId={selectedSessionId} traces={sessionTraces} />
              )}
              {activeTab === "ag-ui" && (
                <AGUITracePanel sessionId={selectedSessionId} traces={sessionTraces} />
              )}
            </>
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

// Default export with Suspense boundary for useSearchParams()
export default function TracePage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <TracePageContent />
    </Suspense>
  );
}
