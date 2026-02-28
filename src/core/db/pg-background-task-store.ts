/**
 * PgBackgroundTaskStore — Postgres-backed implementation of BackgroundTaskStore.
 */

import { eq, and, asc, desc } from "drizzle-orm";
import type { Database } from "./index";
import { backgroundTasks } from "./schema";
import type { BackgroundTask, BackgroundTaskStatus } from "../models/background-task";
import type { BackgroundTaskStore } from "../store/background-task-store";

export class PgBackgroundTaskStore implements BackgroundTaskStore {
  constructor(private db: Database) {}

  async save(task: BackgroundTask): Promise<void> {
    await this.db
      .insert(backgroundTasks)
      .values({
        id: task.id,
        title: task.title,
        prompt: task.prompt,
        agentId: task.agentId,
        workspaceId: task.workspaceId,
        status: task.status,
        triggeredBy: task.triggeredBy,
        triggerSource: task.triggerSource,
        resultSessionId: task.resultSessionId,
        errorMessage: task.errorMessage,
        attempts: task.attempts,
        maxAttempts: task.maxAttempts,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })
      .onConflictDoUpdate({
        target: backgroundTasks.id,
        set: {
          title: task.title,
          prompt: task.prompt,
          agentId: task.agentId,
          status: task.status,
          triggeredBy: task.triggeredBy,
          triggerSource: task.triggerSource,
          resultSessionId: task.resultSessionId,
          errorMessage: task.errorMessage,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          updatedAt: new Date(),
        },
      });
  }

  async get(taskId: string): Promise<BackgroundTask | undefined> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<BackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.workspaceId, workspaceId))
      .orderBy(desc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
  }

  async listPending(): Promise<BackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.status, "PENDING"))
      .orderBy(asc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
  }

  async listByStatus(
    workspaceId: string,
    status: BackgroundTaskStatus
  ): Promise<BackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.workspaceId, workspaceId),
          eq(backgroundTasks.status, status)
        )
      )
      .orderBy(desc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
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
    await this.db
      .update(backgroundTasks)
      .set({
        status,
        resultSessionId: opts?.resultSessionId,
        errorMessage: opts?.errorMessage,
        startedAt: opts?.startedAt,
        completedAt: opts?.completedAt,
        updatedAt: new Date(),
      })
      .where(eq(backgroundTasks.id, taskId));
  }

  async delete(taskId: string): Promise<void> {
    await this.db
      .delete(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId));
  }

  private toModel(row: typeof backgroundTasks.$inferSelect): BackgroundTask {
    return {
      id: row.id,
      title: row.title,
      prompt: row.prompt,
      agentId: row.agentId,
      workspaceId: row.workspaceId,
      status: row.status as BackgroundTaskStatus,
      triggeredBy: row.triggeredBy,
      triggerSource: row.triggerSource as BackgroundTask["triggerSource"],
      resultSessionId: row.resultSessionId ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      startedAt: row.startedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
