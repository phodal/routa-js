/**
 * Unit tests for WorkflowExecutor
 *
 * Tests task creation from workflow steps, dependency chains,
 * and variable substitution.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { WorkflowExecutor } from "../workflow-executor";
import { InMemoryWorkflowRunStore } from "../workflow-store";
import { InMemoryBackgroundTaskStore } from "@/core/store/background-task-store";
import type { WorkflowDefinition } from "../workflow-types";

describe("WorkflowExecutor", () => {
  let executor: WorkflowExecutor;
  let workflowStore: InMemoryWorkflowRunStore;
  let taskStore: InMemoryBackgroundTaskStore;

  const minimalWorkflow: WorkflowDefinition = {
    name: "Test Flow",
    steps: [
      { name: "Step 1", specialist: "developer" },
    ],
  };

  const multiStepWorkflow: WorkflowDefinition = {
    name: "Multi-Step Flow",
    steps: [
      { name: "Analyze", specialist: "analyzer", output_key: "analysis" },
      { name: "Implement", specialist: "developer", input: "${steps.Analyze.output}" },
      { name: "Review", specialist: "reviewer" },
    ],
  };

  const parallelWorkflow: WorkflowDefinition = {
    name: "Parallel Flow",
    steps: [
      { name: "Setup", specialist: "developer" },
      { name: "Test A", specialist: "tester", parallel_group: "tests" },
      { name: "Test B", specialist: "tester", parallel_group: "tests" },
      { name: "Deploy", specialist: "devops" },
    ],
  };

  beforeEach(() => {
    workflowStore = new InMemoryWorkflowRunStore();
    taskStore = new InMemoryBackgroundTaskStore();
    executor = new WorkflowExecutor({
      workflowRunStore: workflowStore,
      backgroundTaskStore: taskStore,
    });
  });

  describe("trigger", () => {
    it("should create a WorkflowRun when triggered", async () => {
      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: minimalWorkflow,
        workspaceId: "ws-1",
      });

      const run = await workflowStore.get(result.workflowRunId);
      expect(run).toBeDefined();
      expect(run!.workflowName).toBe("Test Flow");
      expect(run!.workspaceId).toBe("ws-1");
      expect(run!.status).toBe("RUNNING"); // Set to RUNNING after task creation
    });

    it("should create BackgroundTasks for each step", async () => {
      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: multiStepWorkflow,
        workspaceId: "ws-1",
      });

      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.workflowStepName).sort()).toEqual(["Analyze", "Implement", "Review"]);
    });

    it("should set up dependency chain for sequential steps", async () => {
      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: multiStepWorkflow,
        workspaceId: "ws-1",
      });

      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);
      const analyzeTask = tasks.find(t => t.workflowStepName === "Analyze")!;
      const implementTask = tasks.find(t => t.workflowStepName === "Implement")!;
      const reviewTask = tasks.find(t => t.workflowStepName === "Review")!;

      // First task has no dependencies (empty array or undefined)
      expect(analyzeTask.dependsOnTaskIds ?? []).toEqual([]);
      // Second depends on first
      expect(implementTask.dependsOnTaskIds).toContain(analyzeTask.id);
      // Third depends on second
      expect(reviewTask.dependsOnTaskIds).toContain(implementTask.id);
    });

    it("should handle parallel groups correctly", async () => {
      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: parallelWorkflow,
        workspaceId: "ws-1",
      });

      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);
      const setupTask = tasks.find(t => t.workflowStepName === "Setup")!;
      const testATask = tasks.find(t => t.workflowStepName === "Test A")!;
      const testBTask = tasks.find(t => t.workflowStepName === "Test B")!;
      const deployTask = tasks.find(t => t.workflowStepName === "Deploy")!;

      // Setup has no dependencies
      expect(setupTask.dependsOnTaskIds ?? []).toEqual([]);
      // Parallel tests both depend on Setup
      expect(testATask.dependsOnTaskIds).toContain(setupTask.id);
      expect(testBTask.dependsOnTaskIds).toContain(setupTask.id);
      // Deploy depends on BOTH parallel tasks
      expect(deployTask.dependsOnTaskIds).toContain(testATask.id);
      expect(deployTask.dependsOnTaskIds).toContain(testBTask.id);
    });

    it("should substitute variables in step input", async () => {
      const workflowWithVars: WorkflowDefinition = {
        name: "Var Flow",
        variables: { greeting: "Hello" },
        steps: [
          { name: "Step 1", specialist: "dev", input: "${greeting} World" },
        ],
      };

      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: workflowWithVars,
        workspaceId: "ws-1",
      });
      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);

      expect(tasks[0].prompt).toBe("Hello World");
    });

    it("should substitute trigger payload in input", async () => {
      const workflowWithTrigger: WorkflowDefinition = {
        name: "Trigger Flow",
        steps: [
          { name: "Step 1", specialist: "dev", input: "PR: ${trigger.payload}" },
        ],
      };

      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: workflowWithTrigger,
        workspaceId: "ws-1",
        triggerPayload: "PR #42: Fix bug",
      });
      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);

      expect(tasks[0].prompt).toBe("PR: PR #42: Fix bug");
    });

    it("should set triggerSource to workflow", async () => {
      const result = await executor.trigger({
        workflowId: "wf-1",
        definition: minimalWorkflow,
        workspaceId: "ws-1",
      });
      const tasks = await taskStore.listByWorkflowRunId(result.workflowRunId);

      expect(tasks[0].triggerSource).toBe("workflow");
    });
  });
});

