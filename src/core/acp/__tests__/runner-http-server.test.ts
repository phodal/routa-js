import { describe, expect, it } from "vitest";

import { matchRunnerRoute } from "../runner-http-server";

describe("matchRunnerRoute", () => {
  it("matches ACP endpoint", () => {
    expect(matchRunnerRoute("/api/acp")).toEqual({ kind: "acp" });
  });

  it("matches session metadata and disconnect endpoints", () => {
    expect(matchRunnerRoute("/api/sessions/session-123")).toEqual({
      kind: "session",
      sessionId: "session-123",
    });
    expect(matchRunnerRoute("/api/sessions/session-123/disconnect")).toEqual({
      kind: "sessionDisconnect",
      sessionId: "session-123",
    });
  });

  it("returns null for unrelated routes", () => {
    expect(matchRunnerRoute("/api/sessions")).toBeNull();
    expect(matchRunnerRoute("/api/notes")).toBeNull();
  });
});
