import { v4 as uuidv4 } from "uuid";
import type { Task } from "../models/task";
import type { KanbanColumn } from "../models/kanban";
import { AgentEventType, type EventBus } from "../events/event-bus";
import { isClaudeCodeSdkConfigured } from "../acp/claude-code-sdk-adapter";
import { formatArtifactSummary, resolveKanbanTransitionArtifacts } from "./transition-artifacts";

function formatHandoffRequestType(
  value: "environment_preparation" | "runtime_context" | "clarification" | "rerun_command",
): string {
  switch (value) {
    case "environment_preparation":
      return "Environment preparation";
    case "runtime_context":
      return "Runtime context";
    case "clarification":
      return "Clarification";
    case "rerun_command":
      return "Rerun command";
    default:
      return value;
  }
}

export function getInternalApiOrigin(): string {
  const configuredOrigin = process.env.ROUTA_INTERNAL_API_ORIGIN
    ?? process.env.ROUTA_BASE_URL
    ?? process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

  if (configuredOrigin) {
    return configuredOrigin.replace(/\/$/, "");
  }

  const port = process.env.PORT ?? "3000";
  return `http://127.0.0.1:${port}`;
}

export function buildTaskPrompt(
  task: Task,
  boardColumns: KanbanColumn[] = [],
  options?: { currentSessionId?: string },
): string {
  const labels = task.labels.length > 0 ? `Labels: ${task.labels.join(", ")}` : "Labels: none";
  const currentColumnId = task.columnId ?? "backlog";
  const isBacklogPlanning = currentColumnId === "backlog";
  const transitionArtifacts = resolveKanbanTransitionArtifacts(boardColumns, currentColumnId);
  const orderedColumns = boardColumns.slice().sort((left, right) => left.position - right.position);
  const currentColumnIndex = orderedColumns.findIndex((column) => column.id === currentColumnId);
  const previousColumn = currentColumnIndex > 0 ? orderedColumns[currentColumnIndex - 1] : undefined;
  const previousLaneSession = previousColumn
    ? [...(task.laneSessions ?? [])].reverse().find((entry) => entry.columnId === previousColumn.id)
    : undefined;
  const pendingLaneHandoffs = options?.currentSessionId
    ? (task.laneHandoffs ?? []).filter((handoff) => handoff.toSessionId === options.currentSessionId && !handoff.respondedAt)
    : [];

  // Determine the next column for move_card guidance
  const columnOrder = ["backlog", "todo", "dev", "review", "done"];
  const currentIdx = columnOrder.indexOf(currentColumnId);
  const fallbackNextColumnId = currentIdx >= 0 && currentIdx < columnOrder.length - 1
    ? columnOrder[currentIdx + 1]
    : undefined;
  const nextColumnId = transitionArtifacts.nextColumn?.id ?? fallbackNextColumnId;

  const availableTools = isBacklogPlanning
    ? [
        `- **update_card**: Update this card's title, description, priority, or labels. Use cardId: "${task.id}"`,
        "- **search_cards**: Search the board for duplicates or related work before creating more tasks",
        "- **create_card**: Create exactly one follow-up backlog card if the current card must be refined into a single user story",
        "- **decompose_tasks**: Create multiple backlog cards when the current card clearly contains multiple independent stories",
        "- **create_note**: Create notes for planning or refinement context",
        "- **list_artifacts**: Check whether the required artifacts already exist for this card",
        "- **provide_artifact**: Save test results, code diffs, or other evidence as structured Kanban artifacts",
        "- **capture_screenshot**: Capture and store a screenshot artifact when visual proof is required",
        `- **move_card**: Move this card to the next column when your work is complete. Use cardId: "${task.id}", targetColumnId: "${nextColumnId ?? "todo"}"`,
      ]
    : [
        `- **update_card**: Update this card's title, description, priority, or labels. Use cardId: "${task.id}"`,
        "- **create_note**: Create notes for documentation or progress tracking",
        "- **list_artifacts**: Check whether the required artifacts already exist for this card",
        "- **provide_artifact**: Save test results, code diffs, or other evidence as structured Kanban artifacts",
        "- **capture_screenshot**: Capture and store a screenshot artifact when visual proof is required",
        "- **request_previous_lane_handoff**: Ask the immediately previous lane to prepare environment, rerun a command, or clarify setup for this card",
        "- **submit_lane_handoff**: Finish a lane handoff request after you complete the requested support work",
        `- **move_card**: Move this card to the next column when your work is complete. Use cardId: "${task.id}", targetColumnId: "${nextColumnId ?? "done"}"`,
      ];
  const moveInstruction = nextColumnId
    ? `When your work for this column is complete, call \`move_card\` with cardId: "${task.id}" and targetColumnId: "${nextColumnId}" to advance the card. The next column's specialist will pick it up automatically.`
    : "This card is in the final column. Update the card with your completion summary.";

  const instructions = isBacklogPlanning
    ? [
        "1. Treat backlog as planning and refinement, not implementation",
        "2. Clarify or decompose the work into backlog-ready stories when needed",
        "3. Do not use native tools such as Bash, Read, Write, Edit, Glob, or Grep in backlog planning",
        "4. Do not use GitHub CLI commands such as gh issue create",
        "5. Do not start implementation work in this column",
        "6. Report what backlog story or stories were created or refined",
        `7. ${moveInstruction}`,
        "8. If the next transition is artifact-gated, create the required artifacts before calling `move_card`.",
      ]
    : [
        "1. Complete the work assigned to this column stage",
        "2. Use `update_card` to track progress in the card description",
        "3. Keep changes focused on this task",
        `4. ${moveInstruction}`,
        "5. If the next transition requires artifacts, verify them with `list_artifacts` and create missing evidence with `provide_artifact` or `capture_screenshot` before moving the card.",
        currentColumnId === "review"
          ? "6. If verification depends on runtime setup from dev, use `request_previous_lane_handoff` instead of guessing the environment."
          : "6. If another lane requests support from this session, complete the requested runtime help and then call `submit_lane_handoff`.",
        "7. Do not call `report_to_parent`; this Kanban automation session is managed directly by the workflow",
      ];

  const artifactGateSection = [
    "## Artifact Gates",
    "",
    `**Current lane gate:** ${transitionArtifacts.currentColumn?.name ?? currentColumnId} requires ${formatArtifactSummary(transitionArtifacts.currentRequiredArtifacts)} to enter.`,
    transitionArtifacts.nextColumn
      ? `**Next transition gate:** Moving this card to ${transitionArtifacts.nextColumn.name ?? nextColumnId ?? "the next column"} requires ${formatArtifactSummary(transitionArtifacts.nextRequiredArtifacts)}.`
      : "**Next transition gate:** None. This card is already in the terminal stage.",
    transitionArtifacts.nextRequiredArtifacts.length > 0
      ? `Before you call \`move_card\`, make sure ${formatArtifactSummary(transitionArtifacts.nextRequiredArtifacts)} exist as artifacts on task ${task.id}.`
      : "If no artifact gate is listed, you still should leave concise evidence in the card update.",
    "Use `list_artifacts` to confirm what already exists, then use `provide_artifact` or `capture_screenshot` to fill gaps.",
    "",
  ];

  const laneHandoffSection = !isBacklogPlanning && (previousLaneSession || pendingLaneHandoffs.length > 0)
    ? [
        "## Lane Handoff Context",
        "",
        previousLaneSession
          ? `**Previous lane session:** ${previousLaneSession.columnName ?? previousLaneSession.columnId ?? "unknown"} · ${previousLaneSession.provider ?? "unknown provider"} · ${previousLaneSession.role ?? "unknown role"}`
          : "**Previous lane session:** none recorded",
        previousLaneSession
          ? "Use `request_previous_lane_handoff` if you need environment preparation, runtime context, or a focused rerun from the previous lane."
          : "No previous lane session is available for handoff.",
        ...(pendingLaneHandoffs.length > 0
          ? pendingLaneHandoffs.flatMap((handoff, index) => ([
              "",
              `Pending handoff ${index + 1}: ${formatHandoffRequestType(handoff.requestType)}`,
              handoff.request,
              `Respond with \`submit_lane_handoff\` using handoffId: "${handoff.id}".`,
            ]))
          : []),
        "",
      ]
    : [];

  const devVerificationSection = currentColumnId === "dev"
    ? [
        "## Dev Verification Safety",
        "",
        "Verify frontend changes against the current task worktree and the preview process started for this session.",
        "Do not assume `http://localhost:3000` is the right preview target unless this session started that exact server for the current worktree.",
        "Do not use broad process-kill commands such as `pkill -f \"next dev\"` or otherwise stop shared developer servers.",
        "If you start a temporary preview server, stop only the exact process started for this session, preferably via its recorded PID. Do not use `ps | grep | xargs kill`, `killall`, or broad `pkill` patterns for cleanup.",
        "If the UI depends on env vars or setup, start verification with those exact env vars, mention them in `update_card`, and attach evidence from that configured run.",
        "If safe runtime verification is blocked, use `request_previous_lane_handoff` for environment preparation or runtime context instead of looping on restarts.",
        "",
      ]
    : [];

  return [
    `You are assigned to Kanban task: ${task.title}`,
    "",
    "## Context",
    "",
    "**IMPORTANT**: You are working in Kanban context. Use MCP tools (update_card, move_card, etc.) to manage this card.",
    "Do NOT create or sync GitHub issues during backlog planning.",
    "Do NOT use `gh issue create` or other GitHub CLI commands — those are for GitHub issue context only.",
    "",
    "## Task Details",
    "",
    `**Card ID:** ${task.id}`,
    `**Priority:** ${task.priority ?? "medium"}`,
    labels,
    task.githubUrl ? `**GitHub Issue:** ${task.githubUrl}` : "**GitHub Issue:** local-only",
    "",
    "## Objective",
    "",
    task.objective,
    "",
    ...artifactGateSection,
    ...laneHandoffSection,
    ...devVerificationSection,
    "## Available MCP Tools",
    "",
    "You have access to the following MCP tools for task management:",
    "",
    ...availableTools,
    "",
    "## Instructions",
    "",
    ...instructions,
  ].join("\n");
}

export function resolveKanbanAutomationProvider(provider?: string): string {
  if (provider === "claude" && isClaudeCodeSdkConfigured()) {
    return "claude-code-sdk";
  }

  return provider ?? "opencode";
}

export async function triggerAssignedTaskAgent(params: {
  origin: string;
  workspaceId: string;
  cwd: string;
  branch?: string;
  task: Task;
  boardColumns?: KanbanColumn[];
  eventBus?: EventBus;
}): Promise<{ sessionId?: string; error?: string }> {
  const { origin, workspaceId, cwd, branch, task, boardColumns = [], eventBus } = params;
  const provider = resolveKanbanAutomationProvider(task.assignedProvider);
  const role = task.assignedRole ?? "CRAFTER";

  const newSessionResponse = await fetch(`${origin}/api/acp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "session/new",
      params: {
        cwd,
        branch,
        provider,
        role,
        toolMode: "full",
        workspaceId,
        specialistId: task.assignedSpecialistId,
        name: `${task.title} · ${provider}`,
      },
    }),
  });

  const newSessionBody = await newSessionResponse.json() as { result?: { sessionId?: string }; error?: { message?: string } };
  const sessionId = newSessionBody.result?.sessionId;
  if (!newSessionResponse.ok || !sessionId) {
    return { error: newSessionBody.error?.message ?? "Failed to create ACP session." };
  }

  void (async () => {
    const response = await fetch(`${origin}/api/acp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: uuidv4(),
        method: "session/prompt",
        params: {
          sessionId,
          workspaceId,
          provider,
          cwd,
          prompt: [{ type: "text", text: buildTaskPrompt(task, boardColumns, { currentSessionId: sessionId }) }],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`session/prompt HTTP ${response.status}`);
    }

    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      } finally {
        reader.releaseLock();
      }
    } else {
      await response.arrayBuffer();
    }

    if (eventBus) {
      eventBus.emit({
        type: AgentEventType.AGENT_COMPLETED,
        agentId: sessionId,
        workspaceId,
        data: {
          sessionId,
          success: true,
        },
        timestamp: new Date(),
      });
    }
  })().catch((error) => {
    console.error("[kanban] Failed to auto-prompt ACP task session:", error);
    if (eventBus) {
      eventBus.emit({
        type: AgentEventType.AGENT_FAILED,
        agentId: sessionId,
        workspaceId,
        data: {
          sessionId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        },
        timestamp: new Date(),
      });
    }
  });

  return { sessionId };
}
