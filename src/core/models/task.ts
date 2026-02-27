/**
 * Task model - port of routa-core Task.kt
 *
 * Represents a unit of work within the multi-agent system.
 */

export enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  REVIEW_REQUIRED = "REVIEW_REQUIRED",
  COMPLETED = "COMPLETED",
  NEEDS_FIX = "NEEDS_FIX",
  BLOCKED = "BLOCKED",
  CANCELLED = "CANCELLED",
}

export enum VerificationVerdict {
  APPROVED = "APPROVED",
  NOT_APPROVED = "NOT_APPROVED",
  BLOCKED = "BLOCKED",
}

export interface Task {
  id: string;
  title: string;
  objective: string;
  scope?: string;
  acceptanceCriteria?: string[];
  verificationCommands?: string[];
  assignedTo?: string;
  status: TaskStatus;
  dependencies: string[];
  parallelGroup?: string;
  workspaceId: string;
  /** Session ID that created this task (for session-scoped filtering) */
  sessionId?: string;
  createdAt: Date;
  updatedAt: Date;
  completionSummary?: string;
  verificationVerdict?: VerificationVerdict;
  verificationReport?: string;
}

export function createTask(params: {
  id: string;
  title: string;
  objective: string;
  workspaceId: string;
  sessionId?: string;
  scope?: string;
  acceptanceCriteria?: string[];
  verificationCommands?: string[];
  dependencies?: string[];
  parallelGroup?: string;
}): Task {
  const now = new Date();
  return {
    id: params.id,
    title: params.title,
    objective: params.objective,
    scope: params.scope,
    acceptanceCriteria: params.acceptanceCriteria,
    verificationCommands: params.verificationCommands,
    status: TaskStatus.PENDING,
    dependencies: params.dependencies ?? [],
    parallelGroup: params.parallelGroup,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    createdAt: now,
    updatedAt: now,
  };
}
