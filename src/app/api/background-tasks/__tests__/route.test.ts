import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listByWorkspace = vi.fn();
const listByStatus = vi.fn();
const save = vi.fn();
const deleteTask = vi.fn();
const dispatchPending = vi.fn();
const startBackgroundWorker = vi.fn();

const system = {
  backgroundTaskStore: {
    listByWorkspace,
    listByStatus,
    save,
    delete: deleteTask,
  },
};

vi.mock("@/core/routa-system", () => ({
  getRoutaSystem: () => system,
}));

vi.mock("@/core/background-worker", () => ({
  getBackgroundWorker: () => ({ dispatchPending }),
  startBackgroundWorker: () => startBackgroundWorker(),
}));

import { GET, POST } from "../route";

describe("/api/background-tasks route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listByWorkspace.mockResolvedValue([]);
    listByStatus.mockResolvedValue([]);
    save.mockResolvedValue(undefined);
    deleteTask.mockResolvedValue(undefined);
    dispatchPending.mockResolvedValue(undefined);
  });

  it("lists tasks for an explicit workspace", async () => {
    const response = await GET(new NextRequest("http://localhost/api/background-tasks?workspaceId=workspace-1"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(listByWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(data.tasks).toEqual([]);
  });

  it("rejects task listing without workspaceId", async () => {
    const response = await GET(new NextRequest("http://localhost/api/background-tasks"));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "workspaceId is required" });
    expect(listByWorkspace).not.toHaveBeenCalled();
  });

  it("rejects task creation without workspaceId", async () => {
    const request = new NextRequest("http://localhost/api/background-tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: "run job",
        agentId: "agent-1",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "workspaceId is required" });
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects deleteByStatus without workspaceId", async () => {
    const request = new NextRequest("http://localhost/api/background-tasks", {
      method: "POST",
      body: JSON.stringify({
        action: "deleteByStatus",
        status: "FAILED",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toEqual({ error: "workspaceId is required for deleteByStatus action" });
    expect(listByStatus).not.toHaveBeenCalled();
  });

  it("creates tasks when workspaceId is provided", async () => {
    const request = new NextRequest("http://localhost/api/background-tasks", {
      method: "POST",
      body: JSON.stringify({
        prompt: "run job",
        agentId: "agent-1",
        workspaceId: "workspace-1",
        title: "Run job",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toMatchObject({
      prompt: "run job",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      title: "Run job",
    });
    expect(startBackgroundWorker).toHaveBeenCalled();
    expect(dispatchPending).toHaveBeenCalled();
    expect(data.task).toMatchObject({
      prompt: "run job",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      title: "Run job",
    });
  });
});
