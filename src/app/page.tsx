"use client";

/**
 * Routa JS - Home Page
 *
 * A hero-style landing page for starting new conversations.
 * Features:
 * - Centered hero input with TiptapInput (skills, file mentions, etc.)
 * - Mode selection (ROUTA vs CRAFTER)
 * - Recent sessions shown as compact cards below
 *
 * From here, users can:
 * 1. Start a new conversation (auto-creates session and navigates to /[workspaceId]/[sessionId])
 * 2. Resume recent sessions
 * 3. Create/manage workspaces
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HomeInput } from "@/client/components/home-input";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { useAcp } from "@/client/hooks/use-acp";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { AgentInstallPanel } from "@/client/components/agent-install-panel";
import { ProtocolBadge } from "@/app/protocol-badge";

export default function HomePage() {
  const router = useRouter();
  const workspacesHook = useWorkspaces();
  const acp = useAcp();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAgentInstallPopup, setShowAgentInstallPopup] = useState(false);
  const agentInstallCloseRef = useRef<HTMLButtonElement>(null);
  const installAgentsButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-select first workspace on load
  useEffect(() => {
    if (!activeWorkspaceId && workspacesHook.workspaces.length > 0) {
      setActiveWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [workspacesHook.workspaces, activeWorkspaceId]);

  // Auto-connect on mount
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
  }, [acp.connected, acp.loading]);

  const handleWorkspaceSelect = useCallback((wsId: string) => {
    setActiveWorkspaceId(wsId);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const ws = await workspacesHook.createWorkspace(title);
    if (ws) handleWorkspaceSelect(ws.id);
  }, [workspacesHook, handleWorkspaceSelect]);

  const handleSessionClick = useCallback((sessionId: string) => {
    // Navigate to the workspace/session page
    if (activeWorkspaceId) {
      router.push(`/${activeWorkspaceId}/${sessionId}`);
    } else {
      router.push(`/${sessionId}`);
    }
  }, [activeWorkspaceId, router]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* Top Bar */}
      <header className="h-[52px] shrink-0 bg-white dark:bg-[#161922] border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 z-10">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt="Routa"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Routa
          </span>
        </div>

        {/* Workspace Selector */}
        {workspacesHook.workspaces.length > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {workspacesHook.workspaces.find((w) => w.id === activeWorkspaceId)?.title ?? "Select workspace"}
              </span>
              <WorkspaceSwitcher
                workspaces={workspacesHook.workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSelect={handleWorkspaceSelect}
                onCreate={handleWorkspaceCreate}
                loading={workspacesHook.loading}
                compact
              />
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Protocol badges */}
        <div className="hidden lg:flex items-center gap-2">
          <ProtocolBadge name="MCP" endpoint="/api/mcp" />
          <ProtocolBadge name="ACP" endpoint="/api/acp" />
        </div>

        {/* Install Agents Button */}
        <button
          ref={installAgentsButtonRef}
          onClick={() => setShowAgentInstallPopup(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Install Agents
        </button>

        {/* MCP Tools link */}
        <a
          href="/mcp-tools"
          className="hidden md:inline-flex px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-[11px] font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          MCP Tools
        </a>

        {/* Traces link */}
        <a
          href="/traces"
          className="hidden md:inline-flex px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-[11px] font-medium text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          Traces
        </a>
      </header>

      {/* Main Content - Centered Hero Layout */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Hero Section */}
          <div className="flex-1 flex items-center justify-center px-6 py-12">
            {/* Empty Workspace Onboarding */}
            {!workspacesHook.loading && workspacesHook.workspaces.length === 0 ? (
              <div className="w-full max-w-md bg-white dark:bg-[#161922] border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-5 shadow-lg">
                  <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Create your first workspace</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">A workspace organizes your sessions, notes, and codebases for a project.</p>
                <button
                  type="button"
                  onClick={() => handleWorkspaceCreate("My Workspace")}
                  className="px-8 py-3 text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 rounded-xl transition-all shadow-md hover:shadow-lg"
                >
                  Create Workspace
                </button>
              </div>
            ) : (
              /* Home Input with TiptapInput */
              <HomeInput
                workspaceId={activeWorkspaceId ?? undefined}
                onWorkspaceChange={(wsId) => {
                  setActiveWorkspaceId(wsId);
                  setRefreshKey((k) => k + 1);
                }}
                onSessionCreated={(sessionId) => {
                  setRefreshKey((k) => k + 1);
                }}
              />
            )}
          </div>

          {/* Recent Sessions Section */}
          {workspacesHook.workspaces.length > 0 && (
            <RecentSessionsBar
              workspaceId={activeWorkspaceId}
              refreshKey={refreshKey}
              onSessionClick={handleSessionClick}
            />
          )}
        </div>
      </main>

      {/* Agent Install Popup */}
      {showAgentInstallPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-install-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAgentInstallPopup(false)}
            aria-hidden="true"
          />
          <div
            className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-[#161922] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-11 px-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div id="agent-install-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Install Agents
                </div>
                <a
                  href="/settings/agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Open in new tab
                </a>
              </div>
              <button
                ref={agentInstallCloseRef}
                type="button"
                onClick={() => setShowAgentInstallPopup(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Close (Esc)"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(80vh-44px)]">
              <AgentInstallPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recent Sessions Bar Component ─────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  provider?: string;
  role?: string;
  createdAt: string;
}

interface RecentSessionsBarProps {
  workspaceId: string | null;
  refreshKey: number;
  onSessionClick: (sessionId: string) => void;
}

function RecentSessionsBar({ workspaceId, refreshKey, onSessionClick }: RecentSessionsBarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const url = workspaceId
          ? `/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=6`
          : "/api/sessions?limit=6";
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        setSessions(Array.isArray(data?.sessions) ? data.sessions.slice(0, 6) : []);
      } catch (e) {
        console.error("Failed to fetch sessions", e);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, [workspaceId, refreshKey]);

  // Don't render anything if there are no sessions (whether loading or not)
  if (sessions.length === 0) {
    return null;
  }

  const getDisplayName = (s: SessionInfo) => {
    if (s.name) return s.name;
    if (s.provider && s.role) return `${s.provider}-${s.role.toLowerCase()}`;
    if (s.provider) return s.provider;
    return `Session ${s.sessionId.slice(0, 6)}`;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-[#13151d]/50 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            Recent Sessions
          </h3>
          <a
            href="/sessions"
            className="text-xs text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            View all →
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => onSessionClick(s.sessionId)}
              className="group p-3 rounded-xl bg-white dark:bg-[#1a1f2e] border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all text-left"
            >
              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                {getDisplayName(s)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                {s.provider && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                    {s.provider}
                  </span>
                )}
                <span className="text-[10px] text-gray-300 dark:text-gray-600 ml-auto">
                  {formatTime(s.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}