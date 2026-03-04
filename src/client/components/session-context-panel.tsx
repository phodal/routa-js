"use client";

import { useEffect, useState, useCallback } from "react";
import { desktopAwareFetch } from "../utils/diagnostics";

interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  provider?: string;
  role?: string;
  model?: string;
  createdAt: string;
  parentSessionId?: string;
}

interface SessionContext {
  current: SessionInfo;
  parent?: SessionInfo;
  children: SessionInfo[];
  siblings: SessionInfo[];
  recentInWorkspace: SessionInfo[];
}

interface SessionContextPanelProps {
  sessionId: string;
  workspaceId: string;
  onSelectSession: (sessionId: string) => void;
  refreshTrigger?: number;
}

export function SessionContextPanel({
  sessionId,
  workspaceId: _workspaceId,
  onSelectSession,
  refreshTrigger = 0,
}: SessionContextPanelProps) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    hierarchy: true,
  });

  const fetchContext = useCallback(async () => {
    try {
      setLoading(true);
      const res = await desktopAwareFetch(
        `/api/sessions/${sessionId}/context`,
        { cache: "no-store" }
      );
      
      if (!res.ok) {
        setContext(null);
        return;
      }
      
      const data = await res.json();
      setContext(data);
    } catch (e) {
      console.error("Failed to fetch session context", e);
      setContext(null);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext, refreshTrigger]); // 添加 refreshTrigger 依赖

  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-gray-400 dark:text-gray-500 text-xs">
        Loading...
      </div>
    );
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getDefaultName = (s: SessionInfo) => {
    if (s.provider && s.role) {
      return `${s.provider}-${s.role.toLowerCase()}-${s.sessionId.slice(0, 6)}`;
    }
    if (s.provider) {
      return `${s.provider}-${s.sessionId.slice(0, 7)}`;
    }
    return s.sessionId.slice(0, 8);
  };

  // Return early if context is not available
  if (!context) {
    return null;
  }

  const hasHierarchy = context.parent || context.children.length > 0;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800">
      {/* Current Session Info */}
      <div className="px-3 py-3 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30">
        <div className="flex items-start gap-2">
          <svg
            className="w-4 h-4 text-blue-500 shrink-0 mt-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">
              {context.current.name ?? getDefaultName(context.current)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
              {context.current.role && (
                <span className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded">
                  {context.current.role}
                </span>
              )}
              {context.current.provider && (
                <span className="text-blue-500 dark:text-blue-400">
                  {context.current.provider}
                </span>
              )}
              <span className="text-blue-400 dark:text-blue-500">•</span>
              <span className="text-blue-500 dark:text-blue-400">
                {formatTimeAgo(context.current.createdAt)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Session Hierarchy */}
      {hasHierarchy && (
        <div className="border-b border-gray-100 dark:border-gray-800">
          <button
            onClick={() =>
              setExpandedSections((prev) => ({
                ...prev,
                hierarchy: !prev.hierarchy,
              }))
            }
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Hierarchy
              </span>
            </div>
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${
                expandedSections.hierarchy ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {expandedSections.hierarchy && (
            <div className="px-3 pb-2 space-y-1">
              {/* Parent Session */}
              {context.parent && (
                <div
                  onClick={() => onSelectSession(context.parent!.sessionId)}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <svg
                    className="w-3 h-3 text-gray-400 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 10l7-7m0 0l7 7m-7-7v18"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">
                      {context.parent.name ?? getDefaultName(context.parent)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      Parent • {context.parent.role}
                    </div>
                  </div>
                </div>
              )}

              {/* Child Sessions */}
              {context.children.length > 0 && (
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <svg
                      className="w-3 h-3 text-gray-400 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {context.children.length} Child Session
                      {context.children.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {context.children.map((child) => (
                      <div key={child.sessionId} className="ml-5">
                        <div
                          onClick={() => onSelectSession(child.sessionId)}
                          className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                        >
                          <svg
                            className="w-3 h-3 text-amber-500 shrink-0 mt-0.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13 10V3L4 14h7v7l9-11h-7z"
                            />
                          </svg>
                          <div className="min-w-0 flex-1">
                            <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">
                              {child.name ?? getDefaultName(child)}
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500">
                              {child.role} • {formatTimeAgo(child.createdAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}


    </div>
  );
}
