"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { HomeInput } from "@/client/components/home-input";
import { ConnectionDot, OnboardingCard } from "@/client/components/home-page-sections";
import { useAcp } from "@/client/hooks/use-acp";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { NotificationBell, NotificationProvider } from "@/client/components/notification-center";
import { SettingsPanel } from "@/client/components/settings-panel";

interface KanbanColumnInfo {
  id: string;
  name: string;
}

interface KanbanBoardQueue {
  runningCount: number;
  queuedCount: number;
}

interface KanbanBoardSummary {
  id: string;
  name: string;
  isDefault: boolean;
  columns: KanbanColumnInfo[];
  queue?: KanbanBoardQueue;
}

interface HomeTaskInfo {
  id: string;
  title: string;
  columnId?: string;
  status?: string;
  createdAt: string;
  priority?: string;
}

export function WebHomePage() {
  const workspacesHook = useWorkspaces();
  const acp = useAcp();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"agents" | undefined>(undefined);

  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false);
  const workspacesMenuRef = useRef<HTMLDivElement>(null);

  const [activeBoard, setActiveBoard] = useState<KanbanBoardSummary | null>(null);
  const [boardTasks, setBoardTasks] = useState<HomeTaskInfo[]>([]);
  const [isBoardLoading, setIsBoardLoading] = useState(false);

  useEffect(() => {
    if (!activeWorkspaceId && workspacesHook.workspaces.length > 0) {
      setActiveWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [activeWorkspaceId, workspacesHook.workspaces]);

  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acp.connected, acp.loading]);

  useEffect(() => {
    if (!showWorkspacesMenu) return;
    const handler = (event: MouseEvent) => {
      if (workspacesMenuRef.current && !workspacesMenuRef.current.contains(event.target as Node)) {
        setShowWorkspacesMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showWorkspacesMenu]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      setActiveBoard(null);
      setBoardTasks([]);
      return;
    }

    const controller = new AbortController();

    const loadKanbanSnapshot = async () => {
      setIsBoardLoading(true);
      try {
        const [boardsRes, tasksRes] = await Promise.all([
          fetch(`/api/kanban/boards?workspaceId=${encodeURIComponent(activeWorkspaceId)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/tasks?workspaceId=${encodeURIComponent(activeWorkspaceId)}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);

        const boardsPayload = await boardsRes.json();
        const tasksPayload = await tasksRes.json();

        if (controller.signal.aborted) return;

        const boards = Array.isArray(boardsPayload?.boards) ? boardsPayload.boards : [];
        const defaultBoard = boards.find((board: { isDefault?: boolean }) => board.isDefault === true)
          ?? boards[0]
          ?? null;
        if (defaultBoard) {
          setActiveBoard({
            id: String(defaultBoard.id),
            name: String(defaultBoard.name || "Kanban Board"),
            isDefault: Boolean(defaultBoard.isDefault),
            columns: Array.isArray(defaultBoard.columns)
              ? defaultBoard.columns.map((column: { id: string; name: string }) => ({
                  id: String(column.id),
                  name: String(column.name),
                }))
              : [],
            queue: defaultBoard.queue && typeof defaultBoard.queue === "object"
              ? {
                  runningCount: Number(defaultBoard.queue.runningCount ?? 0),
                  queuedCount: Number(defaultBoard.queue.queuedCount ?? 0),
                }
              : undefined,
          });
        } else {
          setActiveBoard(null);
        }

        setBoardTasks(
          Array.isArray(tasksPayload?.tasks)
            ? tasksPayload.tasks
              .filter((task: { id?: string; title?: string; createdAt?: string }) => task?.id && task?.title)
              .map((task: { id: string; title: string; columnId?: string; status?: string; createdAt: string; priority?: string }) => ({
                id: String(task.id),
                title: String(task.title),
                columnId: task.columnId ? String(task.columnId) : undefined,
                status: task.status ? String(task.status) : undefined,
                createdAt: String(task.createdAt ?? new Date(0).toISOString()),
                priority: task.priority ? String(task.priority) : undefined,
              }))
            : [],
        );
      } catch {
        setActiveBoard(null);
        setBoardTasks([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsBoardLoading(false);
        }
      }
    };

    void loadKanbanSnapshot();

    return () => controller.abort();
  }, [activeWorkspaceId, refreshKey]);

  const handleWorkspaceSelect = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
    setRefreshKey((value) => value + 1);
    setShowWorkspacesMenu(false);
  }, []);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const workspace = await workspacesHook.createWorkspace(title);
    if (workspace) {
      handleWorkspaceSelect(workspace.id);
      setShowWorkspacesMenu(false);
    }
  }, [handleWorkspaceSelect, workspacesHook]);

  const activeWorkspace = workspacesHook.workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const workspaceCount = workspacesHook.workspaces.length;

  const activeKanbanHref = activeWorkspaceId ? `/workspace/${activeWorkspaceId}/kanban` : "/";
  const activeWorkspaceHref = activeWorkspaceId ? `/workspace/${activeWorkspaceId}` : "/";

  const boardColumnCounts = useMemo(() => {
    const columns = activeBoard?.columns ?? [];
    const counts = Object.fromEntries(columns.map((column) => [column.id, 0])) as Record<string, number>;

    for (const task of boardTasks) {
      const columnId = task.columnId ?? "backlog";
      counts[columnId] = (counts[columnId] ?? 0) + 1;
    }

    return counts;
  }, [activeBoard, boardTasks]);

  const laneCards = useMemo(() => {
    if (!activeBoard) return [];

    return activeBoard.columns.map((column) => {
      const items = boardTasks
        .filter((task) => (task.columnId ?? "backlog") === column.id)
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, 3);
      return { column, items, count: boardColumnCounts[column.id] ?? 0 };
    });
  }, [activeBoard, boardTasks, boardColumnCounts]);

  const totalActiveTasks = boardTasks.filter((task) => (task.columnId ?? "backlog").toLowerCase() !== "done").length;
  const totalDoneTasks = boardTasks.filter((task) => (task.columnId ?? "backlog").toLowerCase() === "done").length;
  const runningCount = activeBoard?.queue?.runningCount ?? 0;
  const queuedCount = activeBoard?.queue?.queuedCount ?? 0;

  return (
    <NotificationProvider>
      <div className="relative flex h-screen min-h-screen flex-col overflow-hidden bg-[#f2f7ff] text-[#081120] dark:bg-[#040913] dark:text-gray-100">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,252,255,0.98),rgba(233,240,249,0.9))] dark:bg-[linear-gradient(180deg,rgba(5,10,18,0.98),rgba(4,9,19,0.97))]" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(14,90,160,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(14,90,160,0.05)_1px,transparent_1px)] bg-[size:120px_120px] opacity-35 dark:opacity-18" />
          <div className="home-float-slow absolute left-[-14rem] top-12 h-[24rem] w-[24rem] rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.19),_transparent_68%)] blur-3xl" />
          <div className="home-float-delay absolute right-[-10rem] top-[-6rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,_rgba(37,99,235,0.17),_transparent_72%)] blur-3xl" />
        </div>

        <header className="relative z-10 flex h-14 shrink-0 items-center border-b border-sky-200/55 bg-white/55 px-3 backdrop-blur-xl sm:px-5 dark:border-white/6 dark:bg-[#040913]/76">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="rounded-xl border border-sky-200/70 bg-white/80 p-1.5 shadow-[0_10px_30px_-18px_rgba(37,99,235,0.45)] dark:border-white/10 dark:bg-white/5">
              <Image src="/logo.svg" alt="Routa" width={22} height={22} className="rounded-md" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-[0.02em] text-[#081120] dark:text-gray-100">
                Routa
              </div>
              <div className="hidden text-[10px] uppercase tracking-[0.28em] text-[#4c7ec3] sm:block dark:text-sky-400/70">
                Kanban-First Control Surface
              </div>
            </div>
          </div>

          <div className="flex-1" />

          <nav className="flex items-center gap-2">
            {activeWorkspaceId && (
              <Link
                href={activeKanbanHref}
                className="rounded-full px-3 py-1.5 text-[11px] font-medium text-[#46638b] transition-colors hover:bg-sky-100/70 hover:text-[#081120] dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100"
              >
                Kanban
              </Link>
            )}

            <NotificationBell />

            <button
              onClick={() => {
                setSettingsInitialTab(undefined);
                setShowSettingsPanel(true);
              }}
              className="rounded-full p-2 text-gray-400 transition-colors hover:bg-black/5 hover:text-gray-700 dark:text-gray-500 dark:hover:bg-white/5 dark:hover:text-gray-300"
              title="Settings"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <div className="ml-1 border-l border-black/8 pl-3 dark:border-white/8">
              <ConnectionDot connected={acp.connected} />
            </div>
          </nav>
        </header>

        <main className="relative z-10 flex-1 overflow-y-auto">
          {workspacesHook.loading ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-slate-500">
              Loading workspaces...
            </div>
          ) : workspacesHook.workspaces.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <OnboardingCard onCreateWorkspace={handleWorkspaceCreate} />
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[112rem] px-3 py-4 sm:px-6 sm:py-7">
              <div className="w-full space-y-4">
                <section className="overflow-hidden rounded-[34px] border border-sky-200/75 bg-[linear-gradient(180deg,rgba(250,253,255,0.98),rgba(238,246,255,0.96))] shadow-[0_60px_170px_-120px_rgba(37,99,235,0.45)] dark:border-[#223049] dark:bg-[linear-gradient(180deg,rgba(7,12,21,0.96),rgba(9,15,26,0.98))]">
                  <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.17fr)_355px] lg:p-7">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#4a74a8] dark:text-slate-400">
                        Kanban Core
                      </p>
                      <h1 className="mt-2 max-w-3xl font-['Avenir_Next_Condensed','Avenir_Next','Segoe_UI','Helvetica_Neue',sans-serif] text-[2.25rem] leading-[0.95] font-semibold tracking-[-0.04em] text-[#081120] dark:text-white sm:text-[2.9rem] lg:text-[3.2rem]">
                        Start with a requirement, move in lanes.
                      </h1>
                      <p className="mt-3 max-w-2xl text-sm leading-7 text-[#4d6689] dark:text-slate-300">
                        The homepage now puts your active Kanban board first. Create tasks from one composer, then immediately check where they sit: Backlog, Dev, Review, or Blocked.
                      </p>

                      <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                        <BoardStat label="Board" value={String(workspaceCount).padStart(2, "0")} detail="Connected workspaces" />
                        <BoardStat label="Active" value={String(totalActiveTasks)} detail="In flow lanes" />
                        <BoardStat label="Done" value={String(totalDoneTasks)} detail="Completed tasks" />
                        <BoardStat label="Runtime" value={acp.connected ? "Connected" : "Offline"} detail={acp.connected ? "ACP ready" : "Waiting for runtime"} />
                        <BoardStat label="Running" value={String(runningCount)} detail="Sessions" />
                        <BoardStat label="Queued" value={String(queuedCount)} detail="Awaiting concurrency" />
                      </div>

                      <div className="mt-5 rounded-[28px] border border-sky-200/75 bg-white/78 p-3 shadow-[0_30px_100px_-58px_rgba(37,99,235,0.24)] backdrop-blur dark:border-white/10 dark:bg-[#0a1322]/66 sm:p-4">
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#356fb0] dark:text-slate-400">
                          Composer (open board first)
                        </div>
                        <HomeInput
                          variant="hero"
                          workspaceId={activeWorkspaceId ?? undefined}
                          onWorkspaceChange={(workspaceId) => {
                            setActiveWorkspaceId(workspaceId);
                            setRefreshKey((value) => value + 1);
                          }}
                          onSessionCreated={() => {
                            setRefreshKey((value) => value + 1);
                          }}
                        />
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={activeWorkspaceHref}
                          className="inline-flex items-center justify-center rounded-full border border-sky-200/70 bg-white/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2b6fc8] transition-colors hover:bg-white dark:border-white/10 dark:bg-[#1b2232] dark:text-slate-300 dark:hover:bg-[#101826]"
                        >
                          Open workspace
                        </Link>
                        <Link
                          href={activeKanbanHref}
                          className="inline-flex items-center justify-center rounded-full bg-[#0f62d6] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#2a77e4] dark:bg-[#5ee5ff] dark:text-[#04111d] dark:hover:bg-[#87edff]"
                        >
                          Open board
                        </Link>
                        <button
                          type="button"
                          onClick={() => setShowWorkspacesMenu((value) => !value)}
                          className="inline-flex items-center justify-center rounded-full border border-sky-200/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#45678f] transition-colors hover:border-sky-300 hover:text-[#081120] dark:border-[#2a3042] dark:text-slate-400 dark:hover:border-[#39415a] dark:hover:text-slate-200"
                        >
                          {activeWorkspace?.title ?? "Switch workspace"}
                        </button>
                      </div>
                    </div>

                    <aside className="overflow-hidden rounded-[24px] border border-[#1f3354] bg-[linear-gradient(180deg,#07111f,#0b1630)] p-4 text-white sm:p-5">
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.13),_transparent_30%),radial-gradient(circle_at_85%_0%,_rgba(37,99,235,0.1),_transparent_30%)]" />

                      <div className="relative">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200/75">
                          Board Snapshot
                        </div>
                        <div className="mt-2 text-[1.3rem] font-semibold text-white">
                          {activeBoard?.name ?? "Loading board"}
                        </div>
                        <div className="mt-4 space-y-2">
                          {isBoardLoading ? (
                            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-slate-300">Loading board status...</div>
                          ) : (
                            laneCards.slice(0, 4).map((lane) => (
                              <div key={lane.column.id} className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.15em] text-slate-300">
                                  <span>{lane.column.name}</span>
                                  <span>{lane.count}</span>
                                </div>
                                {lane.items.length === 0 ? (
                                  <div className="mt-2 text-[11px] text-slate-500">No cards</div>
                                ) : (
                                  <div className="mt-2 space-y-1">
                                    {lane.items.map((task) => (
                                      <div key={task.id} className="truncate rounded-[12px] border border-white/8 bg-white/[0.03] px-2 py-1.5 text-[11px] leading-5 text-slate-200">
                                        {task.title}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </aside>
                  </div>
                </section>
              </div>
            </div>
          )}
        </main>

        <SettingsPanel
          open={showSettingsPanel}
          onClose={() => setShowSettingsPanel(false)}
          providers={acp.providers}
          initialTab={settingsInitialTab}
        />

        {showWorkspacesMenu && (
          <div ref={workspacesMenuRef} className="fixed inset-0 z-40">
            <div className="absolute right-4 top-14 w-60 rounded-2xl border border-sky-200/80 bg-white p-1.5 shadow-lg dark:border-[#1c1f2e] dark:bg-[#12141c]">
              {workspacesHook.workspaces.map((workspace) => (
                <button
                  type="button"
                  key={workspace.id}
                  onClick={() => handleWorkspaceSelect(workspace.id)}
                  className={`mb-0.5 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-sky-50 dark:hover:bg-[#1a1f31] ${workspace.id === activeWorkspaceId ? "bg-sky-50 dark:bg-[#1c2740]" : ""}`}
                >
                  <span className="truncate text-[#081120] dark:text-slate-100">{workspace.title}</span>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-700 dark:bg-sky-900/35 dark:text-sky-200">
                    {workspace.id === activeWorkspaceId ? "Active" : "Enter"}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  handleWorkspaceCreate("New Workspace");
                  setShowWorkspacesMenu(false);
                }}
                className="mt-1 flex w-full items-center rounded-xl bg-sky-50 px-3 py-2 text-left text-sm text-[#081120] transition-colors hover:bg-sky-100 dark:bg-[#1a1f31] dark:text-slate-200 dark:hover:bg-[#232a3f]"
              >
                + New workspace
              </button>
            </div>
          </div>
        )}
      </div>
    </NotificationProvider>
  );
}

function BoardStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[18px] border border-sky-200/75 bg-white/78 px-3 py-3 dark:border-white/12 dark:bg-white/[0.05]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4b6f98] dark:text-slate-400">{label}</div>
      <div className="mt-1.5 text-[1.35rem] font-semibold tracking-tight text-[#081120] dark:text-white">{value}</div>
      <div className="mt-1 text-[11px] leading-5 text-[#577090] dark:text-slate-500">{detail}</div>
    </div>
  );
}
