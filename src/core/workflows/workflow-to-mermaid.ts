/**
 * workflow-to-mermaid.ts
 *
 * Converts a WorkflowDefinition into a Mermaid flowchart diagram string.
 *
 * Supports:
 *  - Sequential steps
 *  - Parallel groups (subgraphs)
 *  - Trigger type in the start node
 *  - on_failure annotations
 */

import type { WorkflowDefinition, WorkflowStep } from "./workflow-types";

/** Sanitize a string for use as a Mermaid node ID (no spaces, special chars). */
function toNodeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Escape a string for use inside Mermaid node labels (double-quote safe). */
function escapeLabel(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/\[/g, "&#91;").replace(/\]/g, "&#93;");
}

/** Build a human-readable label for a step node. */
function stepLabel(step: WorkflowStep): string {
  const lines: string[] = [escapeLabel(step.name)];
  lines.push(`🤖 ${escapeLabel(step.specialist)}`);
  if (step.adapter) lines.push(`⚙ ${escapeLabel(step.adapter)}`);
  if (step.on_failure && step.on_failure !== "stop") {
    lines.push(`⚠ on_failure: ${step.on_failure}`);
  }
  return lines.join("<br/>");
}

/** Build a Mermaid flowchart string from a WorkflowDefinition. */
export function workflowToMermaid(definition: WorkflowDefinition): string {
  const lines: string[] = ["flowchart TD"];

  // ── Start node ────────────────────────────────────────────────────────────
  const triggerType = definition.trigger?.type ?? "manual";
  const triggerLabel =
    triggerType === "webhook"
      ? `Trigger: webhook<br/>📡 ${escapeLabel(definition.trigger?.source ?? "")} / ${escapeLabel(definition.trigger?.event ?? "")}`
      : triggerType === "schedule"
      ? `Trigger: schedule<br/>⏱ ${escapeLabel(definition.trigger?.cron ?? "")}`
      : "Trigger: manual";

  lines.push(`  __start__(["${triggerLabel}"])`);

  // ── Group steps by parallel_group ─────────────────────────────────────────
  // A "group" is either a single non-parallel step, or a set of steps with
  // the same parallel_group value. Order is preserved as in the definition.
  type StepGroup = { key: string | null; steps: WorkflowStep[] };
  const groups: StepGroup[] = [];

  for (const step of definition.steps) {
    const key = step.parallel_group ?? null;
    const last = groups[groups.length - 1];
    if (key && last && last.key === key) {
      // Same parallel group — append to it
      last.steps.push(step);
    } else {
      groups.push({ key, steps: [step] });
    }
  }

  // ── Emit node definitions ─────────────────────────────────────────────────
  for (const group of groups) {
    if (group.key) {
      // Parallel group — use a subgraph
      const sgId = `sg_${toNodeId(group.key)}`;
      lines.push(`  subgraph ${sgId}["⟳ Parallel: ${escapeLabel(group.key)}"]`);
      for (const step of group.steps) {
        const id = toNodeId(step.name);
        lines.push(`    ${id}["${stepLabel(step)}"]`);
      }
      lines.push("  end");
    } else {
      // Sequential step
      const step = group.steps[0];
      const id = toNodeId(step.name);
      lines.push(`  ${id}["${stepLabel(step)}"]`);
    }
  }

  // ── End node ──────────────────────────────────────────────────────────────
  lines.push('  __end__(["✅ End"])');

  // ── Edges ─────────────────────────────────────────────────────────────────
  // Collect the "exit nodes" of each group (i.e., all step node IDs in the group).
  // The next group's "entry nodes" connect from the previous group's exit nodes.
  const exitIds = (group: StepGroup): string[] =>
    group.steps.map((s) => toNodeId(s.name));

  let prevExitIds: string[] = ["__start__"];

  for (const group of groups) {
    const entryIds = exitIds(group);
    // Connect each prev exit to each entry in this group
    for (const from of prevExitIds) {
      for (const to of entryIds) {
        lines.push(`  ${from} --> ${to}`);
      }
    }
    prevExitIds = entryIds;
  }

  // Connect last group to end
  for (const from of prevExitIds) {
    lines.push(`  ${from} --> __end__`);
  }

  return lines.join("\n");
}
