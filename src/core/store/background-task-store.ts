/**
 * BackgroundTaskStore — persistence interface for background task queue.
 */

import type {
  BackgroundTask,
  BackgroundTaskStatus,
} from "../models/background-task";

export interface BackgroundTaskStore {
  /** Persist a new task (insert) or update an existing one (upsert). */
  save(task: BackgroundTask): Promise<void>;

  /** Retrieve a single task by ID. */
  get(taskId: string): Promise<BackgroundTask | undefined>;

  /** List all tasks for a workspace, newest first. */
  listByWorkspace(workspaceId: string): Promise<BackgroundTask[]>;

  /** List all PENDING tasks across all workspaces (used by the worker). */
  listPending(): Promise<BackgroundTask[]>;

  /** List all RUNNING tasks with resultSessionId (for completion checking). */
  listRunning(): Promise<BackgroundTask[]>;

  /** List orphaned tasks: RUNNING but no resultSessionId and startedAt > threshold. */
  listOrphaned(thresholdMinutes?: number): Promise<BackgroundTask[]>;

  /** List tasks by status within a workspace. */
  listByStatus(
    workspaceId: string,
    status: BackgroundTaskStatus
  ): Promise<BackgroundTask[]>;

  /** Update the status (and optionally resultSessionId / errorMessage). */
  updateStatus(
    taskId: string,
    status: BackgroundTaskStatus,
    opts?: {
      resultSessionId?: string;
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void>;

  /** Update progress fields from ACP session notifications. */
  updateProgress(
    taskId: string,
    progress: {
      lastActivity?: Date;
      currentActivity?: string;
      toolCallCount?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  ): Promise<void>;

  /** Find task by session ID. */
  findBySessionId(sessionId: string): Promise<BackgroundTask | undefined>;

  /** Delete a task by ID (hard delete). */
  delete(taskId: string): Promise<void>;
}

// ─── In-Memory Implementation (tests / no-DB mode) ──────────────────────

export class InMemoryBackgroundTaskStore implements BackgroundTaskStore {
  private tasks = new Map<string, BackgroundTask>();

  async save(task: BackgroundTask): Promise<void> {
    this.tasks.set(task.id, { ...task });
  }

  async get(taskId: string): Promise<BackgroundTask | undefined> {
    const t = this.tasks.get(taskId);
    return t ? { ...t } : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<BackgroundTask[]> {
    return [...this.tasks.values()]
      .filter((t) => t.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listPending(): Promise<BackgroundTask[]> {
    const priorityOrder = { HIGH: 0, NORMAL: 1, LOW: 2 };
    return [...this.tasks.values()]
      .filter((t) => t.status === "PENDING")
      .sort((a, b) => {
        // Sort by priority first (HIGH > NORMAL > LOW)
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        // Then by createdAt (oldest first)
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }

  async listRunning(): Promise<BackgroundTask[]> {
    return [...this.tasks.values()]
      .filter((t) => t.status === "RUNNING" && t.resultSessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listOrphaned(thresholdMinutes = 5): Promise<BackgroundTask[]> {
    const thresholdMs = thresholdMinutes * 60 * 1000;
    const now = Date.now();
    return [...this.tasks.values()]
      .filter((t) => {
        if (t.status !== "RUNNING" || t.resultSessionId) return false;
        const startedAt = t.startedAt?.getTime() ?? t.createdAt.getTime();
        return now - startedAt > thresholdMs;
      })
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByStatus(
    workspaceId: string,
    status: BackgroundTaskStatus
  ): Promise<BackgroundTask[]> {
    const filtered = [...this.tasks.values()].filter(
      (t) => t.workspaceId === workspaceId && t.status === status
    );

    // For PENDING tasks, sort by priority first, then by createdAt
    if (status === "PENDING") {
      const priorityOrder = { HIGH: 0, NORMAL: 1, LOW: 2 };
      return filtered.sort((a, b) => {
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
    }

    // For other statuses, sort by createdAt (newest first)
    return filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateStatus(
    taskId: string,
    status: BackgroundTaskStatus,
    opts?: {
      resultSessionId?: string;
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void> {
    const t = this.tasks.get(taskId);
    if (!t) return;
    this.tasks.set(taskId, {
      ...t,
      status,
      resultSessionId: opts?.resultSessionId ?? t.resultSessionId,
      errorMessage: opts?.errorMessage ?? t.errorMessage,
      startedAt: opts?.startedAt ?? t.startedAt,
      completedAt: opts?.completedAt ?? t.completedAt,
      updatedAt: new Date(),
    });
  }

  async updateProgress(
    taskId: string,
    progress: {
      lastActivity?: Date;
      currentActivity?: string;
      toolCallCount?: number;
      inputTokens?: number;
      outputTokens?: number;
    }
  ): Promise<void> {
    const t = this.tasks.get(taskId);
    if (!t) return;
    this.tasks.set(taskId, {
      ...t,
      lastActivity: progress.lastActivity ?? t.lastActivity,
      currentActivity: progress.currentActivity ?? t.currentActivity,
      toolCallCount: progress.toolCallCount ?? t.toolCallCount,
      inputTokens: progress.inputTokens ?? t.inputTokens,
      outputTokens: progress.outputTokens ?? t.outputTokens,
      updatedAt: new Date(),
    });
  }

  async findBySessionId(sessionId: string): Promise<BackgroundTask | undefined> {
    for (const t of this.tasks.values()) {
      if (t.resultSessionId === sessionId) return { ...t };
    }
    return undefined;
  }

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }
}
