/**
 * Schedule — a persisted cron-based agent trigger.
 *
 * When a schedule fires, it creates a BackgroundTask which runs the
 * configured ACP agent with the specified prompt.
 */

export interface Schedule {
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression (standard 5-field: min hour dom mon dow) */
  cronExpr: string;
  /** Prompt to dispatch to the agent when the schedule fires */
  taskPrompt: string;
  /** ACP agent / provider ID (e.g. "claude-code", "opencode") */
  agentId: string;
  /** Workspace the schedule belongs to */
  workspaceId: string;
  /** Whether this schedule is active */
  enabled: boolean;
  /** Timestamp of the last successful trigger */
  lastRunAt?: Date;
  /** Computed next trigger time */
  nextRunAt?: Date;
  /** Background task ID from the most recent trigger */
  lastTaskId?: string;
  /** Optional prompt template override (supports {timestamp}, {cronExpr}) */
  promptTemplate?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input required to create a new schedule.
 */
export interface CreateScheduleInput {
  id?: string;
  name: string;
  cronExpr: string;
  taskPrompt: string;
  agentId: string;
  workspaceId: string;
  enabled?: boolean;
  promptTemplate?: string;
}

/**
 * Build the prompt text from a schedule, substituting template variables.
 */
export function resolveSchedulePrompt(schedule: Schedule): string {
  const template = schedule.promptTemplate?.trim() || schedule.taskPrompt;
  return template
    .replace(/\{timestamp\}/g, new Date().toISOString())
    .replace(/\{cronExpr\}/g, schedule.cronExpr)
    .replace(/\{scheduleName\}/g, schedule.name);
}
