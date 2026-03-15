import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { KanbanTab } from "../kanban-tab";
import type { KanbanBoardInfo, TaskInfo } from "../../types";
import type { UseAcpActions, UseAcpState } from "@/client/hooks/use-acp";

const board: KanbanBoardInfo = {
  id: "board-1",
  workspaceId: "workspace-1",
  name: "Default Board",
  isDefault: true,
  sessionConcurrencyLimit: 1,
  queue: {
    runningCount: 0,
    runningCards: [],
    queuedCount: 0,
    queuedCardIds: [],
    queuedCards: [],
    queuedPositions: {},
  },
  columns: [
    { id: "backlog", name: "Backlog", position: 0, stage: "backlog" },
  ],
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

function createTask(id: string, title: string): TaskInfo {
  return {
    id,
    title,
    objective: `${title} objective`,
    status: "PENDING",
    boardId: board.id,
    columnId: "backlog",
    position: 0,
    createdAt: "2025-01-01T00:00:00.000Z",
  };
}

describe("KanbanTab delete flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows deleting a second story after the first delete succeeds", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE" && url.startsWith("/api/tasks/")) {
        return {
          ok: true,
          json: async () => ({ deleted: true }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <KanbanTab
        workspaceId="workspace-1"
        boards={[board]}
        tasks={[createTask("task-1", "Story One"), createTask("task-2", "Story Two")]}
        sessions={[]}
        providers={[]}
        specialists={[]}
        codebases={[]}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(container.querySelectorAll('[data-testid="kanban-card-delete"]')[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1", { method: "DELETE" });
    });

    await waitFor(() => {
      expect(screen.queryByText("Story One")).toBeNull();
    });

    fireEvent.click(container.querySelectorAll('[data-testid="kanban-card-delete"]')[0]!);

    const secondDeleteButton = await screen.findByRole("button", { name: "Delete" });
    expect(secondDeleteButton.hasAttribute("disabled")).toBe(false);
    expect(secondDeleteButton.textContent).toBe("Delete");
  });
});

describe("KanbanTab lane automation labels", () => {
  it("shows provider, role, and specialist on automated lanes", () => {
    const automatedBoard: KanbanBoardInfo = {
      ...board,
      columns: [
        {
          id: "backlog",
          name: "Backlog",
          position: 0,
          stage: "backlog",
          automation: {
            enabled: true,
            providerId: "claude",
            role: "GATE",
            specialistId: "verify",
            specialistName: "Verifier",
            transitionType: "exit",
          },
        },
      ],
    };

    render(
      <KanbanTab
        workspaceId="workspace-1"
        boards={[automatedBoard]}
        tasks={[createTask("task-1", "Story One")]}
        sessions={[]}
        providers={[{ id: "claude", name: "Claude Code", description: "Claude Code provider", command: "claude" }]}
        specialists={[{ id: "verify", name: "Verifier", role: "GATE" }]}
        codebases={[]}
        onRefresh={vi.fn()}
      />,
    );

    const laneAutomation = screen.getByTestId("kanban-column-automation-backlog");
    expect(laneAutomation.textContent).toBe("Claude Code · GATE · Verifier ->");
  });
});

describe("KanbanTab card detail manual runs", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("allows running a card from detail while inheriting the lane default automation", async () => {
    const automatedBoard: KanbanBoardInfo = {
      ...board,
      columns: [
        {
          id: "backlog",
          name: "Backlog",
          position: 0,
          stage: "backlog",
          automation: {
            enabled: true,
            providerId: "claude",
            role: "ROUTA",
            specialistId: "backlog-refiner",
            specialistName: "Backlog Refiner",
            transitionType: "exit",
          },
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PATCH" && url === "/api/tasks/task-1") {
        return {
          ok: true,
          json: async () => ({
            task: {
              ...createTask("task-1", "Story One"),
              triggerSessionId: "session-123",
            },
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${init?.method ?? "GET"} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <KanbanTab
        workspaceId="workspace-1"
        boards={[automatedBoard]}
        tasks={[createTask("task-1", "Story One")]}
        sessions={[]}
        providers={[{ id: "claude", name: "Claude Code", description: "Claude Code provider", command: "claude" }]}
        specialists={[{ id: "backlog-refiner", name: "Backlog Refiner", role: "ROUTA" }]}
        codebases={[]}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Story One" }));

    const runButton = await screen.findByTestId("kanban-detail-run");
    expect(runButton.textContent).toBe("Run");
    expect(screen.getByText(/Manual runs use the current lane default/i)).toBeTruthy();

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/task-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryTrigger: true }),
      });
    });
  });
});

describe("KanbanTab session terminal hint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a read-only terminal hint when the Kanban agent panel opens", async () => {
    vi.stubGlobal(
      "scrollIntoView",
      vi.fn(),
    );
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    const acp = {
      connected: true,
      sessionId: null,
      updates: [],
      providers: [{ id: "claude", name: "Claude Code", description: "Claude Code provider", command: "claude" }],
      selectedProvider: "claude",
      loading: false,
      error: null,
      authError: null,
      dockerConfigError: null,
      connect: vi.fn(),
      createSession: vi.fn(),
      selectSession: vi.fn(),
      setProvider: vi.fn(),
      setMode: vi.fn(),
      prompt: vi.fn(),
      promptSession: vi.fn(),
      respondToUserInput: vi.fn(),
      writeTerminal: vi.fn(),
      resizeTerminal: vi.fn(),
      cancel: vi.fn(),
      disconnect: vi.fn(),
      clearAuthError: vi.fn(),
      clearDockerConfigError: vi.fn(),
      listProviderModels: vi.fn(),
    } satisfies Partial<UseAcpState & UseAcpActions> as UseAcpState & UseAcpActions;

    const onAgentPrompt = vi.fn().mockResolvedValue("session-123");

    render(
      <KanbanTab
        workspaceId="workspace-1"
        boards={[board]}
        tasks={[createTask("task-1", "Story One")]}
        sessions={[
          {
            sessionId: "session-123",
            cwd: "/tmp/project",
            workspaceId: "workspace-1",
            provider: "claude",
            createdAt: "2025-01-01T00:00:00.000Z",
          },
        ]}
        providers={[{ id: "claude", name: "Claude Code", description: "Claude Code provider", command: "claude" }]}
        specialists={[]}
        codebases={[]}
        onRefresh={vi.fn()}
        acp={acp}
        onAgentPrompt={onAgentPrompt}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Describe work to plan in Kanban..."), {
      target: { value: "Investigate lane issue" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(onAgentPrompt).toHaveBeenCalled();
    });
    expect(onAgentPrompt).toHaveBeenCalledWith(
      expect.stringContaining("You are the KanbanTask Agent"),
      expect.objectContaining({
        provider: "claude",
        role: "CRAFTER",
        toolMode: "full",
        allowedNativeTools: [],
      }),
    );

    const hint = await screen.findByTestId("kanban-read-only-terminal-hint");
    expect(hint.textContent).toContain("Browser terminal output is read-only right now.");

    const link = screen.getByRole("link", { name: "Open session" });
    expect(link.getAttribute("href")).toBe("/workspace/workspace-1/sessions/session-123");
  });
});
