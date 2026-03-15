import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRole, ModelTier } from "@/core/models/agent";
import {
  buildDelegationPrompt,
  buildSpecialistSystemPrompt,
  type SpecialistConfig,
} from "../specialist-prompts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "routa-review-rules-"));
  tempDirs.push(dir);
  return dir;
}

function createSpecialist(id: string): SpecialistConfig {
  return {
    id,
    name: id,
    description: "",
    role: AgentRole.GATE,
    defaultModelTier: ModelTier.SMART,
    systemPrompt: `Prompt for ${id}`,
    roleReminder: "Stay read-only.",
    source: "bundled",
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) {
      continue;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for temp fixtures.
    }
  }
});

describe("specialist-prompts review rules", () => {
  it("injects project review rules for PR reviewer specialists", () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, ".routa"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".routa", "review-rules.md"),
      `---
title: "Local rules"
---

- Ignore TODO comments
- Only report findings with confidence >= 8`
    );

    const prompt = buildSpecialistSystemPrompt({
      specialist: createSpecialist("pr-reviewer"),
      cwd,
    });

    expect(prompt).toContain("## Project-Specific Review Rules");
    expect(prompt).toContain("Ignore TODO comments");
    expect(prompt).toContain("confidence >= 8");
    expect(prompt).not.toContain('title: "Local rules"');
    expect(prompt).toContain("**Reminder:** Stay read-only.");
  });

  it("does not inject project review rules for non-review specialists", () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, ".routa"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".routa", "review-rules.md"),
      "- This should not be injected for crafter"
    );

    const prompt = buildSpecialistSystemPrompt({
      specialist: createSpecialist("crafter"),
      cwd,
    });

    expect(prompt).not.toContain("Project-Specific Review Rules");
    expect(prompt).not.toContain("This should not be injected for crafter");
    expect(prompt).toContain("**Reminder:** Stay read-only.");
  });

  it("keeps extra delegation context alongside project review rules", () => {
    const cwd = makeTempDir();
    fs.mkdirSync(path.join(cwd, ".routa"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".routa", "review-rules.md"),
      "- Suppress style findings already covered by lint"
    );

    const prompt = buildDelegationPrompt({
      specialist: createSpecialist("pr-analyzer"),
      agentId: "agent-1",
      taskId: "task-1",
      taskTitle: "Review the pull request",
      taskContent: "## Objective\nAnalyze the PR",
      parentAgentId: "parent-1",
      additionalContext: "Validate each candidate finding with GATE before reporting.",
      cwd,
    });

    expect(prompt).toContain("Project-Specific Review Rules");
    expect(prompt).toContain("Suppress style findings already covered by lint");
    expect(prompt).toContain(
      "**Additional Context:** Validate each candidate finding with GATE before reporting."
    );
  });
});
