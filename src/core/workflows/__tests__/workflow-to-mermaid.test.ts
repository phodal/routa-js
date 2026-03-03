/**
 * Unit tests for workflowToMermaid
 */

import { describe, it, expect } from "vitest";
import { workflowToMermaid } from "../workflow-to-mermaid";
import type { WorkflowDefinition } from "../workflow-types";

describe("workflowToMermaid", () => {
  it("generates a flowchart TD header", () => {
    const def: WorkflowDefinition = {
      name: "Simple Flow",
      steps: [{ name: "Step 1", specialist: "developer" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toMatch(/^flowchart TD/);
  });

  it("uses manual trigger label when no trigger is specified", () => {
    const def: WorkflowDefinition = {
      name: "Simple Flow",
      steps: [{ name: "Step 1", specialist: "developer" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("Trigger: manual");
  });

  it("includes webhook trigger details", () => {
    const def: WorkflowDefinition = {
      name: "Webhook Flow",
      trigger: { type: "webhook", source: "github", event: "pull_request.opened" },
      steps: [{ name: "Analyze", specialist: "analyzer" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("Trigger: webhook");
    expect(diagram).toContain("github");
    expect(diagram).toContain("pull_request.opened");
  });

  it("includes schedule trigger details", () => {
    const def: WorkflowDefinition = {
      name: "Scheduled Flow",
      trigger: { type: "schedule", cron: "0 9 * * 1-5" },
      steps: [{ name: "Daily Task", specialist: "developer" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("Trigger: schedule");
    expect(diagram).toContain("0 9 * * 1-5");
  });

  it("renders sequential steps with edges", () => {
    const def: WorkflowDefinition = {
      name: "Sequential Flow",
      steps: [
        { name: "Analyze", specialist: "analyzer", output_key: "analysis" },
        { name: "Implement", specialist: "developer" },
        { name: "Review", specialist: "reviewer" },
      ],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("Analyze");
    expect(diagram).toContain("Implement");
    expect(diagram).toContain("Review");
    // Should have sequential edges
    expect(diagram).toContain("__start__ --> Analyze");
    expect(diagram).toContain("Analyze --> Implement");
    expect(diagram).toContain("Implement --> Review");
    expect(diagram).toContain("Review --> __end__");
  });

  it("renders parallel group as subgraph", () => {
    const def: WorkflowDefinition = {
      name: "Parallel Flow",
      steps: [
        { name: "Setup", specialist: "developer" },
        { name: "Test A", specialist: "tester", parallel_group: "tests" },
        { name: "Test B", specialist: "tester", parallel_group: "tests" },
        { name: "Deploy", specialist: "devops" },
      ],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("subgraph sg_tests");
    expect(diagram).toContain("Parallel: tests");
    expect(diagram).toContain("Test_A");
    expect(diagram).toContain("Test_B");
    // Setup connects to both parallel steps
    expect(diagram).toContain("Setup --> Test_A");
    expect(diagram).toContain("Setup --> Test_B");
    // Both parallel steps connect to Deploy
    expect(diagram).toContain("Test_A --> Deploy");
    expect(diagram).toContain("Test_B --> Deploy");
  });

  it("includes specialist label in node", () => {
    const def: WorkflowDefinition = {
      name: "Simple Flow",
      steps: [{ name: "My Step", specialist: "code-writer" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("code-writer");
  });

  it("includes adapter label in node when present", () => {
    const def: WorkflowDefinition = {
      name: "Simple Flow",
      steps: [{ name: "My Step", specialist: "developer", adapter: "claude-code-sdk" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("claude-code-sdk");
  });

  it("annotates on_failure when not 'stop'", () => {
    const def: WorkflowDefinition = {
      name: "Retry Flow",
      steps: [{ name: "Flaky Step", specialist: "tester", on_failure: "retry", max_retries: 3 }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("on_failure: retry");
  });

  it("does not annotate on_failure when it is 'stop'", () => {
    const def: WorkflowDefinition = {
      name: "Stop Flow",
      steps: [{ name: "Step 1", specialist: "developer", on_failure: "stop" }],
    };
    const diagram = workflowToMermaid(def);
    expect(diagram).not.toContain("on_failure");
  });

  it("handles node names with special characters by sanitizing IDs", () => {
    const def: WorkflowDefinition = {
      name: "Special Flow",
      steps: [{ name: "Analyze Changes", specialist: "developer" }],
    };
    const diagram = workflowToMermaid(def);
    // Node ID should be sanitized
    expect(diagram).toContain("Analyze_Changes");
    // Label should preserve the name
    expect(diagram).toContain("Analyze Changes");
  });

  it("can visualize the pr-verify workflow structure", async () => {
    const { WorkflowLoader } = await import("../workflow-loader");
    const loader = new WorkflowLoader("resources/flows");
    const def = await loader.load("pr-verify");
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("flowchart TD");
    expect(diagram).toContain("Trigger: webhook");
    expect(diagram).toContain("Analyze_Requirements");
    expect(diagram).toContain("Generate_Verdict");
    expect(diagram).toContain("__end__");
  });

  it("can visualize the code-review workflow structure", async () => {
    const { WorkflowLoader } = await import("../workflow-loader");
    const loader = new WorkflowLoader("resources/flows");
    const def = await loader.load("code-review");
    const diagram = workflowToMermaid(def);
    expect(diagram).toContain("flowchart TD");
    expect(diagram).toContain("Trigger: manual");
    expect(diagram).toContain("Analyze_Changes");
    expect(diagram).toContain("Quality_Gate");
  });
});
