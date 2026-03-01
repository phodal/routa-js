"use client";

/**
 * Workspace Dashboard
 *
 * A command-center view for a single workspace. Unlike the home page
 * (which is a task-first input), this page surfaces the workspace's
 * operational state at a glance:
 *
 *   - Active agents, tasks, sessions
 *   - Notes and specs
 *   - Codebases linked
 *   - Quick actions: new session, create task, add note
 *   - Trace activity feed
 *
 * Route: /workspace/[workspaceId]
 */

import { useCallback, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { HomeInput } from "@/client/components/home-input";
import { useWorkspaces, useCodebases } from "@/client/hooks/use-workspaces";
import { useAcp } from "@/client/hooks/use-acp";
import { useAgentsRpc } from "@/client/hooks/use-agents-rpc";
import { useNotes } from "@/client/hooks/use-notes";
import { useSkills } from "@/client/hooks/use-skills";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { AgentInstallPanel } from "@/client/components/agent-install-panel";
import { ProtocolBadge } from "@/app/protocol-badge";

// ─── Types ─────────────────────────────────────────────────────────

interface SessionInfo {
  sessionId: string;
  name?: string;
  cwd: string;
  workspaceId: string;
  provider?: string;
  role?: string;
  createdAt: string;
}

interface TaskInfo {
  id: string;
  title: string;
  objective?: string;
  status: string;
  assignedTo?: string;
  createdAt: string;
}

interface BackgroundTaskInfo {
  id: string;
  title: string;
  prompt: string;
  agentId: string;
  status: string;
  triggerSource?: string;
  priority?: string;
  resultSessionId?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastActivity?: string;
  currentActivity?: string;
  toolCallCount?: number;
}

interface TraceInfo {
  id: string;
  agentName?: string;
  agentRole?: string;
  action?: string;
  summary?: string;
  durationMs?: number;
  createdAt: string;
}

// ─── Main Component ────────────────────────────────────────────────

export function WorkspacePageClient() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const workspacesHook = useWorkspaces();
  const acp = useAcp();
  const { codebases } = useCodebases(workspaceId);
  const agentsHook = useAgentsRpc(workspaceId);
  const notesHook = useNotes(workspaceId);
  const skillsHook = useSkills();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [traces, setTraces] = useState<TraceInfo[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAgentInstallPopup, setShowAgentInstallPopup] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "bg_tasks">("overview");
  const [bgTasks, setBgTasks] = useState<BackgroundTaskInfo[]>([]);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchPrompt, setDispatchPrompt] = useState("");
  const [dispatchAgentId, setDispatchAgentId] = useState("");
  const [dispatchLoading, setDispatchLoading] = useState(false);

  // Auto-connect ACP
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
  }, [acp.connected, acp.loading]);

  // Fetch sessions
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=20`, { cache: "no-store" });
        const data = await res.json();
        setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, refreshKey]);

  // Fetch tasks
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/tasks?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
        const data = await res.json();
        setTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, refreshKey]);

  // Fetch background tasks
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/background-tasks?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
        const data = await res.json();
        setBgTasks(Array.isArray(data?.tasks) ? data.tasks : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, refreshKey]);

  // Fetch traces
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/traces?limit=10`, { cache: "no-store" });
        const data = await res.json();
        setTraces(Array.isArray(data?.traces) ? data.traces.slice(0, 8) : []);
      } catch { /* ignore */ }
    })();
  }, [workspaceId, refreshKey]);

  // Verify workspace
  const workspace = workspacesHook.workspaces.find((w) => w.id === workspaceId);
  const isDefaultWorkspace = workspaceId === "default";

  useEffect(() => {
    if (!workspacesHook.loading && !workspace && !isDefaultWorkspace) {
      router.push("/");
    }
  }, [workspace, workspacesHook.loading, router, isDefaultWorkspace]);

  const handleWorkspaceSelect = useCallback((wsId: string) => {
    router.push(`/workspace/${wsId}`);
  }, [router]);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const ws = await workspacesHook.createWorkspace(title);
    if (ws) router.push(`/workspace/${ws.id}`);
  }, [workspacesHook, router]);

  if (workspacesHook.loading && !isDefaultWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fafafa] dark:bg-[#0a0c12]">
        <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading workspace…
        </div>
      </div>
    );
  }

  if (!workspace && !isDefaultWorkspace) return null;

  const effectiveWorkspace = workspace ?? {
    id: "default",
    title: "Default Workspace",
    status: "active" as const,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // ─── Computed stats ──────────────────────────────────────────────
  const activeAgents = agentsHook.agents.filter((a) => a.status === "ACTIVE");
  const pendingTasks = tasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS");
  const specNotes = notesHook.notes.filter((n) => n.metadata?.type === "spec");
  const runningBgTasks = bgTasks.filter((t) => t.status === "RUNNING").length;

  const handleDispatchTask = async () => {
    if (!dispatchPrompt.trim() || !dispatchAgentId.trim()) return;
    setDispatchLoading(true);
    try {
      await fetch("/api/background-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: dispatchPrompt, agentId: dispatchAgentId, workspaceId }),
      });
      setShowDispatchModal(false);
      setDispatchPrompt("");
      setRefreshKey((k) => k + 1);
    } finally {
      setDispatchLoading(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#fafafa] dark:bg-[#0a0c12]">
      {/* ─── Top Bar ───────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 flex items-center px-5 border-b border-gray-200/60 dark:border-[#191c28] bg-white/80 dark:bg-[#0e1019]/80 backdrop-blur-md z-20">
        <a href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <img src="/logo.svg" alt="Routa" width={24} height={24} className="rounded-md" />
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 tracking-tight">Routa</span>
        </a>

        <svg className="w-4 h-4 mx-2.5 text-gray-300 dark:text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>

        {/* Workspace name + switcher */}
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate max-w-[180px]">
            {effectiveWorkspace.title}
          </span>
          <WorkspaceSwitcher
            workspaces={workspacesHook.workspaces}
            activeWorkspaceId={workspaceId}
            onSelect={handleWorkspaceSelect}
            onCreate={handleWorkspaceCreate}
            loading={workspacesHook.loading}
            compact
          />
        </div>

        <div className="flex-1" />

        {/* Protocol badges */}
        <div className="hidden lg:flex items-center gap-2 mr-3">
          <ProtocolBadge name="MCP" endpoint="/api/mcp" />
          <ProtocolBadge name="ACP" endpoint="/api/acp" />
        </div>

        <button
          onClick={() => setShowAgentInstallPopup(true)}
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#191c28] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Agents
        </button>

        <a
          href="/mcp-tools"
          className="hidden md:inline-flex px-2.5 py-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#191c28] transition-colors"
        >
          MCP
        </a>
        <a
          href="/traces"
          className="hidden md:inline-flex px-2.5 py-1.5 rounded-md text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#191c28] transition-colors"
        >
          Traces
        </a>
        <a
          href="/settings"
          className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#191c28] transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </a>
      </header>

      {/* ─── Dashboard Body ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-6">

          {/* Quick Input */}
          <div className="mb-8">
            <HomeInput
              workspaceId={workspaceId}
              onSessionCreated={() => {
                setRefreshKey((k) => k + 1);
              }}
            />
          </div>

          {/* ─── Stat Cards ──────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Sessions"
              value={sessions.length}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                </svg>
              }
              color="blue"
            />
            <StatCard
              label="Agents"
              value={agentsHook.agents.length}
              sub={activeAgents.length > 0 ? `${activeAgents.length} active` : undefined}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              }
              color="violet"
            />
            <StatCard
              label="Tasks"
              value={tasks.length}
              sub={pendingTasks.length > 0 ? `${pendingTasks.length} in progress` : undefined}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              color="emerald"
            />
            <StatCard
              label="BG Tasks"
              value={bgTasks.length}
              sub={runningBgTasks > 0 ? `${runningBgTasks} running` : undefined}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              color="amber"
            />
          </div>

          {/* ─── Tab Bar ─────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 mb-6 border-b border-gray-200/60 dark:border-[#191c28]">
            <TabButton active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>Overview</TabButton>
            <TabButton active={activeTab === "notes"} onClick={() => setActiveTab("notes")}>
              Notes
              {notesHook.notes.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-[#191c28] text-gray-500 dark:text-gray-400 font-mono">
                  {notesHook.notes.length}
                </span>
              )}
            </TabButton>
            <TabButton active={activeTab === "bg_tasks"} onClick={() => setActiveTab("bg_tasks")}>
              Background Tasks
              {bgTasks.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full bg-gray-100 dark:bg-[#191c28] text-gray-500 dark:text-gray-400 font-mono">
                  {bgTasks.length}
                </span>
              )}
            </TabButton>
          </div>

          {/* ─── Tab Content ─────────────────────────────────────────── */}
          {activeTab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2/3: Sessions + Tasks */}
              <div className="lg:col-span-2 space-y-6">
                {/* Recent Sessions */}
                <DashboardCard
                  title="Recent Sessions"
                  count={sessions.length}
                  emptyText="No sessions yet. Start one above."
                >
                  {sessions.slice(0, 8).map((s) => (
                    <button
                      key={s.sessionId}
                      onClick={() => router.push(`/workspace/${workspaceId}/sessions/${s.sessionId}`)}
                      className="group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#151720] transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                          {s.name || s.provider || `Session ${s.sessionId.slice(0, 8)}`}
                        </div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                          {s.role && <span className="capitalize">{s.role.toLowerCase()}</span>}
                          {s.role && s.provider && <span className="mx-1">·</span>}
                          {s.provider && <span>{s.provider}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono shrink-0">
                        {formatRelativeTime(s.createdAt)}
                      </span>
                      <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  ))}
                </DashboardCard>

                {/* Tasks */}
                <DashboardCard
                  title="Tasks"
                  count={tasks.length}
                  emptyText="No tasks created yet."
                >
                  {tasks.slice(0, 6).map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-[#151720] transition-colors"
                    >
                      <TaskStatusIcon status={t.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate">
                          {t.title}
                        </div>
                        {t.objective && (
                          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {t.objective}
                          </div>
                        )}
                      </div>
                      <TaskStatusBadge status={t.status} />
                    </div>
                  ))}
                </DashboardCard>
              </div>

              {/* Right 1/3: Context Sidebar */}
              <div className="space-y-6">
                {/* Codebases */}
                <DashboardCard
                  title="Codebases"
                  count={codebases.length}
                  emptyText="No codebases linked."
                >
                  {codebases.map((cb) => (
                    <div key={cb.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg">
                      <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-[#191c28] flex items-center justify-center shrink-0">
                        <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate">
                          {cb.label || cb.repoPath.split("/").pop()}
                        </div>
                        {cb.branch && (
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate flex items-center gap-1">
                            <svg className="w-2.5 h-2.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 000 6.364l1.757 1.757" />
                            </svg>
                            {cb.branch}
                          </div>
                        )}
                      </div>
                      {cb.isDefault && (
                        <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          Default
                        </span>
                      )}
                    </div>
                  ))}
                </DashboardCard>

                {/* Active Agents */}
                <DashboardCard
                  title="Agents"
                  count={agentsHook.agents.length}
                  emptyText="No agents spawned."
                  action={
                    <button
                      onClick={() => setShowAgentInstallPopup(true)}
                      className="text-[11px] text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                    >
                      + Install
                    </button>
                  }
                >
                  {agentsHook.agents.slice(0, 6).map((agent) => (
                    <div key={agent.id} className="flex items-center gap-3 px-3.5 py-2 rounded-lg">
                      <AgentRoleIcon role={agent.role} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-gray-700 dark:text-gray-300 truncate">{agent.name}</div>
                        <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">{agent.role}</div>
                      </div>
                      <AgentStatusDot status={agent.status} />
                    </div>
                  ))}
                </DashboardCard>

                {/* Skills */}
                <DashboardCard
                  title="Skills"
                  count={skillsHook.skills.length}
                  emptyText="No skills loaded."
                >
                  <div className="flex flex-wrap gap-1.5 px-3 py-2">
                    {skillsHook.skills.slice(0, 12).map((sk) => (
                      <span
                        key={sk.name}
                        className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 dark:bg-[#191c28] text-[11px] font-medium text-gray-600 dark:text-gray-400 border border-gray-200/50 dark:border-[#252838]"
                      >
                        /{sk.name}
                      </span>
                    ))}
                  </div>
                </DashboardCard>

                {/* Activity Feed */}
                {traces.length > 0 && (
                  <DashboardCard title="Recent Activity" count={traces.length}>
                    {traces.slice(0, 5).map((t) => (
                      <div key={t.id} className="flex items-start gap-2.5 px-3.5 py-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                            {t.summary || t.action || "Agent trace"}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">
                            {t.agentName && <span>{t.agentName}</span>}
                            {t.agentName && <span className="mx-1">·</span>}
                            {formatRelativeTime(t.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <a
                      href="/traces"
                      className="block px-3.5 py-2 text-[11px] text-amber-600 dark:text-amber-500 hover:text-amber-700 dark:hover:text-amber-400 transition-colors"
                    >
                      View all traces →
                    </a>
                  </DashboardCard>
                )}
              </div>
            </div>
          )}

          {activeTab === "bg_tasks" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-semibold text-gray-700 dark:text-gray-300">Background Task Queue</h2>
                <button
                  data-testid="dispatch-task-btn"
                  onClick={() => setShowDispatchModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Dispatch Task
                </button>
              </div>

              {bgTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-600">
                  <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[13px]">No background tasks yet.</p>
                  <p className="text-[11px] mt-1">Click &ldquo;Dispatch Task&rdquo; to enqueue one.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200/60 dark:border-[#191c28] bg-white dark:bg-[#0e1019] overflow-hidden divide-y divide-gray-100 dark:divide-[#191c28]">
                  {bgTasks.map((task) => (
                    <div key={task.id} data-testid="bg-task-item" className="flex items-start gap-3 px-4 py-3">
                      <BgTaskStatusIcon status={task.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate">{task.title}</div>
                          {/* Priority Badge */}
                          {task.priority && task.priority !== "NORMAL" && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              task.priority === "HIGH"
                                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                            }`}>
                              {task.priority}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{task.agentId}</span>
                          {task.triggerSource && <><span>·</span><span className="capitalize">{task.triggerSource}</span></>}
                          {/* Progress Info */}
                          {task.status === "RUNNING" && task.toolCallCount !== undefined && task.toolCallCount > 0 && (
                            <><span>·</span><span className="text-amber-600 dark:text-amber-400">{task.toolCallCount} tools</span></>
                          )}
                          {task.status === "RUNNING" && task.currentActivity && (
                            <><span>·</span><span className="text-amber-600 dark:text-amber-400 truncate max-w-[200px]">{task.currentActivity}</span></>
                          )}
                          {task.status === "RUNNING" && task.lastActivity && (
                            <><span>·</span><span className="text-amber-500 dark:text-amber-500">{formatRelativeTime(task.lastActivity)}</span></>
                          )}
                          {task.resultSessionId && (
                            <><span>·</span>
                            <button
                              onClick={() => router.push(`/workspace/${workspaceId}/sessions/${task.resultSessionId}`)}
                              className="text-blue-500 dark:text-blue-400 hover:underline"
                            >
                              view session
                            </button></>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span data-testid="bg-task-status" className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${bgTaskStatusClass(task.status)}`}>{task.status}</span>
                        {/* Retry Button for FAILED tasks */}
                        {task.status === "FAILED" && task.attempts < task.maxAttempts && (
                          <button
                            onClick={async () => {
                              try {
                                await fetch(`/api/background-tasks/${task.id}/retry`, { method: "POST" });
                                setRefreshKey((k) => k + 1); // Refresh task list
                              } catch (err) {
                                console.error("Retry failed:", err);
                              }
                            }}
                            className="text-[10px] font-medium px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                            title="Retry this task"
                          >
                            Retry
                          </button>
                        )}
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono">{formatRelativeTime(task.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Dispatch modal */}
              {showDispatchModal && (
                <OverlayModal onClose={() => setShowDispatchModal(false)} title="Dispatch Background Task">
                  <div className="space-y-4 p-4">
                    <div>
                      <label className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">Prompt</label>
                      <textarea
                        data-testid="dispatch-prompt-input"
                        rows={4}
                        placeholder="Enter the task prompt…"
                        value={dispatchPrompt}
                        onChange={(e) => setDispatchPrompt(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#252838] bg-gray-50 dark:bg-[#151720] text-[13px] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5">Agent / Provider</label>
                      <input
                        data-testid="dispatch-agent-input"
                        type="text"
                        placeholder="e.g. opencode, claude"
                        value={dispatchAgentId}
                        onChange={(e) => setDispatchAgentId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#252838] bg-gray-50 dark:bg-[#151720] text-[13px] text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setShowDispatchModal(false)}
                        className="px-3 py-1.5 rounded-md text-[12px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#191c28] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        data-testid="dispatch-submit-btn"
                        onClick={handleDispatchTask}
                        disabled={dispatchLoading || !dispatchPrompt.trim() || !dispatchAgentId.trim()}
                        className="px-3 py-1.5 rounded-md text-[12px] font-medium bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors"
                      >
                        {dispatchLoading ? "Dispatching…" : "Dispatch"}
                      </button>
                    </div>
                  </div>
                </OverlayModal>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <NotesTab
              notes={notesHook.notes}
              loading={notesHook.loading}
              onCreateNote={async (title, content, type) => {
                await notesHook.createNote({
                  title,
                  content,
                  type,
                });
              }}
              onDeleteNote={async (noteId) => {
                await notesHook.deleteNote(noteId);
              }}
            />
          )}
        </div>
      </div>

      {/* Agent Install Popup */}
      {showAgentInstallPopup && (
        <OverlayModal onClose={() => setShowAgentInstallPopup(false)} title="Install Agents">
          <AgentInstallPanel />
        </OverlayModal>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors ${
        active
          ? "text-gray-900 dark:text-gray-100 border-amber-500"
          : "text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: number;
  sub?: string;
  icon: React.ReactNode;
  color: "blue" | "violet" | "emerald" | "amber";
}) {
  const bgMap = {
    blue: "bg-blue-50 dark:bg-blue-900/15",
    violet: "bg-violet-50 dark:bg-violet-900/15",
    emerald: "bg-emerald-50 dark:bg-emerald-900/15",
    amber: "bg-amber-50 dark:bg-amber-900/15",
  };
  const textMap = {
    blue: "text-blue-600 dark:text-blue-400",
    violet: "text-violet-600 dark:text-violet-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-[#12141c] border border-gray-200/60 dark:border-[#1c1f2e] hover:shadow-sm transition-shadow">
      <div className={`w-9 h-9 rounded-lg ${bgMap[color]} flex items-center justify-center shrink-0 ${textMap[color]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">{value}</div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
          {label}
          {sub && <span className="ml-1 text-gray-300 dark:text-gray-600">· {sub}</span>}
        </div>
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  count,
  emptyText,
  action,
  children,
}: {
  title: string;
  count?: number;
  emptyText?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isEmpty = count === 0;

  return (
    <div className="bg-white dark:bg-[#12141c] rounded-xl border border-gray-200/60 dark:border-[#1c1f2e] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-[#191c28]">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          {count !== undefined && count > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-[#191c28] text-[10px] font-mono text-gray-500 dark:text-gray-400">
              {count}
            </span>
          )}
        </div>
        {action}
      </div>
      {isEmpty ? (
        <div className="px-4 py-6 text-center text-[12px] text-gray-400 dark:text-gray-500">{emptyText}</div>
      ) : (
        <div className="divide-y divide-gray-50 dark:divide-[#151720]">{children}</div>
      )}
    </div>
  );
}

function TaskStatusIcon({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === "COMPLETED") {
    return (
      <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>
    );
  }
  if (s === "IN_PROGRESS") {
    return (
      <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
        <div className="w-3 h-3 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }
  if (s === "BLOCKED" || s === "CANCELLED") {
    return (
      <div className="w-7 h-7 rounded-md bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
        <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-[#191c28] flex items-center justify-center shrink-0">
      <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-400 dark:border-gray-500" />
    </div>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const map: Record<string, string> = {
    PENDING: "bg-gray-100 dark:bg-gray-800 text-gray-500",
    IN_PROGRESS: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
    REVIEW_REQUIRED: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    COMPLETED: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
    NEEDS_FIX: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
    BLOCKED: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
    CANCELLED: "bg-gray-100 dark:bg-gray-800 text-gray-400",
  };

  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${map[s] || map.PENDING}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function AgentRoleIcon({ role }: { role: string }) {
  const r = role.toUpperCase();
  const colorMap: Record<string, string> = {
    ROUTA: "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    DEVELOPER: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    CRAFTER: "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400",
    GATE: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400",
  };
  const cls = colorMap[r] || colorMap.DEVELOPER;

  return (
    <div className={`w-7 h-7 rounded-md ${cls} flex items-center justify-center shrink-0`}>
      <span className="text-[10px] font-bold">{r.charAt(0)}</span>
    </div>
  );
}

function AgentStatusDot({ status }: { status: string }) {
  const s = status.toUpperCase();
  const colorMap: Record<string, string> = {
    ACTIVE: "bg-emerald-500",
    PENDING: "bg-amber-400",
    COMPLETED: "bg-gray-400 dark:bg-gray-500",
    ERROR: "bg-red-500",
    CANCELLED: "bg-gray-300 dark:bg-gray-600",
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${colorMap[s] || colorMap.PENDING}`} />
      <span className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">{status.toLowerCase()}</span>
    </div>
  );
}

// ─── Notes Tab ─────────────────────────────────────────────────────

function NotesTab({
  notes,
  loading,
  onCreateNote,
  onDeleteNote,
}: {
  notes: Array<{
    id: string;
    title: string;
    content: string;
    metadata: { type: "spec" | "task" | "general" };
    createdAt: string;
    updatedAt: string;
  }>;
  loading: boolean;
  onCreateNote: (title: string, content: string, type: "spec" | "task" | "general") => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newType, setNewType] = useState<"spec" | "task" | "general">("general");
  const [expandedNote, setExpandedNote] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!newTitle.trim()) return;
    await onCreateNote(newTitle.trim(), newContent.trim(), newType);
    setNewTitle("");
    setNewContent("");
    setShowForm(false);
  };

  const noteTypeIcon = (type: string) => {
    switch (type) {
      case "spec":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
            Spec
          </span>
        );
      case "task":
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            Task
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-gray-100 dark:bg-gray-800 text-gray-500">
            Note
          </span>
        );
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Workspace Notes</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium text-amber-600 dark:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Note
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="mb-6 p-4 bg-white dark:bg-[#12141c] rounded-xl border border-gray-200/60 dark:border-[#1c1f2e] animate-fade-in-up">
          <div className="flex items-center gap-3 mb-3">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Note title"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-[#252838] bg-gray-50 dark:bg-[#0e1019] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 dark:focus:border-amber-600 transition"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as "spec" | "task" | "general")}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-[#252838] bg-gray-50 dark:bg-[#0e1019] text-sm text-gray-800 dark:text-gray-200 outline-none"
            >
              <option value="general">General</option>
              <option value="spec">Spec</option>
              <option value="task">Task</option>
            </select>
          </div>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Write your note… (Markdown supported)"
            rows={4}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-[#252838] bg-gray-50 dark:bg-[#0e1019] text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400 dark:focus:border-amber-600 transition resize-none font-mono text-[13px]"
          />
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleSubmit}
              disabled={!newTitle.trim()}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              Create Note
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
          <p className="text-sm font-medium">No notes yet</p>
          <p className="text-[12px] mt-1">Create specs, task notes, or general notes for this workspace.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {[...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((note) => (
            <div
              key={note.id}
              className="bg-white dark:bg-[#12141c] rounded-xl border border-gray-200/60 dark:border-[#1c1f2e] overflow-hidden transition-shadow hover:shadow-sm"
            >
              <button
                onClick={() => setExpandedNote(expandedNote === note.id ? null : note.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${expandedNote === note.id ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate">{note.title}</span>
                </div>
                {noteTypeIcon(note.metadata?.type || "general")}
                <span className="text-[10px] text-gray-400 dark:text-gray-600 font-mono shrink-0">
                  {formatRelativeTime(note.updatedAt)}
                </span>
              </button>
              {expandedNote === note.id && (
                <div className="px-4 pb-4 border-t border-gray-100 dark:border-[#191c28]">
                  <pre className="mt-3 text-[12px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                    {note.content || "(empty)"}
                  </pre>
                  <div className="flex items-center gap-2 mt-3 pt-2 border-t border-gray-50 dark:border-[#151720]">
                    <button
                      onClick={() => onDeleteNote(note.id)}
                      className="text-[11px] text-red-500 hover:text-red-600 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Overlay Modal ─────────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-[#12141c] border border-gray-200 dark:border-[#1c1f2e] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-4 border-b border-gray-100 dark:border-[#191c28] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</span>
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
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-[#191c28] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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

// ─── BG Task Helpers ───────────────────────────────────────────────

function bgTaskStatusClass(status: string): string {
  switch (status) {
    case "PENDING":   return "bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400";
    case "RUNNING":   return "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";
    case "COMPLETED": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400";
    case "FAILED":    return "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400";
    case "CANCELLED": return "bg-gray-100 dark:bg-gray-700/40 text-gray-400 dark:text-gray-500";
    default:          return "bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400";
  }
}

function BgTaskStatusIcon({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    PENDING: "text-gray-400",
    RUNNING: "text-blue-500 animate-spin",
    COMPLETED: "text-emerald-500",
    FAILED: "text-red-500",
    CANCELLED: "text-gray-400",
  };
  const cls = colorMap[status] ?? "text-gray-400";
  if (status === "COMPLETED") {
    return (
      <svg className={`w-4 h-4 ${cls} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  if (status === "FAILED" || status === "CANCELLED") {
    return (
      <svg className={`w-4 h-4 ${cls} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className={`w-4 h-4 ${cls} shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}
