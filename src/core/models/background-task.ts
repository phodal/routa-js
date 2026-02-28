/**
 * BackgroundTask — a persisted, asynchronous agent execution job.
 *
 * Unlike the orchestrator `Task` (which represents a sub-task assigned to an
 * agent inside a session), a BackgroundTask represents the *job* of firing up
 * a full ACP session in the background, decoupled from the user's browser
 * session.
 *
 * Status lifecycle:
 *   PENDING → RUNNING → COMPLETED | FAILED | CANCELLED
 */

export type BackgroundTaskStatus =
  | "PENDING"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

/**
 * What triggered this background task.
 * - "manual"    — user dispatched it from the UI
 * - "schedule"  — fired by a cron schedule (future)
 * - "webhook"   — fired by an inbound webhook event (future)
 * - "fleet"     — part of a multi-repo fleet dispatch (future)
 */
export type BackgroundTaskTriggerSource =
  | "manual"
  | "schedule"
  | "webhook"
  | "fleet";

export interface BackgroundTask {
  id: string;
  /** Human-readable title derived from the first 60 chars of the prompt */
  title: string;
  /** Full prompt to send to the agent */
  prompt: string;
  /** ACP agent / provider ID to use (e.g. "claude-code", "opencode") */
  agentId: string;
  /** Workspace the task belongs to */
  workspaceId: string;
  /** Current execution status */
  status: BackgroundTaskStatus;
  /**
   * Who/what triggered this task.
   * Stored as "manual" for UI-dispatched tasks.
   */
  triggeredBy: string;
  /** High-level source category */
  triggerSource: BackgroundTaskTriggerSource;
  /** ACP session ID created when the task starts running */
  resultSessionId?: string;
  /** Error message when status === "FAILED" */
  errorMessage?: string;
  /** Number of times execution has been attempted (for future retry logic) */
  attempts: number;
  /** Maximum number of attempts before marking as FAILED */
  maxAttempts: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
}

/**
 * Minimal data required to enqueue a new background task.
 */
export interface CreateBackgroundTaskInput {
  id?: string;
  title?: string;
  prompt: string;
  agentId: string;
  workspaceId: string;
  triggeredBy?: string;
  triggerSource?: BackgroundTaskTriggerSource;
  maxAttempts?: number;
}

export function createBackgroundTask(
  input: CreateBackgroundTaskInput
): BackgroundTask {
  const now = new Date();
  const title = input.title ?? input.prompt.slice(0, 60).replace(/\n/g, " ");
  return {
    id: input.id ?? crypto.randomUUID(),
    title,
    prompt: input.prompt,
    agentId: input.agentId,
    workspaceId: input.workspaceId,
    status: "PENDING",
    triggeredBy: input.triggeredBy ?? "user",
    triggerSource: input.triggerSource ?? "manual",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 1,
    createdAt: now,
    updatedAt: now,
  };
}
