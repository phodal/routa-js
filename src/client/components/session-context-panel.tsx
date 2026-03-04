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
  notes?: Array<{
    id: string;
    title: string;
    metadata: {
      type: string;
      taskStatus?: string;
    };
    sessionId?: string;
  }>;
}

export function SessionContextPanel({
  sessionId,
  workspaceId,
  onSelectSession,
  notes = [],
}: SessionContextPanelProps) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    hierarchy: true, // 默认展开 hierarchy
    related: false,
  });

  const fetchContext = useCallback(async () => {
    try {
      setLoading(true);
      const res = await desktopAwareFetch(
        `/api/sessions/${sessionId}/context`,
        { cache: "no-store" }
      );
      const data = await res.json();
      setContext(data);
    } catch (e) {
      console.error("Failed to fetch session context", e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  if (loading) {
    return (
      <div className="px-3 py-4 text-center text-gray-400 dark:text-gray-500 text-xs">
        Loading...
      </div>
    );
  }

  if (!context) {
    return null;
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

  const hasHierarchy = context.parent || context.children.length > 0;
  const hasRelated =
    context.siblings.length > 0 || context.recentInWorkspace.length > 0;

  // Filter tasks related to this session or its parent
  const relatedTasks = notes.filter((note) => {
    if (note.metadata.type !== "task") return false;
    // Show tasks from current session or parent session
    return (
      note.sessionId === sessionId ||
      (context.parent && note.sessionId === context.parent.sessionId)
    );
  });

  const hasTasks = relatedTasks.length > 0;

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
                  {context.children.map((child) => {
                    // Find task associated with this child session
                    const childTask = relatedTasks.find(
                      (task) => task.sessionId === child.sessionId
                    );
                    return (
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
                            {childTask && (
                              <div className="mt-0.5 flex items-center gap-1">
                                <svg
                                  className="w-2.5 h-2.5 text-blue-500"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                  />
                                </svg>
                                <span className="text-[10px] text-blue-600 dark:text-blue-400 truncate">
                                  {childTask.title}
                                </span>
                                {childTask.metadata.taskStatus && (
                                  <span
                                    className={`text-[9px] px-1 py-0.5 rounded ${
                                      childTask.metadata.taskStatus ===
                                      "COMPLETED"
                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                        : childTask.metadata.taskStatus ===
                                          "IN_PROGRESS"
                                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                    }`}
                                  >
                                    {childTask.metadata.taskStatus}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tasks from parent session (if current is a child) */}
              {hasTasks && context.parent && (
                <div className="mt-2 space-y-0.5">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    <svg
                      className="w-3 h-3 text-blue-500 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      Related Tasks ({relatedTasks.length})
                    </span>
                  </div>
                  {relatedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="ml-5 px-2 py-1.5 rounded-md bg-blue-50 dark:bg-blue-900/10"
                    >
                      <div className="flex items-start gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-medium text-blue-700 dark:text-blue-300 truncate">
                            {task.title}
                          </div>
                          {task.metadata.taskStatus && (
                            <div className="mt-0.5">
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded ${
                                  task.metadata.taskStatus === "COMPLETED"
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                    : task.metadata.taskStatus === "IN_PROGRESS"
                                    ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {task.metadata.taskStatus}
                              </span>
                            </div>
                          )}
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

      {/* Related Sessions */}
      {hasRelated && (
        <div>
          <button
            onClick={() =>
              setExpandedSections((prev) => ({
                ...prev,
                related: !prev.related,
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
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Related
              </span>
              <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                {context.siblings.length + context.recentInWorkspace.length}
              </span>
            </div>
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${
                expandedSections.related ? "rotate-180" : ""
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

          {expandedSections.related && (
            <div className="px-3 pb-2 space-y-1">
              {/* Sibling Sessions */}
              {context.siblings.map((sibling) => (
                <div
                  key={sibling.sessionId}
                  onClick={() => onSelectSession(sibling.sessionId)}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                >
                  <svg
                    className="w-3 h-3 text-purple-500 shrink-0 mt-0.5"
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
                      {sibling.name ?? getDefaultName(sibling)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      Sibling • {sibling.role}
                    </div>
                  </div>
                </div>
              ))}

              {/* Recent Sessions */}
              {context.recentInWorkspace.map((recent) => (
                <div
                  key={recent.sessionId}
                  onClick={() => onSelectSession(recent.sessionId)}
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
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate">
                      {recent.name ?? getDefaultName(recent)}
                    </div>
                    <div className="text-[10px] text-gray-400 dark:text-gray-500">
                      {recent.role} • {formatTimeAgo(recent.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
