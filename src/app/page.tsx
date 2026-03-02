"use client";

/**
 * Routa JS - Home Page
 *
 * Task-first, operational layout:
 * - Input dominates the viewport — type immediately
 * - Agent selection is lightweight (dropdown in control bar)
 * - Context (Workspace / Repo) structured in input's bottom bar
 * - Skills shown as scannable grid cards
 * - Recent sessions as compact inline pills
 */

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HomeInput } from "@/client/components/home-input";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { useAcp } from "@/client/hooks/use-acp";
import { useSkills } from "@/client/hooks/use-skills";
import { AgentInstallPanel } from "@/client/components/agent-install-panel";
import { SettingsPanel } from "@/client/components/settings-panel";
import { NotificationProvider, NotificationBell } from "@/client/components/notification-center";

export default function HomePage() {
  const router = useRouter();
  const workspacesHook = useWorkspaces();
  const acp = useAcp();
  const skillsHook = useSkills();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAgentInstall, setShowAgentInstall] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

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
    if (activeWorkspaceId) {
      router.push(`/workspace/${activeWorkspaceId}/sessions/${sessionId}`);
    } else {
      router.push(`/workspace/${sessionId}`);
    }
  }, [activeWorkspaceId, router]);

  return (
    <NotificationProvider>
    <div className="h-screen flex flex-col bg-[#fafafa] dark:bg-[#0a0c12]">
      {/* ─── Minimal Header ─────────────────────────────────────────── */}
      <header className="h-11 shrink-0 flex items-center px-5 z-10 border-b border-gray-100 dark:border-[#151720]">
        <div className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Routa" width={22} height={22} className="rounded-md" />
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-tight">
            Routa
          </span>
        </div>

        <div className="flex-1" />

        <nav className="flex items-center gap-0.5">
          <button
            onClick={() => setShowAgentInstall(true)}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Agents
          </button>
          <a
            href="/mcp-tools"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            MCP
          </a>
          <a
            href="/traces"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Traces
          </a>
          <a
            href="/settings/webhooks"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Webhooks
          </a>
          <a
            href="/settings/schedules"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Schedules
          </a>
          <a
            href="/messages"
            className="px-2.5 py-1 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            Messages
          </a>
          <NotificationBell />
          <button
            onClick={() => setShowSettingsPanel(true)}
            className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#151720] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Protocol status indicators */}
          <div className="ml-2 flex items-center gap-3 pl-3 border-l border-gray-200 dark:border-[#1f2233]">
            <StatusDot label="MCP" />
            <StatusDot label="ACP" />
          </div>
        </nav>
      </header>

      {/* ─── Main Content ───────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="min-h-full flex flex-col">
          {/* Input Section — vertically centered, dominant */}
          <div className="flex-1 flex items-center justify-center px-6 pt-4 pb-6 min-h-[260px]">
            {!workspacesHook.loading && workspacesHook.workspaces.length === 0 ? (
              <OnboardingCard onCreateWorkspace={handleWorkspaceCreate} />
            ) : (
              <div className="w-full flex flex-col items-center">
                <RoutaHeroLogo />
                <HomeInput
                  workspaceId={activeWorkspaceId ?? undefined}
                  onWorkspaceChange={(wsId) => {
                    setActiveWorkspaceId(wsId);
                    setRefreshKey((k) => k + 1);
                  }}
                  onSessionCreated={() => {
                    setRefreshKey((k) => k + 1);
                  }}
                  displaySkills={skillsHook.allSkills}
                />
              </div>
            )}
          </div>

          {/* Recent Sessions */}
          {workspacesHook.workspaces.length > 0 && (
            <RecentSessions
              workspaceId={activeWorkspaceId}
              refreshKey={refreshKey}
              onSessionClick={handleSessionClick}
            />
          )}
        </div>
      </main>

      {/* ─── Agent Install Modal ────────────────────────────────────── */}
      {showAgentInstall && (
        <OverlayModal onClose={() => setShowAgentInstall(false)} title="Install Agents">
          <AgentInstallPanel />
        </OverlayModal>
      )}

      {/* ─── Settings Panel ────────────────────────────────────────── */}
      <SettingsPanel
        open={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        providers={acp.providers}
      />
    </div>
    </NotificationProvider>
  );
}

// ─── Routa Hero Logo with Agent Flow Animation ────────────────────────

function RoutaHeroLogo() {
  return (
    <div className="mb-6 flex flex-col items-center gap-3 select-none">
      {/* Animated agent-flow diagram */}
      <div className="relative w-[200px] h-[72px]">
        <svg
          viewBox="0 0 200 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full"
        >
          <defs>
            <linearGradient id="hero-blue" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#60A5FA" />
              <stop offset="100%" stopColor="#3B82F6" />
            </linearGradient>
            <linearGradient id="hero-orange" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FCD34D" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
            <linearGradient id="hero-green" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
          </defs>

          {/* Routes: Routa → Tasks */}
          <path d="M 40 36 C 60 36, 70 16, 90 16" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />
          <path d="M 40 36 L 90 36" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />
          <path d="M 40 36 C 60 36, 70 56, 90 56" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />

          {/* Routes: Tasks → Gate */}
          <path d="M 90 16 C 110 16, 130 36, 160 36" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />
          <path d="M 90 36 L 160 36" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />
          <path d="M 90 56 C 110 56, 130 36, 160 36" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.25" />

          {/* Flowing dots on top route */}
          <circle r="2" fill="#60A5FA" opacity="0.9">
            <animateMotion dur="2.4s" repeatCount="indefinite" path="M 40 36 C 60 36, 70 16, 90 16" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="#F59E0B" opacity="0.9">
            <animateMotion dur="2.4s" repeatCount="indefinite" path="M 90 16 C 110 16, 130 36, 160 36" begin="1.2s" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.4s" repeatCount="indefinite" begin="1.2s" />
          </circle>

          {/* Flowing dots on middle route */}
          <circle r="2" fill="#60A5FA" opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path="M 40 36 L 90 36" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2s" repeatCount="indefinite" />
          </circle>
          <circle r="2" fill="#F59E0B" opacity="0.9">
            <animateMotion dur="2s" repeatCount="indefinite" path="M 90 36 L 160 36" begin="1s" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2s" repeatCount="indefinite" begin="1s" />
          </circle>

          {/* Flowing dots on bottom route */}
          <circle r="2" fill="#60A5FA" opacity="0.9">
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M 40 36 C 60 36, 70 56, 90 56" begin="0.4s" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.8s" repeatCount="indefinite" begin="0.4s" />
          </circle>
          <circle r="2" fill="#10B981" opacity="0.9">
            <animateMotion dur="2.8s" repeatCount="indefinite" path="M 90 56 C 110 56, 130 36, 160 36" begin="1.8s" />
            <animate attributeName="opacity" values="0;0.9;0.9;0" dur="2.8s" repeatCount="indefinite" begin="1.8s" />
          </circle>

          {/* Routa node (blue) — coordinator */}
          <circle cx="40" cy="36" r="14" fill="url(#hero-blue)">
            <animate attributeName="r" values="14;15;14" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="40" cy="36" r="7" fill="#0f172a" />
          <circle cx="40" cy="36" r="4.5" fill="#60A5FA" opacity="0.35">
            <animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" />
          </circle>

          {/* Task nodes (orange) */}
          <circle cx="90" cy="16" r="7" fill="url(#hero-orange)" />
          <circle cx="90" cy="16" r="3.5" fill="#0f172a" />

          <circle cx="90" cy="36" r="7" fill="url(#hero-orange)" />
          <circle cx="90" cy="36" r="3.5" fill="#0f172a" />

          <circle cx="90" cy="56" r="7" fill="url(#hero-orange)" />
          <circle cx="90" cy="56" r="3.5" fill="#0f172a" />

          {/* Gate node (green) — verification */}
          <circle cx="160" cy="36" r="11" fill="url(#hero-green)">
            <animate attributeName="r" values="11;12;11" dur="3s" repeatCount="indefinite" begin="1.5s" />
          </circle>
          <circle cx="160" cy="36" r="5.5" fill="#0f172a" />
          <circle cx="160" cy="36" r="3.5" fill="#10B981" opacity="0.4">
            <animate attributeName="opacity" values="0.2;0.6;0.2" dur="3s" repeatCount="indefinite" begin="1.5s" />
          </circle>
        </svg>
      </div>

      {/* Brand text */}
      <span className="text-[15px] font-semibold tracking-tight text-gray-800 dark:text-gray-200">
        Routa
      </span>
    </div>
  );
}

// ─── Status Dot ────────────────────────────────────────────────────────

function StatusDot({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label} connected`}>
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  );
}

// ─── Onboarding Card ──────────────────────────────────────────────────

function OnboardingCard({ onCreateWorkspace }: { onCreateWorkspace: (title: string) => void }) {
  return (
    <div className="w-full max-w-sm text-center">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-amber-500/20">
        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1.5">
        Create a workspace
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Organize your sessions and projects in one place.
      </p>
      <button
        type="button"
        onClick={() => onCreateWorkspace("My Workspace")}
        className="px-6 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 rounded-xl transition-all shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40"
      >
        Get Started
      </button>
    </div>
  );
}

// ─── Recent Sessions ──────────────────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  provider?: string;
  role?: string;
  createdAt: string;
}

function RecentSessions({
  workspaceId,
  refreshKey,
  onSessionClick,
}: {
  workspaceId: string | null;
  refreshKey: number;
  onSessionClick: (id: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const url = workspaceId
          ? `/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=8`
          : "/api/sessions?limit=8";
        const res = await fetch(url, { cache: "no-store" });
        const data = await res.json();
        setSessions(Array.isArray(data?.sessions) ? data.sessions.slice(0, 8) : []);
      } catch {
        /* ignore */
      }
    };
    fetchSessions();
  }, [workspaceId, refreshKey]);

  if (sessions.length === 0) return null;

  const formatTime = (dateStr: string) => {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  };

  const getDisplayName = (s: SessionInfo) => {
    if (s.name) return s.name;
    if (s.provider && s.role) return `${s.provider} · ${s.role.toLowerCase()}`;
    if (s.provider) return s.provider;
    return `Session ${s.sessionId.slice(0, 6)}`;
  };

  return (
    <div className="px-6 pb-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Recent
          </h3>
          <div className="flex-1 h-px bg-gray-100 dark:bg-[#171a24]" />
          <a
            href="/sessions"
            className="text-[11px] text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
          >
            View all →
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => onSessionClick(s.sessionId)}
              className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#12141c] border border-gray-100 dark:border-[#1c1f2e] hover:border-amber-300 dark:hover:border-amber-700/50 transition-all hover:shadow-sm"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-amber-500 transition-colors" />
              <span className="text-xs text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors max-w-[160px] truncate">
                {getDisplayName(s)}
              </span>
              <span className="text-[10px] text-gray-300 dark:text-gray-600 font-mono">
                {formatTime(s.createdAt)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Overlay Modal ────────────────────────────────────────────────────

function OverlayModal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-[#12141c] border border-gray-200 dark:border-[#1c1f2e] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-4 border-b border-gray-100 dark:border-[#1c1f2e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </span>
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
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-[#1c1f2e] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Close (Esc)"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="h-[calc(80vh-44px)]">{children}</div>
      </div>
    </div>
  );
}