"use client";

import React from "react";
import {SessionContextPanel} from "@/client/components/session-context-panel";
import {type CrafterAgent, TaskPanel, CraftersView} from "@/client/components/task-panel";
import {CollaborativeTaskEditor} from "@/client/components/collaborative-task-editor";
import type {ParsedTask} from "@/client/utils/task-block-parser";
import type {RepoSelection} from "@/client/components/repo-picker";
import type {NoteData} from "@/client/hooks/use-notes";

interface LeftSidebarProps {
  // Sidebar dimensions & collapse
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
  showMobileSidebar: boolean;
  onResizeStart: (e: React.MouseEvent) => void;

  // Session & workspace
  sessionId: string;
  workspaceId: string;
  refreshKey: number;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (provider: string) => void;

  // Codebase
  codebases: Array<{ repoPath: string; branch?: string; label?: string; isDefault?: boolean }>;
  repoSelection: RepoSelection | null;

  // ACP (provider state for new-session button)
  hasProviders: boolean;
  hasSelectedProvider: boolean;

  // Tasks
  routaTasks: ParsedTask[];
  onConfirmAllTasks: () => void;
  onExecuteAllTasks: (concurrency: number) => void;
  onConfirmTask: (taskId: string) => void;
  onEditTask: (taskId: string, updated: Partial<ParsedTask>) => void;
  onExecuteTask: (taskId: string) => Promise<CrafterAgent | null>;
  concurrency: number;
  onConcurrencyChange: (n: number) => void;

  // Collaborative notes
  hasCollabNotes: boolean;
  sessionNotes: NoteData[];
  notesConnected: boolean;
  onUpdateNote: (noteId: string, update: { title?: string; content?: string; metadata?: Record<string, unknown> }) => Promise<NoteData | null>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExecuteNoteTask: (noteId: string) => Promise<CrafterAgent | null>;
  onExecuteAllNoteTasks: (concurrency: number) => Promise<void>;

  // Bottom actions
  installAgentsButtonRef: React.RefObject<HTMLButtonElement | null>;
  onShowAgentInstall: () => void;
  onShowSettings: () => void;
}

export function LeftSidebar({
  isCollapsed,
  onToggleCollapse,
  width,
  showMobileSidebar,
  onResizeStart,
  sessionId,
  workspaceId,
  refreshKey,
  onSelectSession,
  onCreateSession,
  codebases,
  repoSelection,
  hasProviders,
  hasSelectedProvider,
  routaTasks,
  onConfirmAllTasks,
  onExecuteAllTasks,
  onConfirmTask,
  onEditTask,
  onExecuteTask,
  concurrency,
  onConcurrencyChange,
  hasCollabNotes,
  sessionNotes,
  notesConnected,
  onUpdateNote,
  onDeleteNote,
  onExecuteNoteTask,
  onExecuteAllNoteTasks,
  installAgentsButtonRef,
  onShowAgentInstall,
  onShowSettings,
}: LeftSidebarProps) {
  const canCreateSession = hasProviders && hasSelectedProvider;

  return (
    <aside
      className={`shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col relative transition-[width] duration-200
        ${showMobileSidebar ? "fixed inset-y-[52px] left-0 z-40 shadow-2xl overflow-y-auto" : "hidden md:flex overflow-hidden"}
      `}
      style={{ width: isCollapsed ? "44px" : `${width}px` }}
    >
      {isCollapsed ? (
        /* ─── Collapsed sidebar: icon-only strip ─────────────── */
        <div className="flex flex-col items-center py-2 gap-2 h-full">
          {/* Expand button */}
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title="Expand sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>

          {/* New session button */}
          <button
            onClick={() => onCreateSession("")}
            disabled={!canCreateSession}
            className="p-1.5 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title="New Session"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>

          <div className="flex-1" />

          {/* Settings button */}
          <button
            onClick={onShowSettings}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      ) : (
        /* ─── Expanded sidebar ────────────────────────────────── */
        <>
          {/* Sidebar header: New Session + codebase + collapse */}
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {codebases.length > 0 && repoSelection && (
                <>
                  <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                  </svg>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {repoSelection.name ?? repoSelection.path.split("/").pop()}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onCreateSession("")}
                disabled={!canCreateSession}
                title="New Session"
                className="p-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* ─── Session Hierarchy (top panel) ────────────────── */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Session hierarchy section */}
            <div className="flex-1 min-h-0 flex flex-col border-b border-gray-100 dark:border-gray-800">
              <div className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Sessions
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <SessionContextPanel
                  sessionId={sessionId}
                  workspaceId={workspaceId}
                  onSelectSession={onSelectSession}
                  refreshTrigger={refreshKey}
                />
              </div>
            </div>

            {/* ─── Tasks section (bottom panel) ─────────────────── */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  Tasks {routaTasks.length > 0 && `(${routaTasks.length})`}
                </span>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {hasCollabNotes ? (
                  <CollaborativeTaskEditor
                    notes={sessionNotes}
                    connected={notesConnected}
                    onUpdateNote={onUpdateNote}
                    onDeleteNote={onDeleteNote}
                    workspaceId={workspaceId}
                    onExecuteTask={onExecuteNoteTask}
                    onExecuteAll={onExecuteAllNoteTasks}
                    concurrency={concurrency}
                    onConcurrencyChange={onConcurrencyChange}
                  />
                ) : (
                  <TaskPanel
                    tasks={routaTasks}
                    onConfirmAll={onConfirmAllTasks}
                    onExecuteAll={onExecuteAllTasks}
                    onConfirmTask={onConfirmTask}
                    onEditTask={onEditTask}
                    onExecuteTask={onExecuteTask}
                    concurrency={concurrency}
                    onConcurrencyChange={onConcurrencyChange}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bottom actions */}
          <div className="p-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                ref={installAgentsButtonRef}
                onClick={onShowAgentInstall}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Install Agents
              </button>
              <button
                type="button"
                onClick={onShowSettings}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                title="Settings"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
            {/* Collapse button - moved to bottom right */}
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Collapse sidebar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
        </>
      )}

      {/* Left sidebar resize handle */}
      <div
        className="left-resize-handle hidden md:block"
        onMouseDown={onResizeStart}
      >
        <div className="resize-indicator" />
      </div>
    </aside>
  );
}
