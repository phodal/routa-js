"use client";

import { useCallback, useEffect, useState, useRef } from "react";

export interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  routaAgentId?: string;
  provider?: string;
  role?: string;
  modeId?: string;
  createdAt: string;
}

interface SessionPanelProps {
  selectedSessionId: string | null;
  onSelect: (sessionId: string) => void;
  refreshKey?: number;
  onSessionDeleted?: (sessionId: string) => void;
}

export function SessionPanel({
  selectedSessionId,
  onSelect,
  refreshKey,
  onSessionDeleted,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sessions", { cache: "no-store" });
      const data = await res.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e) {
      console.error("Failed to fetch sessions", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, refreshKey]);

  const handleRename = async (sessionId: string, name: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      fetchSessions();
    } catch (e) {
      console.error("Failed to rename session", e);
    }
  };

  const handleDelete = async (sessionId: string) => {
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      fetchSessions();
      onSessionDeleted?.(sessionId);
    } catch (e) {
      console.error("Failed to delete session", e);
    }
  };

  const startEdit = (s: SessionInfo) => {
    setEditingId(s.sessionId);
    setEditName(s.name ?? getDefaultName(s));
    setMenuOpen(null);
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

  return (
    <div>
      {/* Section header */}
      <div className="px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Sessions
          </span>
          {sessions.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
              {sessions.length}
            </span>
          )}
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
        >
          {loading ? "..." : "Refresh"}
        </button>
      </div>

      {/* Session list */}
      <div className="px-1.5">
        {sessions.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-400 dark:text-gray-500 text-xs">
            No sessions yet. Select a provider and create one.
          </div>
        ) : (
          sessions.map((s) => {
            const active = s.sessionId === selectedSessionId;
            const isEditing = editingId === s.sessionId;
            const displayName = s.name ?? getDefaultName(s);

            return (
              <div key={s.sessionId} className="relative mb-0.5">
                {isEditing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleRename(s.sessionId, editName);
                      setEditingId(null);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5"
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      autoFocus
                      className="flex-1 text-xs px-1.5 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      onBlur={() => {
                        if (editName.trim()) {
                          handleRename(s.sessionId, editName);
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSelect(s.sessionId)}
                    className={`w-full text-left px-2.5 py-2 rounded-md transition-colors ${
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium truncate">{displayName}</div>
                        {s.modeId && (
                          <div className="mt-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                            {s.modeId}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${active ? "bg-blue-500" : "bg-green-500"}`} />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpen(menuOpen === s.sessionId ? null : s.sessionId);
                          }}
                          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          style={{ opacity: active || menuOpen === s.sessionId ? 1 : undefined }}
                        >
                          <svg className="w-3.5 h-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </button>
                )}

                {/* Context menu */}
                {menuOpen === s.sessionId && (
                  <div
                    ref={menuRef}
                    className="absolute right-2 top-8 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg py-1 min-w-[100px]"
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(null);
                        handleDelete(s.sessionId);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
