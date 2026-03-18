import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KanbanColumnInfo, TaskInfo } from "../../types";
import { KanbanCard } from "../kanban-card";

const boardColumns: KanbanColumnInfo[] = [
  { id: "backlog", name: "Backlog", position: 0, stage: "backlog" },
  { id: "todo", name: "Todo", position: 1, stage: "todo" },
  { id: "dev", name: "Dev", position: 2, stage: "dev" },
  {
    id: "review",
    name: "Review",
    position: 3,
    stage: "review",
    automation: {
      enabled: false,
      requiredArtifacts: ["screenshot"],
    },
  },
];

function buildTask(overrides?: Partial<TaskInfo>): TaskInfo {
  return {
    id: "task-1",
    title: "Artifact status",
    objective: "Show artifact gate state on the card.",
    status: "IN_PROGRESS",
    boardId: "board-1",
    columnId: "dev",
    position: 0,
    priority: "medium",
    labels: [],
    createdAt: "2025-01-01T00:00:00.000Z",
    artifactSummary: {
      total: 0,
      byType: {},
    },
    ...overrides,
  };
}

describe("KanbanCard artifact gate status", () => {
  it("shows missing artifact gate state when the next lane is still blocked", () => {
    render(
      <KanbanCard
        task={buildTask()}
        boardColumns={boardColumns}
        availableProviders={[]}
        specialists={[]}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onDragStart={vi.fn()}
        onOpenDetail={vi.fn()}
        onDelete={vi.fn()}
        onPatchTask={vi.fn()}
        onRetryTrigger={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("kanban-card-artifact-gate").textContent).toContain("Needs Screenshot");
  });

  it("shows ready state and artifact count once the gate is satisfied", () => {
    render(
      <KanbanCard
        task={buildTask({
          artifactSummary: {
            total: 2,
            byType: {
              screenshot: 1,
              logs: 1,
            },
          },
        })}
        boardColumns={boardColumns}
        availableProviders={[]}
        specialists={[]}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onDragStart={vi.fn()}
        onOpenDetail={vi.fn()}
        onDelete={vi.fn()}
        onPatchTask={vi.fn()}
        onRetryTrigger={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByTestId("kanban-card-artifact-gate").textContent).toContain("Review ready");
    expect(screen.getByTestId("kanban-card-artifact-count").textContent).toContain("2 artifacts");
  });

  it("renders live session tail as a single-line preview", () => {
    render(
      <KanbanCard
        task={buildTask()}
        boardColumns={boardColumns}
        liveMessageTail="Updated parser; now handling edge-case whitespace and retry flow."
        availableProviders={[]}
        specialists={[]}
        codebases={[]}
        allCodebaseIds={[]}
        worktreeCache={{}}
        onDragStart={vi.fn()}
        onOpenDetail={vi.fn()}
        onDelete={vi.fn()}
        onPatchTask={vi.fn()}
        onRetryTrigger={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Live Session")).toBeTruthy();
    expect(screen.getByTestId("kanban-card-live-tail").textContent).toContain("Updated parser;");
  });
});
