import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  hydrateFromDb,
  getSession,
  getConsolidatedHistory,
  proxyRequestToRunner,
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
  saveHistoryToDb,
  killSession,
} = vi.hoisted(() => ({
  hydrateFromDb: vi.fn(),
  getSession: vi.fn(),
  getConsolidatedHistory: vi.fn(),
  proxyRequestToRunner: vi.fn(),
  getRequiredRunnerUrl: vi.fn(),
  isForwardedAcpRequest: vi.fn(),
  saveHistoryToDb: vi.fn(),
  killSession: vi.fn(),
}));

vi.mock("@/core/acp/http-session-store", () => ({
  getHttpSessionStore: () => ({
    hydrateFromDb,
    getSession,
    getConsolidatedHistory,
  }),
}));

vi.mock("@/core/acp/session-db-persister", () => ({
  saveHistoryToDb,
}));

vi.mock("@/core/acp/processer", () => ({
  getAcpProcessManager: () => ({
    killSession,
  }),
}));

vi.mock("@/core/acp/runner-routing", () => ({
  getRequiredRunnerUrl,
  isForwardedAcpRequest,
  proxyRequestToRunner,
  runnerUnavailableResponse: () => new Response(JSON.stringify({ error: "runner unavailable" }), { status: 503 }),
}));

import { POST } from "../route";

describe("/api/sessions/[sessionId]/disconnect POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hydrateFromDb.mockResolvedValue(undefined);
    getRequiredRunnerUrl.mockReturnValue("http://runner.internal");
    isForwardedAcpRequest.mockReturnValue(false);
    proxyRequestToRunner.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    saveHistoryToDb.mockResolvedValue(undefined);
  });

  it("proxies runner-owned sessions instead of killing local state", async () => {
    getSession.mockReturnValue({
      sessionId: "session-123",
      cwd: "/tmp/project",
      workspaceId: "workspace-1",
      executionMode: "runner",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/sessions/session-123/disconnect", { method: "POST" }),
      { params: Promise.resolve({ sessionId: "session-123" }) },
    );

    expect(response.status).toBe(200);
    expect(proxyRequestToRunner).toHaveBeenCalledTimes(1);
    expect(saveHistoryToDb).not.toHaveBeenCalled();
    expect(killSession).not.toHaveBeenCalled();
  });
});
