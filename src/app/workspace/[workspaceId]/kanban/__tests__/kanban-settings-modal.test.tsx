import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KanbanSettingsModal } from "../kanban-settings-modal";
import type { KanbanBoardInfo } from "../../types";

const board: KanbanBoardInfo = {
  id: "board-1",
  workspaceId: "workspace-1",
  name: "Delivery Board",
  isDefault: true,
  sessionConcurrencyLimit: 2,
  queue: {
    runningCount: 0,
    runningCards: [],
    queuedCount: 0,
    queuedCardIds: [],
    queuedCards: [],
    queuedPositions: {},
  },
  columns: [
    { id: "todo", name: "To Do", position: 0, stage: "backlog" },
    { id: "review", name: "Review", position: 1, stage: "review" },
  ],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

describe("KanbanSettingsModal", () => {
  it("saves updated automation and artifact requirements", async () => {
    const onSave = vi.fn(async () => {});

    render(
      <KanbanSettingsModal
        board={board}
        visibleColumns={["todo", "review"]}
        columnAutomation={{}}
        availableProviders={[{ id: "claude", name: "Claude Code", description: "Claude Code provider", command: "claude" }]}
        specialists={[{ id: "verify", name: "Verifier", role: "GATE" }]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /review/i }));
    fireEvent.click(screen.getByRole("switch", { name: /automation/i }));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "claude" } });
    fireEvent.change(screen.getByLabelText("Specialist"), { target: { value: "verify" } });
    fireEvent.click(screen.getByText("Screenshot"));
    fireEvent.click(screen.getByRole("button", { name: /save board settings/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        ["todo", "review"],
        {
          review: expect.objectContaining({
            enabled: true,
            providerId: "claude",
            specialistId: "verify",
            specialistName: "Verifier",
            role: "GATE",
            requiredArtifacts: ["screenshot"],
          }),
        },
        2,
      );
    });
  });
});
