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
    return [...this.tasks.values()]
      .filter((t) => t.status === "PENDING")
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listRunning(): Promise<BackgroundTask[]> {
    return [...this.tasks.values()]
      .filter((t) => t.status === "RUNNING" && t.resultSessionId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async listByStatus(
    workspaceId: string,
    status: BackgroundTaskStatus
  ): Promise<BackgroundTask[]> {
    return [...this.tasks.values()]
      .filter((t) => t.workspaceId === workspaceId && t.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  async delete(taskId: string): Promise<void> {
    this.tasks.delete(taskId);
  }
}
