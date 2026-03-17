/**
 * Workflow Orchestrator Singleton
 *
 * Provides a global instance of the KanbanWorkflowOrchestrator.
 * Initialized when the RoutaSystem is created.
 */

import { KanbanWorkflowOrchestrator } from "./workflow-orchestrator";
import type { RoutaSystem } from "../routa-system";
import type { KanbanColumnAutomation } from "../models/kanban";
import { TaskStatus } from "../models/task";
import { GitWorktreeService } from "../git/git-worktree-service";
import {
  getDefaultWorkspaceWorktreeRoot,
  getEffectiveWorkspaceMetadata,
} from "../models/workspace";
import { resolveEffectiveTaskAutomation } from "./effective-task-automation";
import { getInternalApiOrigin, triggerAssignedTaskAgent } from "./agent-trigger";
import { KanbanSessionQueue } from "./kanban-session-queue";
import { getKanbanSessionConcurrencyLimit as getBoardSessionConcurrencyLimit } from "./board-session-limits";
import { upsertTaskLaneSession } from "./task-lane-history";

// Use globalThis to survive HMR in Next.js dev mode
const GLOBAL_KEY = "__routa_workflow_orchestrator__";
const STARTED_KEY = "__routa_workflow_orchestrator_started__";
const QUEUE_KEY = "__routa_kanban_session_queue__";

async function createAutomationSession(
  system: RoutaSystem,
  params: {
    workspaceId: string;
    cardTitle: string;
    columnName: string;
    cardId: string;
    columnId: string;
    automation: KanbanColumnAutomation;
  },
): Promise<string | null> {
  const task = await system.taskStore.get(params.cardId);
  if (!task?.boardId) return null;
  const result = await enqueueKanbanTaskSession(system, {
    task,
    expectedColumnId: params.columnId,
    mutateTask: (nextTask) => {
      nextTask.assignedProvider =
        params.automation.providerId ?? task.assignedProvider ?? "opencode";
      nextTask.assignedRole =
        params.automation.role ?? task.assignedRole ?? "DEVELOPER";
      nextTask.assignedSpecialistId =
        params.automation.specialistId ?? task.assignedSpecialistId;
      nextTask.assignedSpecialistName =
        params.automation.specialistName ?? task.assignedSpecialistName;
    },
  });
  return result.sessionId ?? null;
}

export async function enqueueKanbanTaskSession(
  system: RoutaSystem,
  params: {
    task: Awaited<ReturnType<RoutaSystem["taskStore"]["get"]>>;
    expectedColumnId?: string;
    ignoreExistingTrigger?: boolean;
    mutateTask?: (task: NonNullable<Awaited<ReturnType<RoutaSystem["taskStore"]["get"]>>>) => void;
  },
): Promise<{ sessionId?: string; queued: boolean; error?: string }> {
  const task = params.task;
  if (!task?.boardId) {
    return { queued: false, error: "Task is missing board context." };
  }
  if (task.triggerSessionId && !params.ignoreExistingTrigger) {
    return { sessionId: task.triggerSessionId, queued: false };
  }

  const queue = getKanbanSessionQueue(system);
  return queue.enqueue({
    cardId: task.id,
    cardTitle: task.title,
    boardId: task.boardId,
    workspaceId: task.workspaceId,
    columnId: params.expectedColumnId ?? task.columnId,
    start: async () => startKanbanTaskSession(system, task.id, params),
  });
}

async function startKanbanTaskSession(
  system: RoutaSystem,
  taskId: string,
  params: {
    expectedColumnId?: string;
    ignoreExistingTrigger?: boolean;
    mutateTask?: (task: NonNullable<Awaited<ReturnType<RoutaSystem["taskStore"]["get"]>>>) => void;
  },
): Promise<{ sessionId?: string | null; error?: string }> {
  const task = await system.taskStore.get(taskId);
  if (!task) return { error: "Task no longer exists." };
  if (params.expectedColumnId && task.columnId !== params.expectedColumnId) {
    return { error: `Task is no longer in column ${params.expectedColumnId}.` };
  }
  if (task.triggerSessionId && !params.ignoreExistingTrigger) {
    return { sessionId: task.triggerSessionId };
  }

  const nextTask = {
    ...task,
    updatedAt: new Date(),
  };
  params.mutateTask?.(nextTask);
  const board = await system.kanbanBoardStore.get(nextTask.boardId!);

  let preferredCodebase = (nextTask.codebaseIds?.length ?? 0) > 0
    ? await system.codebaseStore.get(nextTask.codebaseIds[0])
    : undefined;
  if (!preferredCodebase) {
    preferredCodebase = await system.codebaseStore.getDefault(nextTask.workspaceId);
  }

  let worktreeCwd = preferredCodebase?.repoPath ?? process.cwd();
  let worktreeBranch = preferredCodebase?.branch;
  if (params.expectedColumnId === "dev" && preferredCodebase && !nextTask.worktreeId) {
    try {
      const worktreeService = new GitWorktreeService(
        system.worktreeStore,
        system.codebaseStore,
      );
      const slugifiedTitle = nextTask.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);
      const branch = `issue/${nextTask.id.slice(0, 8)}-${slugifiedTitle}`;
      const label = `${nextTask.id.slice(0, 8)}-${slugifiedTitle}`;
      const workspace = await system.workspaceStore.get(nextTask.workspaceId);
      const worktreeRoot = workspace
        ? getEffectiveWorkspaceMetadata(workspace).worktreeRoot
        : getDefaultWorkspaceWorktreeRoot(nextTask.workspaceId);
      const worktree = await worktreeService.createWorktree(preferredCodebase.id, {
        branch,
        baseBranch: preferredCodebase.branch ?? "main",
        label,
        worktreeRoot,
      });
      nextTask.worktreeId = worktree.id;
      worktreeCwd = worktree.worktreePath;
      worktreeBranch = worktree.branch;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      nextTask.status = TaskStatus.BLOCKED;
      nextTask.columnId = "blocked";
      nextTask.lastSyncError = `Worktree creation failed: ${message}`;
      await system.taskStore.save(nextTask);
      return { error: nextTask.lastSyncError };
    }
  } else if (nextTask.worktreeId) {
    const existingWorktree = await system.worktreeStore.get(nextTask.worktreeId);
    if (existingWorktree?.worktreePath) {
      worktreeCwd = existingWorktree.worktreePath;
      worktreeBranch = existingWorktree.branch ?? worktreeBranch;
    }
  }

  const effectiveAutomation = resolveEffectiveTaskAutomation(nextTask, board?.columns ?? []);
  const taskForSession = {
    ...nextTask,
    assignedProvider: effectiveAutomation.providerId,
    assignedRole: effectiveAutomation.role,
    assignedSpecialistId: effectiveAutomation.specialistId,
    assignedSpecialistName: effectiveAutomation.specialistName,
  };

  const triggerResult = await triggerAssignedTaskAgent({
    origin: getInternalApiOrigin(),
    workspaceId: nextTask.workspaceId,
    cwd: worktreeCwd,
    branch: worktreeBranch,
    task: taskForSession,
    boardColumns: board?.columns ?? [],
    eventBus: system.eventBus,
  });

  if (triggerResult.sessionId) {
    nextTask.triggerSessionId = triggerResult.sessionId;
    // Track session in history
    if (!nextTask.sessionIds) nextTask.sessionIds = [];
    if (!nextTask.sessionIds.includes(triggerResult.sessionId)) {
      nextTask.sessionIds.push(triggerResult.sessionId);
    }
    const currentColumn = board?.columns.find((column) => column.id === nextTask.columnId);
    upsertTaskLaneSession(nextTask, {
      sessionId: triggerResult.sessionId,
      columnId: nextTask.columnId,
      columnName: currentColumn?.name,
      provider: effectiveAutomation.providerId,
      role: effectiveAutomation.role,
      specialistId: effectiveAutomation.specialistId,
      specialistName: effectiveAutomation.specialistName,
      status: "running",
    });
    nextTask.lastSyncError = undefined;
    if (nextTask.worktreeId) {
      await system.worktreeStore.assignSession(nextTask.worktreeId, triggerResult.sessionId);
    }
  } else if (triggerResult.error) {
    nextTask.lastSyncError = triggerResult.error;
  }

  await system.taskStore.save(nextTask);
  return {
    sessionId: triggerResult.sessionId ?? null,
    error: triggerResult.error,
  };
}

async function getBoardConcurrencyLimit(system: RoutaSystem, workspaceId: string, boardId: string): Promise<number> {
  const workspace = await system.workspaceStore.get(workspaceId);
  return getBoardSessionConcurrencyLimit(workspace?.metadata, boardId);
}

export function getKanbanSessionQueue(system: RoutaSystem): KanbanSessionQueue {
  const g = globalThis as Record<string, unknown>;
  let queue = g[QUEUE_KEY] as KanbanSessionQueue | undefined;

  if (queue && !queue.isCompatible(system.eventBus, system.taskStore)) {
    queue.stop();
    delete g[QUEUE_KEY];
    queue = undefined;
  }

  if (!queue) {
    queue = new KanbanSessionQueue(
      system.eventBus,
      system.taskStore,
      (workspaceId, boardId) => getBoardConcurrencyLimit(system, workspaceId, boardId),
    );
    g[QUEUE_KEY] = queue;
  }

  return queue;
}

/**
 * Get or create the global KanbanWorkflowOrchestrator instance.
 */
export function getWorkflowOrchestrator(system: RoutaSystem): KanbanWorkflowOrchestrator {
  const g = globalThis as Record<string, unknown>;
  let orchestrator = g[GLOBAL_KEY] as KanbanWorkflowOrchestrator | undefined;

  if (!orchestrator) {
    orchestrator = new KanbanWorkflowOrchestrator(
      system.eventBus,
      system.kanbanBoardStore,
      system.taskStore,
    );
    g[GLOBAL_KEY] = orchestrator;
  }

  return orchestrator;
}

/**
 * Start the workflow orchestrator singleton. Idempotent across HMR restarts.
 */
export function startWorkflowOrchestrator(system: RoutaSystem): void {
  const g = globalThis as Record<string, unknown>;
  const orchestrator = getWorkflowOrchestrator(system);
  const queue = getKanbanSessionQueue(system);
  orchestrator.setCreateSession((params) => createAutomationSession(system, params));
  orchestrator.setCleanupCardSession((cardId) => queue.removeCardJob(cardId));
  orchestrator.start();
  queue.start();
  g[STARTED_KEY] = true;
}

/**
 * Reset the orchestrator (for testing).
 */
export function resetWorkflowOrchestrator(): void {
  const g = globalThis as Record<string, unknown>;
  
  const orchestrator = g[GLOBAL_KEY] as KanbanWorkflowOrchestrator | undefined;
  if (orchestrator) {
    orchestrator.stop();
  }

  const queue = g[QUEUE_KEY] as KanbanSessionQueue | undefined;
  if (queue) {
    queue.stop();
  }
  
  delete g[GLOBAL_KEY];
  delete g[QUEUE_KEY];
  delete g[STARTED_KEY];
}
