import { afterEach, describe, expect, it, vi } from "vitest";
import { createKanbanBoard } from "../../models/kanban";
import { createTask } from "../../models/task";
import { InMemoryKanbanBoardStore } from "../../store/kanban-board-store";
import { InMemoryTaskStore } from "../../store/task-store";
import { KanbanTools } from "../kanban-tools";

describe("KanbanTools", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });
  it("creates a card on the default board when boardId is omitted", async () => {
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const tools = new KanbanTools(boardStore, taskStore);

    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Default Board",
      isDefault: true,
    });
    await boardStore.save(board);

    const result = await tools.createCard({
      workspaceId: "default",
      title: "Created without board id",
      columnId: "backlog",
    });

    expect(result.success).toBe(true);
    const tasks = await taskStore.listByWorkspace("default");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: "Created without board id",
      boardId: "board-1",
      columnId: "backlog",
    });
  });

  it("lists cards by column on the default board when boardId is omitted", async () => {
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const tools = new KanbanTools(boardStore, taskStore);

    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Default Board",
      isDefault: true,
    });
    await boardStore.save(board);

    await tools.createCard({
      workspaceId: "default",
      title: "Backlog card",
      columnId: "backlog",
    });

    const result = await tools.listCardsByColumn("backlog", undefined, "default");

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      columnId: "backlog",
      cards: [{ title: "Backlog card" }],
    });
  });

  it("requests a handoff from the previous lane session", async () => {
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const tools = new KanbanTools(boardStore, taskStore);

    const board = createKanbanBoard({
      id: "board-1",
      workspaceId: "default",
      name: "Default Board",
      isDefault: true,
      columns: [
        { id: "backlog", name: "Backlog", position: 0, stage: "backlog" },
        { id: "dev", name: "Dev", position: 1, stage: "dev" },
        { id: "review", name: "Review", position: 2, stage: "review" },
      ],
    });
    await boardStore.save(board);

    const task = createTask({
      id: "task-1",
      title: "Review login flow",
      objective: "Verify the login flow in review",
      workspaceId: "default",
      boardId: board.id,
      columnId: "review",
    });
    task.laneSessions = [
      {
        sessionId: "session-dev-1",
        columnId: "dev",
        columnName: "Dev",
        provider: "opencode",
        role: "DEVELOPER",
        status: "completed",
        startedAt: "2026-03-17T00:00:00.000Z",
      },
      {
        sessionId: "session-review-1",
        columnId: "review",
        columnName: "Review",
        provider: "opencode",
        role: "GATE",
        status: "running",
        startedAt: "2026-03-17T00:10:00.000Z",
      },
    ];
    await taskStore.save(task);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await tools.requestPreviousLaneHandoff({
      taskId: task.id,
      requestType: "environment_preparation",
      request: "Start the app and share the local URL.",
      sessionId: "session-review-1",
    });

    expect(result.success).toBe(true);
    const savedTask = await taskStore.get(task.id);
    expect(savedTask?.laneHandoffs[0]).toMatchObject({
      status: "delivered",
      toSessionId: "session-dev-1",
      requestType: "environment_preparation",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("submits a lane handoff response back to the requesting session", async () => {
    const boardStore = new InMemoryKanbanBoardStore();
    const taskStore = new InMemoryTaskStore();
    const tools = new KanbanTools(boardStore, taskStore);

    const task = createTask({
      id: "task-2",
      title: "Prepare review environment",
      objective: "Support review with runtime context",
      workspaceId: "default",
      boardId: "board-1",
      columnId: "review",
    });
    task.laneHandoffs = [
      {
        id: "handoff-1",
        fromSessionId: "session-review-1",
        toSessionId: "session-dev-1",
        fromColumnId: "review",
        toColumnId: "dev",
        requestType: "runtime_context",
        request: "Seed demo data and confirm the route.",
        status: "delivered",
        requestedAt: "2026-03-17T00:00:00.000Z",
      },
    ];
    await taskStore.save(task);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await tools.submitLaneHandoff({
      taskId: task.id,
      handoffId: "handoff-1",
      status: "completed",
      summary: "Service is running on http://127.0.0.1:3000 with seeded demo data.",
      sessionId: "session-dev-1",
    });

    expect(result.success).toBe(true);
    const savedTask = await taskStore.get(task.id);
    expect(savedTask?.laneHandoffs[0]).toMatchObject({
      status: "completed",
      responseSummary: "Service is running on http://127.0.0.1:3000 with seeded demo data.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
