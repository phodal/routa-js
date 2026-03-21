import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hydrateFromDb,
  getSession,
  deleteSession,
  renameSessionInDb,
  deleteSessionFromDb,
  proxyRequestToRunner,
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
} = vi.hoisted(() => ({
  hydrateFromDb: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  renameSessionInDb: vi.fn(),
  deleteSessionFromDb: vi.fn(),
  proxyRequestToRunner: vi.fn(),
  getRequiredRunnerUrl: vi.fn(),
  isForwardedAcpRequest: vi.fn(),
}));

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore: () => ({
    hydrateFromDb,
    getSession,
    deleteSession,
  }),
}));

vi.mock("@/core/acp/session-db-persister", () => ({
  renameSessionInDb,
  deleteSessionFromDb,
}));

vi.mock("@/core/acp/runner-routing", () => ({
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
  proxyRequestToRunner,
  runnerUnavailableResponse: () => new Response(JSON.stringify({ error: "runner unavailable" }), { status: 503 }),
}));

import { DELETE, GET, PATCH } from "../route";

describe("/api/sessions/[sessionId] GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hydrateFromDb.mockResolvedValue(undefined);
    deleteSession.mockReturnValue(true);
    renameSessionInDb.mockResolvedValue(undefined);
    deleteSessionFromDb.mockResolvedValue(undefined);
    proxyRequestToRunner.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    getRequiredRunnerUrl.mockReturnValue("http://runner.internal");
    isForwardedAcpRequest.mockReturnValue(false);
  });

  it("returns ACP runtime status fields for Kanban session backfill", async () => {
    getSession.mockReturnValue({
      sessionId: "session-123",
      name: "Story One · auggie",
      cwd: "/tmp/project",
      branch: "main",
      workspaceId: "workspace-1",
      provider: "auggie",
      role: "DEVELOPER",
      acpStatus: "error",
      acpError: "Permission denied: HTTP error: 403 Forbidden",
      executionMode: "runner",
      ownerInstanceId: "runner",
      leaseExpiresAt: "2026-03-19T00:05:00.000Z",
      createdAt: "2026-03-19T00:00:00.000Z",
    });

    const response = await GET(
      new NextRequest("http://localhost/api/sessions/session-123"),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );
    const data = await response.json();

    expect(hydrateFromDb).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledWith("session-123");
    expect(data.session).toMatchObject({
      sessionId: "session-123",
      provider: "auggie",
      role: "DEVELOPER",
      acpStatus: "error",
      acpError: "Permission denied: HTTP error: 403 Forbidden",
      executionMode: "runner",
      ownerInstanceId: "runner",
    });
  });

  it("proxies DELETE to the runner for runner-owned sessions", async () => {
    getSession.mockReturnValue({
      sessionId: "session-123",
      cwd: "/tmp/project",
      workspaceId: "workspace-1",
      executionMode: "runner",
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/sessions/session-123", { method: "DELETE" }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(200);
    expect(proxyRequestToRunner).toHaveBeenCalledTimes(1);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(deleteSessionFromDb).not.toHaveBeenCalled();
  });

  it("proxies PATCH rename to the runner for runner-owned sessions", async () => {
    getSession.mockReturnValue({
      sessionId: "session-123",
      cwd: "/tmp/project",
      workspaceId: "workspace-1",
      executionMode: "runner",
    });

    const response = await PATCH(
      new NextRequest("http://localhost/api/sessions/session-123", {
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed session" }),
        headers: { "Content-Type": "application/json" },
      }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(200);
    expect(proxyRequestToRunner).toHaveBeenCalledTimes(1);
    expect(renameSessionInDb).not.toHaveBeenCalled();
  });
});
