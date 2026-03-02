/**
 * WorkflowRunStore — persistence layer for workflow run state.
 */

import { v4 as uuidv4 } from "uuid";
import type { WorkflowRun, WorkflowRunStatus, CreateWorkflowRunInput } from "./workflow-types";

export interface WorkflowRunStore {
  /** Create a new workflow run. */
  create(input: CreateWorkflowRunInput): Promise<WorkflowRun>;

  /** Get a workflow run by ID. */
  get(runId: string): Promise<WorkflowRun | undefined>;

  /** List workflow runs by workspace, newest first. */
  listByWorkspace(workspaceId: string): Promise<WorkflowRun[]>;

  /** List workflow runs by status. */
  listByStatus(status: WorkflowRunStatus): Promise<WorkflowRun[]>;

  /** Update workflow run status. */
  updateStatus(
    runId: string,
    status: WorkflowRunStatus,
    opts?: {
      currentStepName?: string;
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void>;

  /** Update step output and increment completed steps. */
  updateStepOutput(runId: string, stepName: string, output: string): Promise<void>;

  /** Delete a workflow run. */
  delete(runId: string): Promise<void>;
}

// ─── In-Memory Implementation ───────────────────────────────────────────────

export class InMemoryWorkflowRunStore implements WorkflowRunStore {
  private runs = new Map<string, WorkflowRun>();

  async create(input: CreateWorkflowRunInput): Promise<WorkflowRun> {
    const now = new Date();
    const run: WorkflowRun = {
      id: uuidv4(),
      workflowId: input.workflowId,
      workflowName: input.workflowName,
      workflowVersion: input.workflowVersion,
      workspaceId: input.workspaceId,
      status: "PENDING",
      triggerPayload: input.triggerPayload,
      triggerSource: input.triggerSource,
      stepOutputs: {},
      totalSteps: input.totalSteps,
      completedSteps: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async get(runId: string): Promise<WorkflowRun | undefined> {
    return this.runs.get(runId);
  }

  async listByWorkspace(workspaceId: string): Promise<WorkflowRun[]> {
    return Array.from(this.runs.values())
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listByStatus(status: WorkflowRunStatus): Promise<WorkflowRun[]> {
    return Array.from(this.runs.values()).filter((r) => r.status === status);
  }

  async updateStatus(
    runId: string,
    status: WorkflowRunStatus,
    opts?: {
      currentStepName?: string;
      errorMessage?: string;
      startedAt?: Date;
      completedAt?: Date;
    }
  ): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    this.runs.set(runId, {
      ...run,
      status,
      currentStepName: opts?.currentStepName ?? run.currentStepName,
      errorMessage: opts?.errorMessage ?? run.errorMessage,
      startedAt: opts?.startedAt ?? run.startedAt,
      completedAt: opts?.completedAt ?? run.completedAt,
      updatedAt: new Date(),
    });
  }

  async updateStepOutput(runId: string, stepName: string, output: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;

    const stepOutputs = { ...run.stepOutputs, [stepName]: output };
    this.runs.set(runId, {
      ...run,
      stepOutputs,
      completedSteps: run.completedSteps + 1,
      updatedAt: new Date(),
    });
  }

  async delete(runId: string): Promise<void> {
    this.runs.delete(runId);
  }
}

