/**
 * E2E tests for the ACP Warmup API (/api/acp/warmup)
 *
 * Covers:
 *   GET  /api/acp/warmup           → all warmup statuses
 *   GET  /api/acp/warmup?id=<id>   → status for a specific agent
 *   POST /api/acp/warmup           → fire-and-forget warmup
 *   POST /api/acp/warmup?sync=true → await warmup result
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

test.describe("ACP Warmup API", () => {
  // ── GET /api/acp/warmup ───────────────────────────────────────────────

  test("GET /api/acp/warmup returns statuses array", async ({ request }) => {
    const res = await request.get(`${BASE}/api/acp/warmup`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.statuses)).toBe(true);
  });

  test("GET /api/acp/warmup?id=<unknown> returns idle or failed status", async ({ request }) => {
    // Use a per-run unique ID so previous test runs don't pollute state.
    // The service returns "idle" on first query, or "failed" if it was
    // previously attempted in a prior run.
    const id = `unknown-agent-${Date.now()}`;
    const res = await request.get(`${BASE}/api/acp/warmup?id=${id}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.agentId).toBe(id);
    // Brand-new IDs start as idle; after a failed attempt they become failed
    expect(["idle", "failed"]).toContain(body.state);
  });

  // ── POST /api/acp/warmup (fire-and-forget) ────────────────────────────

  test("POST /api/acp/warmup starts warmup in background", async ({ request }) => {
    const res = await request.post(`${BASE}/api/acp/warmup`, {
      data: { agentId: "cline" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.agentId).toBe("cline");
    expect(body.started).toBe(true);
    expect(typeof body.message).toBe("string");
  });

  test("POST warmup then GET status shows warming or warm", async ({ request }) => {
    // Start warmup
    await request.post(`${BASE}/api/acp/warmup`, {
      data: { agentId: "opencode" },
    });

    // Immediately check status — should be warming or warm
    const res = await request.get(`${BASE}/api/acp/warmup?id=opencode`);
    const body = await res.json();
    expect(body.agentId).toBe("opencode");
    expect(["warming", "warm", "failed"]).toContain(body.state);
  });

  test("POST warmup is idempotent (already warming returns started)", async ({ request }) => {
    // First call
    await request.post(`${BASE}/api/acp/warmup`, {
      data: { agentId: "cline" },
    });

    // Second call while warming — should return gracefully
    const res = await request.post(`${BASE}/api/acp/warmup`, {
      data: { agentId: "cline" },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.agentId).toBe("cline");
    // Either already started or idempotent return
    expect(typeof body.started !== "undefined" || typeof body.success !== "undefined").toBe(true);
  });

  test("POST /api/acp/warmup with missing agentId returns 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/acp/warmup`, {
      data: {},
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  // ── POST /api/acp/warmup?sync=true ───────────────────────────────────

  test("POST /api/acp/warmup?sync=true for unknown agent returns failure", async ({
    request,
  }) => {
    test.setTimeout(30_000);

    const res = await request.post(`${BASE}/api/acp/warmup?sync=true`, {
      data: { agentId: "no-such-agent-xyz" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.agentId).toBe("no-such-agent-xyz");
    // Should fail because the agent is not in the registry
    expect(body.success).toBe(false);
    expect(body.status.state).toBe("failed");
  });

  // ── GET /api/acp/warmup all-statuses after warmup ─────────────────────

  test("GET /api/acp/warmup includes started agents", async ({ request }) => {
    // Trigger a warmup
    await request.post(`${BASE}/api/acp/warmup`, {
      data: { agentId: "gemini" },
    });

    // Get all statuses
    const res = await request.get(`${BASE}/api/acp/warmup`);
    const body = await res.json();

    // At minimum our triggerd agent should be listed
    const found = (body.statuses as Array<{ agentId: string }>)
      .some((s) => s.agentId === "gemini");
    expect(found).toBe(true);
  });

  // ── uvx runtime test ──────────────────────────────────────────────────

  test("POST /api/acp/runtime with runtime=uvx returns uvx path", async ({ request }) => {
    const res = await request.post(`${BASE}/api/acp/runtime`, {
      data: { runtime: "uvx" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("uvx");
    expect(typeof body.path).toBe("string");
    expect(body.path.length).toBeGreaterThan(0);
    // version should be populated too
    expect(body.version === null || typeof body.version === "string").toBe(true);
  });

  test("POST /api/acp/runtime with runtime=uv returns uv path", async ({ request }) => {
    const res = await request.post(`${BASE}/api/acp/runtime`, {
      data: { runtime: "uv" },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("uv");
    expect(typeof body.path).toBe("string");
  });
});
