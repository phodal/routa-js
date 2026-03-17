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

export enum TaskPriority {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  URGENT = "urgent",
}

export enum VerificationVerdict {
  APPROVED = "APPROVED",
  NOT_APPROVED = "NOT_APPROVED",
  BLOCKED = "BLOCKED",
}

export type TaskLaneSessionStatus =
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "transitioned";

export type TaskLaneHandoffRequestType =
  | "environment_preparation"
  | "runtime_context"
  | "clarification"
  | "rerun_command";

export type TaskLaneHandoffStatus =
  | "requested"
  | "delivered"
  | "completed"
  | "blocked"
  | "failed";

export interface TaskLaneSession {
  sessionId: string;
  routaAgentId?: string;
  columnId?: string;
  columnName?: string;
  provider?: string;
  role?: string;
  specialistId?: string;
  specialistName?: string;
  status: TaskLaneSessionStatus;
  startedAt: string;
  completedAt?: string;
}

export interface TaskLaneHandoff {
  id: string;
  fromSessionId: string;
  toSessionId: string;
  fromColumnId?: string;
  toColumnId?: string;
  requestType: TaskLaneHandoffRequestType;
  request: string;
  status: TaskLaneHandoffStatus;
  requestedAt: string;
  respondedAt?: string;
  responseSummary?: string;
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
  boardId?: string;
  columnId?: string;
  position: number;
  priority?: TaskPriority;
  labels: string[];
  assignee?: string;
  assignedProvider?: string;
  assignedRole?: string;
  assignedSpecialistId?: string;
  assignedSpecialistName?: string;
  triggerSessionId?: string;
  /** All session IDs that have been associated with this task (history) */
  sessionIds: string[];
  /** Durable per-lane session history for Kanban workflow handoff */
  laneSessions: TaskLaneSession[];
  /** Adjacent-lane handoff requests and responses */
  laneHandoffs: TaskLaneHandoff[];
  githubId?: string;
  githubNumber?: number;
  githubUrl?: string;
  githubRepo?: string;
  githubState?: string;
  githubSyncedAt?: Date;
  lastSyncError?: string;
  dependencies: string[];
  parallelGroup?: string;
  workspaceId: string;
  /** Session ID that created this task (for session-scoped filtering) */
  sessionId?: string;
  /** Associated codebase IDs for this task */
  codebaseIds: string[];
  /** Git worktree ID created for this task when it enters the dev column */
  worktreeId?: string;
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
  triggerSessionId?: string;
  sessionId?: string;
  scope?: string;
  acceptanceCriteria?: string[];
  verificationCommands?: string[];
  dependencies?: string[];
  parallelGroup?: string;
  boardId?: string;
  columnId?: string;
  position?: number;
  priority?: TaskPriority;
  labels?: string[];
  assignee?: string;
  assignedProvider?: string;
  assignedRole?: string;
  assignedSpecialistId?: string;
  assignedSpecialistName?: string;
  githubId?: string;
  githubNumber?: number;
  githubUrl?: string;
  githubRepo?: string;
  githubState?: string;
  githubSyncedAt?: Date;
  lastSyncError?: string;
  status?: TaskStatus;
  codebaseIds?: string[];
  worktreeId?: string;
}): Task {
  const now = new Date();
  return {
    id: params.id,
    title: params.title,
    objective: params.objective,
    scope: params.scope,
    acceptanceCriteria: params.acceptanceCriteria,
    verificationCommands: params.verificationCommands,
    status: params.status ?? TaskStatus.PENDING,
    boardId: params.boardId,
    columnId: params.columnId,
    position: params.position ?? 0,
    priority: params.priority,
    labels: params.labels ?? [],
    assignee: params.assignee,
    assignedProvider: params.assignedProvider,
    assignedRole: params.assignedRole,
    assignedSpecialistId: params.assignedSpecialistId,
    assignedSpecialistName: params.assignedSpecialistName,
    sessionIds: [],
    laneSessions: [],
    laneHandoffs: [],
    githubId: params.githubId,
    githubNumber: params.githubNumber,
    githubUrl: params.githubUrl,
    githubRepo: params.githubRepo,
    githubState: params.githubState,
    githubSyncedAt: params.githubSyncedAt,
    lastSyncError: params.lastSyncError,
    dependencies: params.dependencies ?? [],
    parallelGroup: params.parallelGroup,
    workspaceId: params.workspaceId,
    sessionId: params.sessionId,
    codebaseIds: params.codebaseIds ?? [],
    worktreeId: params.worktreeId,
    triggerSessionId: params.triggerSessionId,
    createdAt: now,
    updatedAt: now,
  };
}
