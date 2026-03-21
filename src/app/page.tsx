"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { HomeInput } from "@/client/components/home-input";
import { ConnectionDot, OnboardingCard } from "@/client/components/home-page-sections";
import { useAcp } from "@/client/hooks/use-acp";
import { useWorkspaces } from "@/client/hooks/use-workspaces";
import { NotificationBell, NotificationProvider } from "@/client/components/notification-center";
import { SettingsPanel } from "@/client/components/settings-panel";

export default function HomePage() {
  const workspacesHook = useWorkspaces();
  const acp = useAcp();

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"providers" | "roles" | "specialists" | undefined>(undefined);

  const [showWorkspacesMenu, setShowWorkspacesMenu] = useState(false);
  const workspacesMenuRef = useRef<HTMLDivElement>(null);

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

  const handleWorkspaceSelect = useCallback((workspaceId: string) => {
    setActiveWorkspaceId(workspaceId);
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
            <div className="mx-auto flex w-full max-w-5xl px-3 py-6 sm:px-6 sm:py-10">
              <section className="w-full overflow-hidden rounded-[34px] border border-sky-200/75 bg-[linear-gradient(180deg,rgba(252,254,255,0.98),rgba(237,246,255,0.95))] shadow-[0_60px_170px_-120px_rgba(37,99,235,0.45)] dark:border-[#223049] dark:bg-[linear-gradient(180deg,rgba(7,12,21,0.96),rgba(9,15,26,0.98))]">
                <div className="p-4 sm:p-6 lg:p-8">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#4a74a8] dark:text-slate-400">
                    <span className="rounded-full border border-sky-200/70 bg-white/80 px-3 py-1.5 dark:border-white/10 dark:bg-white/5">
                      Minimal Home
                    </span>
                    <span className="rounded-full border border-sky-200/70 bg-white/60 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
                      {String(workspaceCount).padStart(2, "0")} workspaces
                    </span>
                    <span className="rounded-full border border-sky-200/70 bg-white/60 px-3 py-1.5 dark:border-white/10 dark:bg-white/[0.03]">
                      {acp.connected ? "Runtime ready" : "Runtime offline"}
                    </span>
                  </div>

                  <h1 className="mt-5 max-w-3xl font-['Avenir_Next_Condensed','Avenir_Next','Segoe_UI','Helvetica_Neue',sans-serif] text-[2.3rem] leading-[0.94] font-semibold tracking-[-0.05em] text-[#081120] dark:text-white sm:text-[3.1rem]">
                    Start with a requirement.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#4d6689] dark:text-slate-300">
                    Pick a workspace, describe the task, and route it. Everything else can happen after you enter the flow.
                  </p>

                  <div className="mt-6 rounded-[30px] border border-sky-200/80 bg-white/82 p-4 shadow-[0_30px_100px_-58px_rgba(37,99,235,0.24)] backdrop-blur dark:border-white/10 dark:bg-[#0a1322]/70 sm:p-5">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#356fb0] dark:text-slate-400">
                        Composer
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.16em] text-[#6b84aa] dark:text-slate-500">
                        Current workspace: {activeWorkspace?.title ?? "None"}
                      </div>
                    </div>
                    <HomeInput
                      variant="hero"
                      workspaceId={activeWorkspaceId ?? undefined}
                      onWorkspaceChange={(workspaceId) => {
                        setActiveWorkspaceId(workspaceId);
                      }}
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setShowWorkspacesMenu((value) => !value)}
                      className="inline-flex items-center justify-center rounded-full border border-sky-200/70 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-[#45678f] transition-colors hover:border-sky-300 hover:text-[#081120] dark:border-[#2a3042] dark:text-slate-400 dark:hover:border-[#39415a] dark:hover:text-slate-200"
                    >
                      {activeWorkspace?.title ?? "Switch workspace"}
                    </button>
                    <Link
                      href={activeWorkspaceHref}
                      className="inline-flex items-center justify-center rounded-full border border-sky-200/70 bg-white/90 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2b6fc8] transition-colors hover:bg-white dark:border-white/10 dark:bg-[#1b2232] dark:text-slate-300 dark:hover:bg-[#101826]"
                    >
                      Workspace overview
                    </Link>
                    <Link
                      href={activeKanbanHref}
                      className="inline-flex items-center justify-center rounded-full bg-[#0f62d6] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-[#2a77e4] dark:bg-[#5ee5ff] dark:text-[#04111d] dark:hover:bg-[#87edff]"
                    >
                      Open Kanban
                    </Link>
                  </div>
                </div>
              </section>
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
