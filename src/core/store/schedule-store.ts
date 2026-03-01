/**
 * ScheduleStore — persistence interface for cron schedule configurations.
 */

import type { Schedule, CreateScheduleInput } from "../models/schedule";

export interface ScheduleStore {
  /** Create and persist a new schedule. */
  create(input: CreateScheduleInput): Promise<Schedule>;

  /** Retrieve a single schedule by ID. */
  get(scheduleId: string): Promise<Schedule | undefined>;

  /** List all schedules for a workspace. */
  listByWorkspace(workspaceId: string): Promise<Schedule[]>;

  /** List all enabled schedules whose nextRunAt <= now (due for firing). */
  listDue(): Promise<Schedule[]>;

  /** Update an existing schedule (partial update). */
  update(scheduleId: string, fields: Partial<Pick<Schedule, "name" | "cronExpr" | "taskPrompt" | "agentId" | "enabled" | "promptTemplate" | "lastRunAt" | "nextRunAt" | "lastTaskId">>): Promise<void>;

  /** Enable or disable a schedule. */
  setEnabled(scheduleId: string, enabled: boolean): Promise<void>;

  /** Hard-delete a schedule. */
  delete(scheduleId: string): Promise<void>;
}

// ─── In-Memory Implementation (tests / no-DB mode) ──────────────────────

import { v4 as uuidv4 } from "uuid";

export class InMemoryScheduleStore implements ScheduleStore {
  private store = new Map<string, Schedule>();

  async create(input: CreateScheduleInput): Promise<Schedule> {
    const now = new Date();
    const schedule: Schedule = {
      id: input.id ?? uuidv4(),
      name: input.name,
      cronExpr: input.cronExpr,
      taskPrompt: input.taskPrompt,
      agentId: input.agentId,
      workspaceId: input.workspaceId,
      enabled: input.enabled !== false,
      promptTemplate: input.promptTemplate,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(schedule.id, schedule);
    return schedule;
  }

  async get(scheduleId: string): Promise<Schedule | undefined> {
    return this.store.get(scheduleId);
  }

  async listByWorkspace(workspaceId: string): Promise<Schedule[]> {
    return Array.from(this.store.values())
      .filter((s) => s.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listDue(): Promise<Schedule[]> {
    const now = new Date();
    return Array.from(this.store.values()).filter(
      (s) => s.enabled && s.nextRunAt && s.nextRunAt <= now
    );
  }

  async update(scheduleId: string, fields: Partial<Schedule>): Promise<void> {
    const existing = this.store.get(scheduleId);
    if (!existing) return;
    this.store.set(scheduleId, { ...existing, ...fields, updatedAt: new Date() });
  }

  async setEnabled(scheduleId: string, enabled: boolean): Promise<void> {
    await this.update(scheduleId, { enabled });
  }

  async delete(scheduleId: string): Promise<void> {
    this.store.delete(scheduleId);
  }
}
