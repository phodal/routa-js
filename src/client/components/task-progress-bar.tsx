"use client";

/**
 * TaskProgressBar - Collapsible task progress indicator for ACP Claude Code tasks.
 *
 * Shows a compact summary of task progress above the input area.
 * - Collapsed: Shows current running task (e.g., "Todos (3/5) Analyzing codebase...")
 * - Expanded: Shows all tasks with their statuses
 * - Footer: Shows file changes summary (e.g., "📁 5 files changed +286 -45")
 */

import { useState, useMemo } from "react";

export interface TaskInfo {
  id: string;
  title: string;
  description?: string;
  subagentType?: string;
  /** Task status: "pending", "running", "delegated" (async running), "completed", or "failed" */
  status: "pending" | "running" | "delegated" | "completed" | "failed";
  /** Completion summary when task finishes */
  completionSummary?: string;
}

export interface FileChangesSummary {
  fileCount: number;
  totalAdded: number;
  totalRemoved: number;
}

interface TaskProgressBarProps {
  tasks: TaskInfo[];
  fileChanges?: FileChangesSummary;
  className?: string;
}

export function TaskProgressBar({ tasks, fileChanges, className = "" }: TaskProgressBarProps) {
  const [expanded, setExpanded] = useState(false);

  // Find current running task and calculate progress
  const { currentTaskIndex, completedCount, runningTask, delegatedCount } = useMemo(() => {
    let runningIdx = -1;
    let completed = 0;
    let delegated = 0;
    let running: TaskInfo | null = null;

    for (let i = 0; i < tasks.length; i++) {
      if (tasks[i].status === "completed") {
        completed++;
      }
      // "delegated" means async running - treat as running for display
      if ((tasks[i].status === "running" || tasks[i].status === "delegated") && runningIdx === -1) {
        runningIdx = i;
        running = tasks[i];
      }
      if (tasks[i].status === "delegated") {
        delegated++;
      }
    }

    // If no running task, show the first pending one
    if (runningIdx === -1) {
      for (let i = 0; i < tasks.length; i++) {
        if (tasks[i].status === "pending") {
          runningIdx = i;
          running = tasks[i];
          break;
        }
      }
    }

    return {
      currentTaskIndex: runningIdx >= 0 ? runningIdx + 1 : completed + 1,
      completedCount: completed,
      delegatedCount: delegated,
      runningTask: running,
    };
  }, [tasks]);

  // Show component if we have tasks or file changes
  if (tasks.length === 0 && !fileChanges) return null;

  const allCompleted = tasks.length > 0 && completedCount === tasks.length;
  const progressPercent = tasks.length > 0 ? (completedCount / tasks.length) * 100 : 0;

  return (
    <div className={`w-full ${className}`}>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#161922] overflow-hidden">
        {/* Header - always visible */}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-gray-100 dark:hover:bg-[#1a1d2e] transition-colors"
        >
          {/* Progress indicator with Todos label */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`w-2 h-2 rounded-full ${allCompleted ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
            {tasks.length > 0 && (
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Todos ({completedCount}/{tasks.length})
              </span>
            )}
          </div>

          {/* Current task title */}
          <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
            {runningTask?.title || (allCompleted ? "All tasks completed" : fileChanges ? "" : "Tasks")}
          </span>

          {/* File changes summary in header (compact) */}
          {fileChanges && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0 flex items-center gap-1">
              <span>📁 {fileChanges.fileCount}</span>
              <span className="text-green-600 dark:text-green-400">+{fileChanges.totalAdded}</span>
              <span className="text-red-500 dark:text-red-400">-{fileChanges.totalRemoved}</span>
            </span>
          )}

          {/* Expand/collapse icon */}
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 shrink-0 ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Progress bar - only show if we have tasks */}
        {tasks.length > 0 && (
          <div className="h-0.5 bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}

        {/* Expanded task list */}
        {expanded && tasks.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 max-h-48 overflow-y-auto">
            {tasks.map((task, index) => (
              <TaskRow key={task.id} task={task} index={index} />
            ))}
          </div>
        )}

        {/* File changes footer - show when expanded or when no tasks */}
        {expanded && fileChanges && fileChanges.fileCount > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">📁</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">
              {fileChanges.fileCount} file{fileChanges.fileCount !== 1 ? "s" : ""} changed
            </span>
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              +{fileChanges.totalAdded}
            </span>
            <span className="text-xs text-red-500 dark:text-red-400 font-medium">
              -{fileChanges.totalRemoved}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, index }: { task: TaskInfo; index: number }) {
  const statusConfig: Record<TaskInfo["status"], { color: string; label: string }> = {
    pending: { color: "bg-gray-400", label: "pending" },
    running: { color: "bg-amber-500 animate-pulse", label: "running" },
    delegated: { color: "bg-blue-500 animate-pulse", label: "delegated" },
    completed: { color: "bg-green-500", label: "done" },
    failed: { color: "bg-red-500", label: "failed" },
  };

  const { color, label } = statusConfig[task.status];

  return (
    <div className="px-3 py-2 flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-[#1a1d2e] transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
      <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 shrink-0">
        #{index + 1}
      </span>
      {task.subagentType && (
        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
          [{task.subagentType}]
        </span>
      )}
      <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">
        {task.title || task.description || "Task"}
      </span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
        {label}
      </span>
      {/* Show completion summary for completed tasks */}
      {task.status === "completed" && task.completionSummary && (
        <span className="text-[10px] text-green-600 dark:text-green-400 truncate max-w-[120px]" title={task.completionSummary}>
          ✓ {task.completionSummary.slice(0, 30)}...
        </span>
      )}
    </div>
  );
}

