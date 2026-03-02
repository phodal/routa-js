/**
 * PgBackgroundTaskStore — Postgres-backed implementation of BackgroundTaskStore.
 */

import { eq, and, asc, desc, isNotNull, isNull, lt, sql } from "drizzle-orm";
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
        priority: task.priority,
        resultSessionId: task.resultSessionId,
        errorMessage: task.errorMessage,
        attempts: task.attempts,
        maxAttempts: task.maxAttempts,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        lastActivity: task.lastActivity,
        currentActivity: task.currentActivity,
        toolCallCount: task.toolCallCount ?? 0,
        inputTokens: task.inputTokens ?? 0,
        outputTokens: task.outputTokens ?? 0,
        // Workflow orchestration fields
        workflowRunId: task.workflowRunId,
        workflowStepName: task.workflowStepName,
        dependsOnTaskIds: task.dependsOnTaskIds,
        taskOutput: task.taskOutput,
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
          lastActivity: task.lastActivity,
          currentActivity: task.currentActivity,
          toolCallCount: task.toolCallCount ?? 0,
          inputTokens: task.inputTokens ?? 0,
          outputTokens: task.outputTokens ?? 0,
          // Workflow orchestration fields
          workflowRunId: task.workflowRunId,
          workflowStepName: task.workflowStepName,
          dependsOnTaskIds: task.dependsOnTaskIds,
          taskOutput: task.taskOutput,
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
      .orderBy(
        // Sort by priority first (HIGH=0, NORMAL=1, LOW=2) - ascending order
        asc(sql`CASE ${backgroundTasks.priority} WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END`),
        // Then by createdAt (oldest first)
        asc(backgroundTasks.createdAt)
      );
    return rows.map(this.toModel.bind(this));
  }

  async listRunning(): Promise<BackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.status, "RUNNING"),
          // Only tasks with a session assigned
          isNotNull(backgroundTasks.resultSessionId)
        )
      )
      .orderBy(asc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
  }

  async listOrphaned(thresholdMinutes = 5): Promise<BackgroundTask[]> {
    const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.status, "RUNNING"),
          isNull(backgroundTasks.resultSessionId),
          lt(backgroundTasks.startedAt, threshold)
        )
      )
      .orderBy(asc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
  }

  async listByStatus(
    workspaceId: string,
    status: BackgroundTaskStatus
  ): Promise<BackgroundTask[]> {
    const query = this.db
      .select()
      .from(backgroundTasks)
      .where(
        and(
          eq(backgroundTasks.workspaceId, workspaceId),
          eq(backgroundTasks.status, status)
        )
      );

    // For PENDING tasks, sort by priority first, then by createdAt
    if (status === "PENDING") {
      const rows = await query.orderBy(
        asc(sql`CASE ${backgroundTasks.priority} WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END`),
        asc(backgroundTasks.createdAt)
      );
      return rows.map(this.toModel.bind(this));
    }

    // For other statuses, sort by createdAt (newest first)
    const rows = await query.orderBy(desc(backgroundTasks.createdAt));
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
    await this.db
      .update(backgroundTasks)
      .set({
        lastActivity: progress.lastActivity,
        currentActivity: progress.currentActivity,
        toolCallCount: progress.toolCallCount,
        inputTokens: progress.inputTokens,
        outputTokens: progress.outputTokens,
        updatedAt: new Date(),
      })
      .where(eq(backgroundTasks.id, taskId));
  }

  async findBySessionId(sessionId: string): Promise<BackgroundTask | undefined> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.resultSessionId, sessionId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async delete(taskId: string): Promise<void> {
    await this.db
      .delete(backgroundTasks)
      .where(eq(backgroundTasks.id, taskId));
  }

  // ─── Workflow orchestration methods ────────────────────────────────────────

  async listByWorkflowRunId(workflowRunId: string): Promise<BackgroundTask[]> {
    const rows = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.workflowRunId, workflowRunId))
      .orderBy(asc(backgroundTasks.createdAt));
    return rows.map(this.toModel.bind(this));
  }

  async listReadyToRun(): Promise<BackgroundTask[]> {
    // Get all PENDING tasks
    const pending = await this.db
      .select()
      .from(backgroundTasks)
      .where(eq(backgroundTasks.status, "PENDING"))
      .orderBy(
        asc(sql`CASE ${backgroundTasks.priority} WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END`),
        asc(backgroundTasks.createdAt)
      );

    // Filter to tasks whose dependencies are all COMPLETED
    const ready: BackgroundTask[] = [];
    for (const row of pending) {
      const task = this.toModel(row);
      if (!task.dependsOnTaskIds || task.dependsOnTaskIds.length === 0) {
        ready.push(task);
        continue;
      }
      // Check all dependencies
      const deps = await this.db
        .select()
        .from(backgroundTasks)
        .where(sql`${backgroundTasks.id} = ANY(${task.dependsOnTaskIds})`);
      const allCompleted = deps.every((d) => d.status === "COMPLETED");
      if (allCompleted) {
        ready.push(task);
      }
    }
    return ready;
  }

  async updateTaskOutput(taskId: string, output: string): Promise<void> {
    await this.db
      .update(backgroundTasks)
      .set({
        taskOutput: output,
        updatedAt: new Date(),
      })
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
      priority: row.priority as BackgroundTask["priority"],
      resultSessionId: row.resultSessionId ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      attempts: row.attempts,
      maxAttempts: row.maxAttempts,
      startedAt: row.startedAt ?? undefined,
      completedAt: row.completedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastActivity: row.lastActivity ?? undefined,
      currentActivity: row.currentActivity ?? undefined,
      toolCallCount: row.toolCallCount ?? undefined,
      inputTokens: row.inputTokens ?? undefined,
      outputTokens: row.outputTokens ?? undefined,
      // Workflow orchestration fields
      workflowRunId: row.workflowRunId ?? undefined,
      workflowStepName: row.workflowStepName ?? undefined,
      dependsOnTaskIds: row.dependsOnTaskIds ?? undefined,
      taskOutput: row.taskOutput ?? undefined,
    };
  }
}
