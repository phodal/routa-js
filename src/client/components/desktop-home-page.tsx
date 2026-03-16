"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { HomeInput } from "@/client/components/home-input";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { useAcp } from "@/client/hooks/use-acp";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { desktopAwareFetch } from "@/client/utils/diagnostics";

interface DesktopSessionInfo {
  sessionId: string;
  name?: string;
  provider?: string;
  role?: string;
  acpStatus?: "connecting" | "ready" | "error";
  createdAt: string;
}

interface DesktopTaskInfo {
  id: string;
  status?: string;
}

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

function isActiveTask(status?: string): boolean {
  if (!status) return true;
  const normalized = status.toUpperCase();
  return !["DONE", "COMPLETED", "CANCELLED", "ARCHIVED"].includes(normalized);
}

function getSessionDisplayName(session: DesktopSessionInfo): string {
  return session.name ?? session.role ?? session.provider ?? `Session ${session.sessionId.slice(0, 8)}`;
}

export function DesktopHomePage() {
  const router = useRouter();
  const acp = useAcp();
  const workspacesHook = useWorkspaces();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DesktopTaskInfo[]>([]);
  const [sessions, setSessions] = useState<DesktopSessionInfo[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acp.connected, acp.loading]);

  useEffect(() => {
    if (!activeWorkspaceId && workspacesHook.workspaces.length > 0) {
      setActiveWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [activeWorkspaceId, workspacesHook.workspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setTasks([]);
      setSessions([]);
      return;
    }

    const controller = new AbortController();

    const loadSummary = async () => {
      setLoadingSummary(true);
      try {
        const [tasksRes, sessionsRes] = await Promise.all([
          desktopAwareFetch(`/api/tasks?workspaceId=${encodeURIComponent(activeWorkspaceId)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          desktopAwareFetch(`/api/sessions?workspaceId=${encodeURIComponent(activeWorkspaceId)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const [tasksPayload, sessionsPayload] = await Promise.all([
          tasksRes.json(),
          sessionsRes.json(),
        ]);

        if (controller.signal.aborted) return;

        setTasks(Array.isArray(tasksPayload?.tasks) ? tasksPayload.tasks : []);
        setSessions(Array.isArray(sessionsPayload?.sessions) ? sessionsPayload.sessions : []);
      } catch {
        if (controller.signal.aborted) return;
        setTasks([]);
        setSessions([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSummary(false);
        }
      }
    };

    void loadSummary();
    return () => controller.abort();
  }, [activeWorkspaceId]);

  const handleWorkspaceSelect = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
  }, []);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const workspace = await workspacesHook.createWorkspace(title);
    if (workspace) {
      setActiveWorkspaceId(workspace.id);
      router.push(`/workspace/${workspace.id}`);
    }
  }, [router, workspacesHook]);

  const activeWorkspace = useMemo(
    () => workspacesHook.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, workspacesHook.workspaces],
  );

  const activeTaskCount = useMemo(
    () => tasks.filter((task) => isActiveTask(task.status)).length,
    [tasks],
  );

  const runningSessionCount = useMemo(
    () => sessions.filter((session) => session.acpStatus === "connecting" || session.acpStatus === "ready").length,
    [sessions],
  );

  const recentSessions = useMemo(
    () => [...sessions]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 3),
    [sessions],
  );

  const currentWorkspaceId = activeWorkspaceId ?? activeWorkspace?.id ?? "default";
  const shortcutCards = [
    { label: "Enter", hint: "Send prompt" },
    { label: "/", hint: "Insert skill" },
    { label: "@", hint: "Mention file" },
  ];

  return (
    <DesktopAppShell
      workspaceId={currentWorkspaceId}
      workspaceTitle={activeWorkspace?.title}
      sessionCount={sessions.length}
      taskCount={activeTaskCount}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
          desktop
        />
      )}
      titleBarRight={(
        <div className="flex items-center gap-2 text-[11px] text-[var(--dt-text-secondary)]">
          <span className="inline-flex items-center gap-1 rounded border border-[var(--dt-border)] px-2 py-1">
            <span className={`h-1.5 w-1.5 rounded-full ${acp.connected ? "bg-emerald-400" : acp.loading ? "bg-amber-400" : "bg-[var(--dt-text-secondary)]"}`} />
            {acp.connected ? "Connected" : acp.loading ? "Connecting" : "Offline"}
          </span>
          <Link href="/settings?from=%2F" className="rounded px-2 py-1 text-[var(--dt-text-primary)] transition-colors hover:bg-[var(--dt-bg-active)]">
            Settings
          </Link>
        </div>
      )}
    >
      <div className="h-full overflow-y-auto bg-[var(--dt-bg-primary)] text-[var(--dt-text-primary)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-6">
          <section className="rounded-xl border border-[var(--dt-border-light)] bg-[var(--dt-bg-secondary)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.12)]">
            <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--dt-border)] bg-[var(--dt-bg-tertiary)] px-2.5 py-1 text-[11px] text-[var(--dt-text-secondary)]">
                  Desktop home
                  {activeWorkspace && <span className="text-[var(--dt-text-primary)]">· {activeWorkspace.title}</span>}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-[var(--dt-text-primary)]">Start with a task, not a dashboard.</h1>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--dt-text-secondary)]">
                    Keep the desktop entry focused: write the requirement, pick the workspace, then jump into Kanban or sessions when you need detail.
                  </p>
                </div>
              </div>

              <div className="grid min-w-full gap-3 sm:grid-cols-3 lg:min-w-[360px] lg:max-w-[420px]">
                <div className="rounded-lg border border-[var(--dt-border-light)] bg-[var(--dt-bg-tertiary)] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--dt-text-secondary)]">Workspace</div>
                  <div className="mt-2 truncate text-sm font-medium text-[var(--dt-text-primary)]">
                    {workspacesHook.loading ? "Loading…" : (activeWorkspace?.title ?? "No workspace")}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--dt-border-light)] bg-[var(--dt-bg-tertiary)] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--dt-text-secondary)]">Active tasks</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--dt-text-primary)]">{loadingSummary ? "…" : activeTaskCount}</div>
                </div>
                <div className="rounded-lg border border-[var(--dt-border-light)] bg-[var(--dt-bg-tertiary)] px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--dt-text-secondary)]">Running sessions</div>
                  <div className="mt-2 text-2xl font-semibold text-[var(--dt-text-primary)]">{loadingSummary ? "…" : runningSessionCount}</div>
                </div>
              </div>
            </div>

            <HomeInput
              workspaceId={activeWorkspaceId ?? undefined}
              onWorkspaceChange={setActiveWorkspaceId}
              onSessionCreated={(sessionId) => {
                if (activeWorkspaceId) {
                  router.push(`/workspace/${activeWorkspaceId}/sessions/${sessionId}`);
                }
              }}
              compact
            />

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/workspace/${currentWorkspaceId}`}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--dt-border)] bg-[var(--dt-bg-tertiary)] px-3 py-2 text-xs text-[var(--dt-text-primary)] transition-colors hover:bg-[var(--dt-bg-active)]"
              >
                Open workspace
              </Link>
              <Link
                href={`/workspace/${currentWorkspaceId}/kanban`}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--dt-accent)] bg-[var(--dt-accent)] px-3 py-2 text-xs font-medium text-[var(--dt-accent-contrast)] transition-colors hover:bg-[var(--dt-accent-hover)]"
              >
                Open Kanban
              </Link>
              <Link
                href={`/workspace/${currentWorkspaceId}/sessions`}
                className="inline-flex items-center gap-2 rounded-md border border-[var(--dt-border)] bg-[var(--dt-bg-tertiary)] px-3 py-2 text-xs text-[var(--dt-text-primary)] transition-colors hover:bg-[var(--dt-bg-active)]"
              >
                Recent sessions
              </Link>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <section className="rounded-xl border border-[var(--dt-border-light)] bg-[var(--dt-bg-secondary)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--dt-text-primary)]">Recent sessions</h2>
                  <p className="mt-1 text-xs text-[var(--dt-text-secondary)]">Pick up the last three conversations from this workspace.</p>
                </div>
                <Link href={`/workspace/${currentWorkspaceId}/sessions`} className="text-xs text-[var(--dt-accent)] transition-colors hover:text-[var(--dt-accent-hover)]">
                  View all
                </Link>
              </div>

              {recentSessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--dt-border)] bg-[var(--dt-bg-tertiary)] px-4 py-8 text-center text-sm text-[var(--dt-text-secondary)]">
                  No recent sessions yet. Start one above.
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSessions.map((session) => (
                    <Link
                      key={session.sessionId}
                      href={`/workspace/${currentWorkspaceId}/sessions/${session.sessionId}`}
                      className="flex items-center gap-3 rounded-lg border border-[var(--dt-border-light)] bg-[var(--dt-bg-tertiary)] px-4 py-3 transition-colors hover:bg-[var(--dt-bg-active)]"
                    >
                      <div className={`h-2.5 w-2.5 rounded-full ${session.acpStatus === "error" ? "bg-red-400" : session.acpStatus === "ready" ? "bg-emerald-400" : "bg-amber-400"}`} />
                      <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[var(--dt-text-primary)]">{getSessionDisplayName(session)}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--dt-text-secondary)]">
                          <span>{session.provider ?? "provider pending"}</span>
                          {session.role && <span>· {session.role}</span>}
                          <span>· {formatRelativeTime(session.createdAt)}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <aside className="rounded-xl border border-[var(--dt-border-light)] bg-[var(--dt-bg-secondary)] p-5">
              <h2 className="text-sm font-semibold text-[var(--dt-text-primary)]">Keyboard hints</h2>
              <p className="mt-1 text-xs text-[var(--dt-text-secondary)]">Useful shortcuts and lightweight entry points for the desktop app.</p>

              <div className="mt-4 space-y-3">
                {shortcutCards.map((shortcut) => (
                  <div key={shortcut.label} className="flex items-center justify-between rounded-lg border border-[var(--dt-border-light)] bg-[var(--dt-bg-tertiary)] px-3 py-2.5">
                    <span className="text-xs text-[var(--dt-text-primary)]">{shortcut.hint}</span>
                    <kbd className="rounded border border-[var(--dt-border)] bg-[var(--dt-bg-secondary)] px-2 py-1 font-mono text-[11px] text-[var(--dt-text-primary)]">{shortcut.label}</kbd>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-dashed border-[var(--dt-border)] bg-[var(--dt-bg-tertiary)] px-3 py-3 text-xs text-[var(--dt-text-secondary)]">
                Detailed board metrics and lane status stay in the Kanban page, so the home screen remains a task-first launcher.
              </div>
            </aside>
          </div>
        </div>
      </div>
    </DesktopAppShell>
  );
}
