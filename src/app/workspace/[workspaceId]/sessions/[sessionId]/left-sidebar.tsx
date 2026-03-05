"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {SessionContextPanel} from "@/client/components/session-context-panel";
import {type CrafterAgent, TaskPanel} from "@/client/components/task-panel";
import {CollaborativeTaskEditor} from "@/client/components/collaborative-task-editor";
import {MarkdownViewer} from "@/client/components/markdown/markdown-viewer";
import type {ParsedTask} from "@/client/utils/task-block-parser";
import type {RepoSelection} from "@/client/components/repo-picker";
import type {NoteData} from "@/client/hooks/use-notes";

type SidebarTab = "sessions" | "spec" | "tasks";

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

/* ─── Spec Viewer (inline in sidebar) ──────────────────────────────── */
function SpecViewer({ specNote, onDeleteNote }: {
  specNote: NoteData;
  onDeleteNote?: (noteId: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Spec header */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
            {specNote.title || "Spec"}
          </span>
        </div>
        {onDeleteNote && (
          <button
            onClick={() => onDeleteNote(specNote.id)}
            title="Delete spec"
            className="p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {/* Spec content — full scrollable area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        <MarkdownViewer
          content={specNote.content || "No spec content yet."}
          className="text-[12px] text-gray-700 dark:text-gray-300"
        />
      </div>
    </div>
  );
}

/* ─── Tasks Drawer (full-screen overlay for maximum space) ─────────── */
function TasksDrawer({
  open,
  onClose,
  hasCollabNotes,
  sessionNotes,
  notesConnected,
  onUpdateNote,
  onDeleteNote,
  onExecuteNoteTask,
  onExecuteAllNoteTasks,
  routaTasks,
  onConfirmAllTasks,
  onExecuteAllTasks,
  onConfirmTask,
  onEditTask,
  onExecuteTask,
  concurrency,
  onConcurrencyChange,
  workspaceId,
}: {
  open: boolean;
  onClose: () => void;
  hasCollabNotes: boolean;
  sessionNotes: NoteData[];
  notesConnected: boolean;
  onUpdateNote: (noteId: string, update: { title?: string; content?: string; metadata?: Record<string, unknown> }) => Promise<NoteData | null>;
  onDeleteNote: (noteId: string) => Promise<void>;
  onExecuteNoteTask: (noteId: string) => Promise<CrafterAgent | null>;
  onExecuteAllNoteTasks: (concurrency: number) => Promise<void>;
  routaTasks: ParsedTask[];
  onConfirmAllTasks: () => void;
  onExecuteAllTasks: (concurrency: number) => void;
  onConfirmTask: (taskId: string) => void;
  onEditTask: (taskId: string, updated: Partial<ParsedTask>) => void;
  onExecuteTask: (taskId: string) => Promise<CrafterAgent | null>;
  concurrency: number;
  onConcurrencyChange: (n: number) => void;
  workspaceId: string;
}) {
  const [drawerWidth, setDrawerWidth] = useState(600);
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = drawerWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startXRef.current - ev.clientX;
      setDrawerWidth(Math.max(420, Math.min(1000, startWidthRef.current + delta)));
    };
    const handleMouseUp = () => {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [drawerWidth]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const taskCount = hasCollabNotes
    ? sessionNotes.filter((n) => n.metadata.type === "task").length
    : routaTasks.length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed top-[52px] bottom-0 right-0 z-50 flex flex-col bg-white dark:bg-[#13151d] border-l border-gray-200 dark:border-gray-800 shadow-2xl"
        style={{ width: `${drawerWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-label="Tasks"
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-500/60 transition-colors z-10"
          onMouseDown={handleResizeStart}
        />
        <div className="h-10 px-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tasks</span>
            {taskCount > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300">
                {taskCount}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
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
    </>
  );
}

/* ─── Mini Task List (shown below sessions) ────────────────────────── */
const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-gray-300 dark:bg-gray-600",
  confirmed: "bg-blue-400 dark:bg-blue-500",
  running:   "bg-amber-400 animate-pulse",
  completed: "bg-emerald-500",
  error:     "bg-red-500",
  IN_PROGRESS: "bg-amber-400 animate-pulse",
  COMPLETED:   "bg-emerald-500",
  FAILED:      "bg-red-500",
  PENDING:     "bg-gray-300 dark:bg-gray-600",
};

function MiniTaskList({
  hasCollabNotes,
  sessionNotes,
  routaTasks,
  onSwitchToTasks,
}: {
  hasCollabNotes: boolean;
  sessionNotes: NoteData[];
  routaTasks: ParsedTask[];
  onSwitchToTasks: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    if (hasCollabNotes) {
      return sessionNotes
        .filter((n) => n.metadata.type === "task")
        .map((n) => ({
          id: n.id,
          title: n.title,
          status: (n.metadata.taskStatus as string) || "PENDING",
          detail: n.content,
        }));
    }
    return routaTasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      detail: [t.objective, t.scope, t.definitionOfDone].filter(Boolean).join("\n\n"),
    }));
  }, [hasCollabNotes, sessionNotes, routaTasks]);

  if (items.length === 0) return null;

  const handleMouseEnter = (id: string, e: React.MouseEvent<HTMLDivElement>) => {
    setHoveredId(id);
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setPopupPos({
        top: rect.top - containerRect.top,
        left: containerRect.width + 4,
      });
    }
  };

  return (
    <div ref={containerRef} className="relative border-t border-gray-100 dark:border-gray-800 shrink-0">
      {/* Section header */}
      <div className="px-3 py-1 flex items-center justify-between">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Tasks ({items.length})
        </span>
        <button
          onClick={onSwitchToTasks}
          className="text-[9px] text-indigo-500 dark:text-indigo-400 hover:underline"
        >
          view all
        </button>
      </div>

      {/* Task rows */}
      <div className="px-2 pb-1.5 space-y-0.5">
        {items.map((item) => {
          const dotColor = STATUS_COLORS[item.status] ?? "bg-gray-300";
          return (
            <div
              key={item.id}
              className="group flex items-center gap-1.5 px-1.5 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-default transition-colors"
              onMouseEnter={(e) => handleMouseEnter(item.id, e)}
              onMouseLeave={() => { setHoveredId(null); setPopupPos(null); }}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
              <span className="text-[11px] text-gray-600 dark:text-gray-400 truncate flex-1">
                {item.title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Hover popup */}
      {hoveredId && popupPos && (() => {
        const item = items.find((i) => i.id === hoveredId);
        if (!item) return null;
        return (
          <div
            className="absolute z-50 w-64 bg-white dark:bg-[#1e2130] border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 pointer-events-none"
            style={{ top: popupPos.top, left: popupPos.left }}
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[item.status] ?? "bg-gray-300"}`} />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {item.title}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-6 whitespace-pre-wrap">
              {item.detail || "No details."}
            </div>
            <div className="mt-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {item.status}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ─── Tab Button ───────────────────────────────────────────────────── */
function TabButton({ active, label, badge, badgePulse, icon, onClick }: {
  active: boolean;
  label: string;
  badge?: number;
  badgePulse?: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-t-md border-b-2 transition-colors whitespace-nowrap ${
        active
          ? "border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/10"
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      {icon}
      {label}
      {badge != null && badge > 0 && (
        <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full leading-none ${
          badgePulse
            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 animate-pulse"
            : active
              ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300"
              : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        }`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/* ─── Main LeftSidebar Component ───────────────────────────────────── */
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
  const [activeTab, setActiveTab] = useState<SidebarTab>("sessions");
  const [showTasksDrawer, setShowTasksDrawer] = useState(false);

  const taskCount = hasCollabNotes
    ? sessionNotes.filter((n) => n.metadata.type === "task").length
    : routaTasks.length;

  const specNote = useMemo(
    () => sessionNotes.find((n) => n.metadata.type === "spec"),
    [sessionNotes]
  );

  const hasRunningTasks = hasCollabNotes
    ? sessionNotes.some((n) => n.metadata.taskStatus === "IN_PROGRESS")
    : routaTasks.some((t) => t.status === "running");

  // Auto-switch to tasks tab when tasks appear for the first time
  const hasAutoSwitchedRef = useRef(false);
  useEffect(() => {
    if (taskCount > 0 && !hasAutoSwitchedRef.current) {
      hasAutoSwitchedRef.current = true;
      setActiveTab("tasks");
    }
  }, [taskCount]);

  // Auto-switch to spec tab when spec appears
  const hasAutoSwitchedSpecRef = useRef(false);
  useEffect(() => {
    if (specNote && !hasAutoSwitchedSpecRef.current) {
      hasAutoSwitchedSpecRef.current = true;
      setActiveTab("spec");
    }
  }, [specNote]);

  return (
    <>
      <aside
        className={`shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col relative transition-[width] duration-200
          ${showMobileSidebar ? "fixed inset-y-[52px] left-0 z-40 shadow-2xl overflow-y-auto" : "hidden md:flex overflow-hidden"}
        `}
        style={{ width: isCollapsed ? "44px" : `${width}px` }}
      >
        {isCollapsed ? (
          /* ─── Collapsed: icon strip ──────────────────────────── */
          <div className="flex flex-col items-center py-2 gap-1.5 h-full">
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Expand sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>

            {/* Sessions */}
            <button
              onClick={() => { onToggleCollapse(); setActiveTab("sessions"); }}
              className={`p-1.5 rounded-md transition-colors ${activeTab === "sessions" ? "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              title="Sessions"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>

            {/* Spec */}
            {specNote && (
              <button
                onClick={() => { onToggleCollapse(); setActiveTab("spec"); }}
                className={`p-1.5 rounded-md transition-colors ${activeTab === "spec" ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
                title="Spec"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </button>
            )}

            {/* Tasks */}
            <button
              onClick={() => { onToggleCollapse(); setActiveTab("tasks"); }}
              className={`relative p-1.5 rounded-md transition-colors ${activeTab === "tasks" ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"}`}
              title="Tasks"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              {taskCount > 0 && (
                <span className={`absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center rounded-full text-white text-[8px] font-bold ${hasRunningTasks ? "bg-amber-400 animate-pulse" : "bg-emerald-500"}`}>
                  {taskCount > 9 ? "9+" : taskCount}
                </span>
              )}
            </button>

            {/* New session */}
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
          /* ─── Expanded: tabbed sidebar ───────────────────────── */
          <>
            {/* Header: codebase + new session + collapse */}
            <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2 shrink-0">
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
              <div className="flex items-center gap-0.5">
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
                <button
                  onClick={onToggleCollapse}
                  className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Collapse sidebar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="flex items-end px-1 pt-1 border-b border-gray-200 dark:border-gray-700 shrink-0 gap-0.5 overflow-x-auto">
              <TabButton
                active={activeTab === "sessions"}
                label="Sessions"
                onClick={() => setActiveTab("sessions")}
                icon={
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                }
              />
              {specNote && (
                <TabButton
                  active={activeTab === "spec"}
                  label="Spec"
                  onClick={() => setActiveTab("spec")}
                  icon={
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  }
                />
              )}
              <TabButton
                active={activeTab === "tasks"}
                label="Tasks"
                badge={taskCount}
                badgePulse={hasRunningTasks}
                onClick={() => setActiveTab("tasks")}
                icon={
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                }
              />
              {/* Pop-out button for tasks — opens drawer for more space */}
              {activeTab === "tasks" && taskCount > 0 && (
                <button
                  onClick={() => setShowTasksDrawer(true)}
                  className="ml-auto p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-0.5"
                  title="Pop out to drawer for more space"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </button>
              )}
            </div>

            {/* Tab content — full remaining height */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {activeTab === "sessions" && (
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <SessionContextPanel
                      sessionId={sessionId}
                      workspaceId={workspaceId}
                      onSelectSession={onSelectSession}
                      refreshTrigger={refreshKey}
                    />
                  </div>
                  {/* Mini task list pinned below sessions */}
                  <MiniTaskList
                    hasCollabNotes={hasCollabNotes}
                    sessionNotes={sessionNotes}
                    routaTasks={routaTasks}
                    onSwitchToTasks={() => setActiveTab("tasks")}
                  />
                </div>
              )}

              {activeTab === "spec" && specNote && (
                <SpecViewer specNote={specNote} onDeleteNote={onDeleteNote} />
              )}

              {activeTab === "tasks" && (
                <div className="flex-1 min-h-0 overflow-hidden">
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
              )}
            </div>

            {/* Bottom actions */}
            <div className="p-1.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1 shrink-0">
              <button
                ref={installAgentsButtonRef}
                onClick={onShowAgentInstall}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Agents
              </button>
              <button
                type="button"
                onClick={onShowSettings}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                title="Settings"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </>
        )}

        {/* Left sidebar resize handle */}
        <div className="left-resize-handle hidden md:block" onMouseDown={onResizeStart}>
          <div className="resize-indicator" />
        </div>
      </aside>

      {/* Tasks Drawer — pop-out for maximum space */}
      <TasksDrawer
        open={showTasksDrawer}
        onClose={() => setShowTasksDrawer(false)}
        hasCollabNotes={hasCollabNotes}
        sessionNotes={sessionNotes}
        notesConnected={notesConnected}
        onUpdateNote={onUpdateNote}
        onDeleteNote={onDeleteNote}
        onExecuteNoteTask={onExecuteNoteTask}
        onExecuteAllNoteTasks={onExecuteAllNoteTasks}
        routaTasks={routaTasks}
        onConfirmAllTasks={onConfirmAllTasks}
        onExecuteAllTasks={onExecuteAllTasks}
        onConfirmTask={onConfirmTask}
        onEditTask={onEditTask}
        onExecuteTask={onExecuteTask}
        concurrency={concurrency}
        onConcurrencyChange={onConcurrencyChange}
        workspaceId={workspaceId}
      />
    </>
  );
}
