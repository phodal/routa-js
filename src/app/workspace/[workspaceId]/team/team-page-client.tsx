"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { DesktopAppShell } from "@/client/components/desktop-app-shell";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { HomeInput } from "@/client/components/home-input";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { desktopAwareFetch } from "@/client/utils/diagnostics";
import { filterSpecialistsByCategory } from "@/client/utils/specialist-categories";
import { formatRelativeTime } from "../ui-components";
import type { SessionInfo } from "../types";

const TEAM_LEAD_SPECIALIST_ID = "team-agent-lead";

interface SpecialistSummary {
  id: string;
  name: string;
  description?: string;
  role?: string;
}

interface TeamRunSummary {
  session: SessionInfo;
  descendants: number;
  directDelegates: number;
}

const TEAM_MEMBER_DISPLAY_ORDER = [
  TEAM_LEAD_SPECIALIST_ID,
  "team-researcher",
  "team-frontend-dev",
  "team-backend-dev",
  "team-qa",
  "team-code-reviewer",
  "team-ux-designer",
  "team-operations",
  "team-general-engineer",
] as const;

function compareTeamSpecialists(a: SpecialistSummary, b: SpecialistSummary): number {
  const aIndex = TEAM_MEMBER_DISPLAY_ORDER.indexOf(a.id as typeof TEAM_MEMBER_DISPLAY_ORDER[number]);
  const bIndex = TEAM_MEMBER_DISPLAY_ORDER.indexOf(b.id as typeof TEAM_MEMBER_DISPLAY_ORDER[number]);
  const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
  const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
  if (normalizedA !== normalizedB) return normalizedA - normalizedB;
  return a.name.localeCompare(b.name);
}

function buildTeamRunName(requirement: string): string {
  const normalized = requirement.replace(/\s+/g, " ").trim();
  if (!normalized) return "Team run";
  return normalized.length > 56 ? `Team - ${normalized.slice(0, 53)}...` : `Team - ${normalized}`;
}

function isTeamLeadRun(session: SessionInfo): boolean {
  if (session.parentSessionId) return false;
  if (session.specialistId === TEAM_LEAD_SPECIALIST_ID) return true;
  if (session.role?.toUpperCase() !== "ROUTA") return false;

  const normalizedName = (session.name ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedName) return false;

  return (
    normalizedName.startsWith("team -")
    || normalizedName.startsWith("team run")
    || normalizedName.includes("team lead")
  );
}

function getRoleTone(role?: string): string {
  switch (role?.toUpperCase()) {
    case "ROUTA":
      return "border-amber-200/80 bg-amber-50/80 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300";
    case "CRAFTER":
      return "border-cyan-200/80 bg-cyan-50/80 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300";
    case "GATE":
      return "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300";
    case "DEVELOPER":
      return "border-violet-200/80 bg-violet-50/80 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300";
    default:
      return "border-slate-200/80 bg-slate-50/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300";
  }
}

export function TeamPageClient() {
  const params = useParams();
  const router = useRouter();
  const rawWorkspaceId = params.workspaceId as string;
  const workspaceId =
    rawWorkspaceId === "__placeholder__" && typeof window !== "undefined"
      ? (window.location.pathname.match(/^\/workspace\/([^/]+)/)?.[1] ?? rawWorkspaceId)
      : rawWorkspaceId;

  const workspacesHook = useWorkspaces();

  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [specialists, setSpecialists] = useState<SpecialistSummary[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await desktopAwareFetch(`/api/sessions?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      } catch {
        if (controller.signal.aborted) return;
        setSessions([]);
      }
    })();
    return () => controller.abort();
  }, [workspaceId, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await desktopAwareFetch("/api/specialists", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await res.json();
        if (controller.signal.aborted) return;
        setSpecialists(Array.isArray(data?.specialists) ? data.specialists : []);
      } catch {
        if (controller.signal.aborted) return;
        setSpecialists([]);
      }
    })();
    return () => controller.abort();
  }, []);

  const teamSpecialists = useMemo(
    () => filterSpecialistsByCategory(specialists, "team").sort(compareTeamSpecialists),
    [specialists],
  );

  const teamRuns = useMemo<TeamRunSummary[]>(() => {
    const childMap = new Map<string, SessionInfo[]>();
    for (const session of sessions) {
      if (!session.parentSessionId) continue;
      const existing = childMap.get(session.parentSessionId) ?? [];
      existing.push(session);
      childMap.set(session.parentSessionId, existing);
    }

    const countDescendants = (sessionId: string): number => {
      const children = childMap.get(sessionId) ?? [];
      return children.reduce((total, child) => total + 1 + countDescendants(child.sessionId), 0);
    };

    return sessions
      .filter((session) => isTeamLeadRun(session))
      .map((session) => ({
        session,
        descendants: countDescendants(session.sessionId),
        directDelegates: (childMap.get(session.sessionId) ?? []).length,
      }));
  }, [sessions]);

  const workspace = workspacesHook.workspaces.find((item) => item.id === workspaceId);
  const activeRuns = teamRuns.filter((run) => run.session.acpStatus === "connecting" || run.session.acpStatus === "ready").length;
  const availableMembers = Math.max(teamSpecialists.length - 1, 0);

  const handleWorkspaceSelect = useCallback((nextWorkspaceId: string) => {
    router.push(`/workspace/${nextWorkspaceId}/team`);
  }, [router]);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const workspaceResult = await workspacesHook.createWorkspace(title);
    if (workspaceResult) {
      router.push(`/workspace/${workspaceResult.id}/team`);
    }
  }, [router, workspacesHook]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const handleTeamSessionCreated = useCallback((sessionId: string, promptText: string) => {
    const optimisticName = buildTeamRunName(promptText);
    setSessions((current) => {
      if (current.some((session) => session.sessionId === sessionId)) {
        return current.map((session) => (
          session.sessionId === sessionId
            ? {
              ...session,
              name: optimisticName,
              role: session.role ?? "ROUTA",
              specialistId: session.specialistId ?? TEAM_LEAD_SPECIALIST_ID,
            }
            : session
        ));
      }

      return [{
        sessionId,
        name: optimisticName,
        cwd: "",
        workspaceId,
        role: "ROUTA",
        specialistId: TEAM_LEAD_SPECIALIST_ID,
        createdAt: new Date().toISOString(),
      }, ...current];
    });

    void desktopAwareFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: optimisticName }),
    }).catch(() => {});
    setRefreshKey((current) => current + 1);
  }, [workspaceId]);

  if (workspacesHook.loading && workspaceId !== "default") {
    return (
      <div className="desktop-theme flex h-screen items-center justify-center bg-desktop-bg-primary">
        <div className="flex items-center gap-3 text-desktop-text-secondary">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading workspace...
        </div>
      </div>
    );
  }

  return (
    <DesktopAppShell
      workspaceId={workspaceId}
      workspaceTitle={workspace?.title ?? (workspaceId === "default" ? "Default Workspace" : workspaceId)}
      workspaceSwitcher={(
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={workspaceId}
          activeWorkspaceTitle={workspace?.title ?? (workspaceId === "default" ? "Default Workspace" : workspaceId)}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
          compact
        />
      )}
    >
      <div className="flex h-full flex-col overflow-hidden bg-desktop-bg-primary">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-4 py-4">
            <section className="rounded-[24px] border border-desktop-border bg-desktop-bg-secondary p-5">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-desktop-text-muted">
                    Team Runs
                  </div>
                  <h1 className="mt-2 text-[28px] font-semibold tracking-tight text-desktop-text-primary">
                    Run a lead session and keep the list in the same surface.
                  </h1>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {teamRuns.length} runs
                  </span>
                  <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-semibold text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                    {activeRuns} active
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {availableMembers} members
                  </span>
                </div>
              </div>

              <div className="mt-4 rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-4 dark:border-slate-800 dark:bg-slate-950/30">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-desktop-text-muted">
                    New Run
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-desktop-text-primary">Launch the Team lead with the shared input.</h2>
                  <p className="mt-1.5 text-sm leading-6 text-desktop-text-secondary">
                    This now reuses the same input, provider, model, and pending-prompt flow as Home.
                  </p>
                </div>

                <div className="mt-4">
                  <HomeInput
                    workspaceId={workspaceId}
                    variant="hero"
                    lockedSpecialistId={TEAM_LEAD_SPECIALIST_ID}
                    buildSessionUrl={(nextWorkspaceId, sessionId) =>
                      `/workspace/${nextWorkspaceId ?? workspaceId}/team/${sessionId}`
                    }
                    onSessionCreated={handleTeamSessionCreated}
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {teamSpecialists.map((specialist) => (
                    <span
                      key={specialist.id}
                      className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.14em] ${getRoleTone(specialist.role)}`}
                      title={specialist.description ?? specialist.id}
                    >
                      {specialist.name}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-[24px] border border-desktop-border bg-desktop-bg-secondary p-5">
              <div className="flex flex-wrap items-start justify-between gap-2.5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-desktop-text-muted">
                    Team Runs
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-desktop-text-primary">Top-level lead sessions only.</h2>
                  <p className="mt-1.5 text-sm leading-6 text-desktop-text-secondary">
                    Open any run to inspect the task tree, coordination feed, and team panel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-lg border border-desktop-border px-3.5 py-2 text-sm font-medium text-desktop-text-secondary transition-colors hover:bg-desktop-bg-active hover:text-desktop-text-primary"
                >
                  Refresh
                </button>
              </div>

              {teamRuns.length === 0 ? (
                <div className="mt-4 rounded-[20px] border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    No Team runs yet.
                  </div>
                  <div className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Launch a lead session above.
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {teamRuns.map((run) => (
                    <button
                      key={run.session.sessionId}
                      type="button"
                      onClick={() => router.push(`/workspace/${workspaceId}/team/${run.session.sessionId}`)}
                      className="group rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98))] p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_18px_45px_-30px_rgba(14,116,144,0.38)] dark:border-slate-800 dark:bg-slate-950/30 dark:hover:border-cyan-800"
                    >
                      <div className="flex items-start justify-between gap-2.5">
                        <div>
                          <div className="text-lg font-semibold tracking-tight text-slate-900 transition-colors group-hover:text-cyan-700 dark:text-slate-100 dark:group-hover:text-cyan-300">
                            {run.session.name ?? "Unnamed Team run"}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
                            {formatRelativeTime(run.session.createdAt)}
                          </div>
                        </div>
                        <StatusPill status={run.session.acpStatus} />
                      </div>

                      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
                        <RunMetric label="Direct delegates" value={run.directDelegates} />
                        <RunMetric label="Total sub-sessions" value={run.descendants} />
                        <RunMetric label="Provider" value={run.session.provider ?? "auto"} />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                          {run.session.specialistId ?? TEAM_LEAD_SPECIALIST_ID}
                        </span>
                        {run.session.branch && (
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70">
                            {run.session.branch}
                          </span>
                        )}
                        <span className="truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70" title={run.session.cwd}>
                          {run.session.cwd}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </DesktopAppShell>
  );
}

function StatusPill({ status }: { status?: SessionInfo["acpStatus"] }) {
  if (status === "error") {
    return <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">error</span>;
  }
  if (status === "connecting") {
    return <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">connecting</span>;
  }
  return <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">ready</span>;
}

function RunMetric({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
    </div>
  );
}
