/**
 * WorkflowExecutor — executes a workflow by creating background tasks for each step.
 *
 * Each step becomes a BackgroundTask with:
 * - triggerSource: "workflow"
 * - workflowRunId: links to the parent WorkflowRun
 * - workflowStepName: name of the step
 * - dependsOnTaskIds: IDs of tasks this step depends on
 *
 * The BackgroundWorker will automatically dispatch tasks when dependencies are completed.
 */

import { v4 as uuidv4 } from "uuid";
import type { WorkflowDefinition, WorkflowStep } from "./workflow-types";
import type { WorkflowRunStore } from "./workflow-store";
import type { BackgroundTaskStore } from "../store/background-task-store";
import type { BackgroundTask } from "../models/background-task";
import { createBackgroundTask } from "../models/background-task";

export interface WorkflowExecutorDeps {
  workflowRunStore: WorkflowRunStore;
  backgroundTaskStore: BackgroundTaskStore;
}

export interface TriggerWorkflowInput {
  workflowId: string;
  definition: WorkflowDefinition;
  workspaceId: string;
  triggerPayload?: string;
  triggerSource?: "manual" | "webhook" | "schedule";
}

export interface TriggerWorkflowResult {
  workflowRunId: string;
  taskIds: string[];
}

export class WorkflowExecutor {
  constructor(private deps: WorkflowExecutorDeps) {}

  /**
   * Trigger a workflow execution.
   * Creates a WorkflowRun and BackgroundTasks for each step.
   */
  async trigger(input: TriggerWorkflowInput): Promise<TriggerWorkflowResult> {
    const { workflowId, definition, workspaceId, triggerPayload, triggerSource = "manual" } = input;

    // 1. Create WorkflowRun
    const run = await this.deps.workflowRunStore.create({
      workflowId,
      workflowName: definition.name,
      workflowVersion: definition.version,
      workspaceId,
      triggerPayload,
      triggerSource,
      totalSteps: definition.steps.length,
    });

    // 2. Build step dependency graph
    const stepTasks = new Map<string, string>(); // stepName -> taskId
    const taskIds: string[] = [];

    // Group steps by parallel_group
    const stepGroups = this.groupStepsByParallel(definition.steps);

    for (const group of stepGroups) {
      // Calculate dependencies for this group
      // All steps in a group depend on all tasks from previous groups
      const previousTaskIds = Array.from(stepTasks.values());

      // Create tasks for all steps in this group
      const groupTaskIds: string[] = [];
      for (const step of group) {
        const taskId = await this.createStepTask({
          step,
          definition,
          workflowRunId: run.id,
          workspaceId,
          triggerPayload,
          dependsOnTaskIds: previousTaskIds,
        });
        stepTasks.set(step.name, taskId);
        groupTaskIds.push(taskId);
        taskIds.push(taskId);
      }
    }

    // 3. Mark workflow as RUNNING
    await this.deps.workflowRunStore.updateStatus(run.id, "RUNNING", {
      startedAt: new Date(),
      currentStepName: definition.steps[0]?.name,
    });

    return { workflowRunId: run.id, taskIds };
  }

  /**
   * Group steps by parallel_group.
   * Steps without a parallel_group each form their own group.
   */
  private groupStepsByParallel(steps: WorkflowStep[]): WorkflowStep[][] {
    const groups: WorkflowStep[][] = [];
    let currentGroup: WorkflowStep[] = [];
    let currentParallelGroup: string | undefined;

    for (const step of steps) {
      if (step.parallel_group) {
        if (step.parallel_group === currentParallelGroup) {
          currentGroup.push(step);
        } else {
          if (currentGroup.length > 0) groups.push(currentGroup);
          currentGroup = [step];
          currentParallelGroup = step.parallel_group;
        }
      } else {
        if (currentGroup.length > 0) groups.push(currentGroup);
        groups.push([step]);
        currentGroup = [];
        currentParallelGroup = undefined;
      }
    }
    if (currentGroup.length > 0) groups.push(currentGroup);

    return groups;
  }

  private async createStepTask(params: {
    step: WorkflowStep;
    definition: WorkflowDefinition;
    workflowRunId: string;
    workspaceId: string;
    triggerPayload?: string;
    dependsOnTaskIds: string[];
  }): Promise<string> {
    const { step, definition, workflowRunId, workspaceId, triggerPayload, dependsOnTaskIds } = params;

    // Build prompt from step input with variable substitution
    const prompt = this.buildStepPrompt(step, definition, triggerPayload);

    const task = createBackgroundTask({
      title: `[${definition.name}] ${step.name}`,
      prompt,
      agentId: step.specialist,
      workspaceId,
      triggerSource: "workflow",
      triggeredBy: `workflow:${definition.name}`,
      workflowRunId,
      workflowStepName: step.name,
      dependsOnTaskIds: dependsOnTaskIds.length > 0 ? dependsOnTaskIds : undefined,
    });

    await this.deps.backgroundTaskStore.save(task);
    return task.id;
  }

  private buildStepPrompt(step: WorkflowStep, definition: WorkflowDefinition, triggerPayload?: string): string {
    let prompt = step.input ?? "";
    // Simple variable substitution
    prompt = prompt.replace(/\$\{trigger\.payload\}/g, triggerPayload ?? "");
    for (const [key, value] of Object.entries(definition.variables ?? {})) {
      prompt = prompt.replace(new RegExp(`\\$\\{variables\\.${key}\\}`, "g"), value);
      prompt = prompt.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    }
    return prompt || `Execute step: ${step.name}`;
  }
}

