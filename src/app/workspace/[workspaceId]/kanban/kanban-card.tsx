"use client";

import type { AcpProviderInfo } from "@/client/acp-client";
import type { CodebaseData } from "@/client/hooks/use-workspaces";
import type { SessionInfo, TaskInfo, WorktreeInfo } from "../types";

interface SpecialistOption {
  id: string;
  name: string;
  role: string;
}

export interface KanbanCardProps {
  task: TaskInfo;
  linkedSession?: SessionInfo;
  availableProviders: AcpProviderInfo[];
  specialists: SpecialistOption[];
  codebases: CodebaseData[];
  allCodebaseIds: string[];
  worktreeCache: Record<string, WorktreeInfo>;
  onDragStart: () => void;
  onOpenDetail: () => void;
  onOpenSession: (sessionId: string | null) => void;
  onDelete: () => void;
  onPatchTask: (taskId: string, payload: Record<string, unknown>) => Promise<TaskInfo>;
  onRetryTrigger: (taskId: string) => Promise<void>;
  onRefresh: () => void;
}

const ROLE_OPTIONS = ["CRAFTER", "ROUTA", "GATE", "DEVELOPER"];

export function KanbanCard({
  task,
  linkedSession,
  availableProviders,
  specialists,
  codebases,
  allCodebaseIds,
  worktreeCache,
  onDragStart,
  onOpenDetail,
  onOpenSession,
  onDelete,
  onPatchTask,
  onRetryTrigger,
  onRefresh,
}: KanbanCardProps) {
  const sessionStatus = linkedSession?.acpStatus;
  const sessionError = linkedSession?.acpError;
  const canRetry = Boolean(task.assignedProvider) && (
    sessionStatus === "error" || (!task.triggerSessionId && task.columnId === "dev")
  );
  const canRun = Boolean(task.assignedProvider) && !task.triggerSessionId && task.columnId !== "done";

  const stopCardInteraction = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetail();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${task.title}`}
      className="group relative cursor-grab rounded-xl border border-gray-200/70 bg-gray-50/80 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400/50 active:cursor-grabbing dark:border-[#262938] dark:bg-[#0d1018]"
      data-testid="kanban-card"
    >
      {/* Delete button - shown on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md p-1 hover:bg-red-100 dark:hover:bg-red-900/20"
        title="Delete task"
        data-testid="kanban-card-delete"
      >
        <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{task.title}</div>
          {task.githubNumber ? (
            <a
              href={task.githubUrl}
              target="_blank"
              rel="noreferrer"
              onClick={stopCardInteraction}
              className="mt-1 inline-flex text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
            >
              #{task.githubNumber}
            </a>
          ) : (
            <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">Local issue</div>
          )}
        </div>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-600 dark:bg-[#1c1f2e] dark:text-gray-300">
          {task.priority ?? "medium"}
        </span>
      </div>

      <p className="mt-2 line-clamp-4 text-[12px] leading-5 text-gray-600 dark:text-gray-400">{task.objective}</p>

      {task.labels && task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <span key={label} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Repository badge */}
      {((task.codebaseIds && task.codebaseIds.length > 0) || allCodebaseIds.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(task.codebaseIds && task.codebaseIds.length > 0 ? task.codebaseIds : allCodebaseIds).map((cbId) => {
            const cb = codebases.find((c) => c.id === cbId);
            return cb ? (
              <span
                key={cbId}
                className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-900/20 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300"
                data-testid="repo-badge"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                {cb.label ?? cb.repoPath.split("/").pop() ?? cb.repoPath}
              </span>
            ) : (
              <span key={cbId} className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] text-red-600 dark:bg-red-900/20 dark:text-red-400" title="Repository no longer available">
                ⚠ repo missing
              </span>
            );
          })}
        </div>
      )}

      {/* Worktree status badge */}
      <WorktreeBadge task={task} worktreeCache={worktreeCache} onOpenDetail={onOpenDetail} stopCardInteraction={stopCardInteraction} />

      {/* Assignment Section */}
      <AssignmentSection
        task={task}
        availableProviders={availableProviders}
        specialists={specialists}
        stopCardInteraction={stopCardInteraction}
        onPatchTask={onPatchTask}
        onRefresh={onRefresh}
      />

      {/* Footer with status and actions */}
      <CardFooter
        task={task}
        sessionStatus={sessionStatus}
        sessionError={sessionError}
        canRun={canRun}
        canRetry={canRetry}
        stopCardInteraction={stopCardInteraction}
        onOpenDetail={onOpenDetail}
        onOpenSession={onOpenSession}
        onRetryTrigger={onRetryTrigger}
      />
    </div>
  );
}

// Sub-components

interface WorktreeBadgeProps {
  task: TaskInfo;
  worktreeCache: Record<string, WorktreeInfo>;
  onOpenDetail: () => void;
  stopCardInteraction: (event: { stopPropagation: () => void }) => void;
}

function WorktreeBadge({ task, worktreeCache, onOpenDetail, stopCardInteraction }: WorktreeBadgeProps) {
  if (!task.worktreeId) return null;

  const wt = worktreeCache[task.worktreeId];
  if (!wt) return <div className="mt-2 text-[10px] text-gray-400">Loading worktree...</div>;

  const wtBadgeColor = wt.status === "active"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
    : wt.status === "creating"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
      : "bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300";

  return (
    <button
      onClick={onOpenDetail}
      onClickCapture={stopCardInteraction}
      className="mt-2 flex items-center gap-1.5 group"
      title="Click to view worktree details"
      data-testid="worktree-badge"
    >
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${wtBadgeColor}`}>
        {wt.status}
      </span>
      <span className="max-w-30 truncate text-[10px] text-gray-500 dark:text-gray-400">{wt.branch}</span>
    </button>
  );
}

interface AssignmentSectionProps {
  task: TaskInfo;
  availableProviders: AcpProviderInfo[];
  specialists: SpecialistOption[];
  stopCardInteraction: (event: { stopPropagation: () => void }) => void;
  onPatchTask: (taskId: string, payload: Record<string, unknown>) => Promise<TaskInfo>;
  onRefresh: () => void;
}

function AssignmentSection({
  task,
  availableProviders,
  specialists,
  stopCardInteraction,
  onPatchTask,
  onRefresh,
}: AssignmentSectionProps) {
  return (
    <div className="mt-3 space-y-2 border-t border-gray-200/50 pt-3 dark:border-[#262938]">
      {/* Row 1: Provider */}
      <div className="flex items-center gap-2">
        <span className="w-16 shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400">Provider</span>
        <select
          value={task.assignedProvider ?? ""}
          onClick={stopCardInteraction}
          onChange={async (event) => {
            const providerId = event.target.value;
            if (providerId) {
              await onPatchTask(task.id, {
                assignedProvider: providerId,
                assignedRole: task.assignedRole ?? "DEVELOPER",
              });
            } else {
              await onPatchTask(task.id, {
                assignedProvider: undefined,
                assignedRole: undefined,
                assignedSpecialistId: undefined,
                assignedSpecialistName: undefined,
              });
            }
            onRefresh();
          }}
          className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-[#12141c]"
        >
          <option value="">Select...</option>
          {availableProviders.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </div>

      {/* Row 2: Role (only show if provider is assigned) */}
      {task.assignedProvider && (
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400">Role</span>
          <select
            value={task.assignedRole ?? "DEVELOPER"}
            onClick={stopCardInteraction}
            onChange={async (event) => {
              await onPatchTask(task.id, { assignedRole: event.target.value });
              onRefresh();
            }}
            className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-[#12141c]"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
      )}

      {/* Row 3: Specialist (only show if provider is assigned) */}
      {task.assignedProvider && (
        <div className="flex items-center gap-2">
          <span className="w-16 shrink-0 text-[10px] font-medium text-gray-500 dark:text-gray-400">Specialist</span>
          <select
            value={task.assignedSpecialistId ?? ""}
            onClick={stopCardInteraction}
            onChange={async (event) => {
              const specialist = specialists.find((item) => item.id === event.target.value);
              await onPatchTask(task.id, {
                assignedSpecialistId: event.target.value || undefined,
                assignedSpecialistName: specialist?.name ?? undefined,
                assignedRole: specialist?.role ?? task.assignedRole,
              });
              onRefresh();
            }}
            className="min-w-0 flex-1 truncate rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] dark:border-gray-700 dark:bg-[#12141c]"
          >
            <option value="">None</option>
            {specialists.map((specialist) => (
              <option key={specialist.id} value={specialist.id}>
                {specialist.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}


interface CardFooterProps {
  task: TaskInfo;
  sessionStatus?: "connecting" | "ready" | "error";
  sessionError?: string;
  canRun: boolean;
  canRetry: boolean;
  stopCardInteraction: (event: { stopPropagation: () => void }) => void;
  onOpenDetail: () => void;
  onOpenSession: (sessionId: string | null) => void;
  onRetryTrigger: (taskId: string) => Promise<void>;
}

function CardFooter({
  task,
  sessionStatus,
  sessionError,
  canRun,
  canRetry,
  stopCardInteraction,
  onOpenDetail,
  onOpenSession,
  onRetryTrigger,
}: CardFooterProps) {
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
      <div className="min-w-0 flex-1">
        <div className="truncate text-gray-400 dark:text-gray-500">
          {sessionStatus === "connecting"
            ? "Session starting..."
            : sessionStatus === "error"
              ? (sessionError ?? "Session failed")
              : task.lastSyncError
                ? task.lastSyncError
                : task.githubSyncedAt
                  ? `Synced ${new Date(task.githubSyncedAt).toLocaleString()}`
                  : "Not synced"}
        </div>
        {sessionStatus && (
          <div className="mt-1 flex items-center gap-1.5">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              sessionStatus === "ready"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                : sessionStatus === "error"
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
            }`}>
              {sessionStatus}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canRun && !canRetry && (
          <button
            onClick={() => void onRetryTrigger(task.id)}
            onClickCapture={stopCardInteraction}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/50 dark:bg-emerald-900/10 dark:text-emerald-300"
          >
            Run
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => void onRetryTrigger(task.id)}
            onClickCapture={stopCardInteraction}
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700 hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-900/10 dark:text-amber-300"
          >
            Rerun
          </button>
        )}
        <button
          onClick={onOpenDetail}
          onClickCapture={stopCardInteraction}
          className="rounded-md bg-blue-100 px-2 py-1 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/20 dark:text-blue-300"
        >
          View detail
        </button>
        {task.triggerSessionId && (
          <button
            onClick={() => onOpenSession(task.triggerSessionId ?? null)}
            onClickCapture={stopCardInteraction}
            className="rounded-md bg-violet-100 px-2 py-1 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/20 dark:text-violet-300"
          >
            View session
          </button>
        )}
      </div>
    </div>
  );
}

