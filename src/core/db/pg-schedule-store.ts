/**
 * PgScheduleStore — Postgres-backed implementation of ScheduleStore.
 */

import { eq, and, lte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Database } from "./index";
import { schedules } from "./schema";
import type { Schedule, CreateScheduleInput } from "../models/schedule";
import type { ScheduleStore } from "../store/schedule-store";

export class PgScheduleStore implements ScheduleStore {
  constructor(private db: Database) {}

  async create(input: CreateScheduleInput): Promise<Schedule> {
    const now = new Date();
    const id = input.id ?? uuidv4();

    const row = {
      id,
      name: input.name,
      cronExpr: input.cronExpr,
      taskPrompt: input.taskPrompt,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      enabled: input.enabled !== false,
      promptTemplate: input.promptTemplate ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(schedules).values(row);

    return this.toModel({
      ...row,
      lastRunAt: null,
      nextRunAt: null,
      lastTaskId: null,
    });
  }

  async get(scheduleId: string): Promise<Schedule | undefined> {
    const rows = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Schedule[]> {
    const rows = await this.db
      .select()
      .from(schedules)
      .where(eq(schedules.workspaceId, workspaceId));
    return rows.map(this.toModel.bind(this));
  }

  async listDue(): Promise<Schedule[]> {
    const now = new Date();
    const rows = await this.db
      .select()
      .from(schedules)
      .where(
        and(
          eq(schedules.enabled, true),
          lte(schedules.nextRunAt, now)
        )
      );
    return rows.map(this.toModel.bind(this));
  }

  async update(
    scheduleId: string,
    fields: Partial<Pick<Schedule, "name" | "cronExpr" | "taskPrompt" | "agentId" | "enabled" | "promptTemplate" | "lastRunAt" | "nextRunAt" | "lastTaskId">>
  ): Promise<void> {
    await this.db
      .update(schedules)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId));
  }

  async setEnabled(scheduleId: string, enabled: boolean): Promise<void> {
    await this.db
      .update(schedules)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(schedules.id, scheduleId));
  }

  async delete(scheduleId: string): Promise<void> {
    await this.db.delete(schedules).where(eq(schedules.id, scheduleId));
  }

  private toModel(row: typeof schedules.$inferSelect): Schedule {
    return {
      id: row.id,
      name: row.name,
      cronExpr: row.cronExpr,
      taskPrompt: row.taskPrompt,
      agentId: row.agentId,
      workspaceId: row.workspaceId,
      enabled: row.enabled,
      lastRunAt: row.lastRunAt ?? undefined,
      nextRunAt: row.nextRunAt ?? undefined,
      lastTaskId: row.lastTaskId ?? undefined,
      promptTemplate: row.promptTemplate ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
