/**
 * E2E tests for the ACP Runtime API
 *
 * Tests the Next.js /api/acp/runtime endpoints:
 *   GET  /api/acp/runtime  → returns platform + all 4 runtime statuses
 *   POST /api/acp/runtime  → ensures a runtime (returns path)
 */

import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";

test.describe("ACP Runtime API", () => {
  // ── GET /api/acp/runtime ──────────────────────────────────────────────

  test("GET /api/acp/runtime returns platform and runtimes object", async ({ request }) => {
    const response = await request.get(`${BASE}/api/acp/runtime`);
    expect(response.status()).toBe(200);

    const body = await response.json();

    // Platform field must be one of the known values
    expect(body.platform).toMatch(
      /^(darwin|linux|windows)-(aarch64|x86_64)$/
    );

    // Runtimes object must contain all four keys
    expect(body.runtimes).toBeDefined();
    for (const rt of ["node", "npx", "uv", "uvx"]) {
      expect(Object.prototype.hasOwnProperty.call(body.runtimes, rt)).toBe(true);
    }
  });

  test("GET /api/acp/runtime shows node and npx as available (system)", async ({ request }) => {
    const response = await request.get(`${BASE}/api/acp/runtime`);
    expect(response.status()).toBe(200);

    const body = await response.json();

    // In CI / dev the machine running Next.js will have node/npx available
    // (the app itself runs on Node.js so node must be present)
    const nodeInfo = body.runtimes.node;
    if (nodeInfo !== null) {
      expect(nodeInfo.available).toBe(true);
      expect(typeof nodeInfo.path).toBe("string");
      expect(nodeInfo.path.length).toBeGreaterThan(0);
    }

    const npxInfo = body.runtimes.npx;
    if (npxInfo !== null) {
      expect(npxInfo.available).toBe(true);
      expect(typeof npxInfo.path).toBe("string");
    }
  });

  test("GET /api/acp/runtime response shape is consistent", async ({ request }) => {
    const response = await request.get(`${BASE}/api/acp/runtime`);
    const body = await response.json();

    // Each non-null runtime entry must have the required fields
    for (const [, info] of Object.entries(body.runtimes)) {
      if (info !== null) {
        const entry = info as Record<string, unknown>;
        expect(typeof entry.runtime).toBe("string");
        expect(typeof entry.path).toBe("string");
        expect(typeof entry.managed).toBe("boolean");
        expect(entry.available).toBe(true);
      }
    }
  });

  // ── POST /api/acp/runtime ─────────────────────────────────────────────

  test("POST /api/acp/runtime with runtime=node returns node path", async ({ request }) => {
    const response = await request.post(`${BASE}/api/acp/runtime`, {
      data: { runtime: "node" },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("node");
    expect(typeof body.path).toBe("string");
    expect(body.path.length).toBeGreaterThan(0);
  });

  test("POST /api/acp/runtime with runtime=npx returns npx path", async ({ request }) => {
    const response = await request.post(`${BASE}/api/acp/runtime`, {
      data: { runtime: "npx" },
    });
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.runtime).toBe("npx");
    expect(typeof body.path).toBe("string");
  });

  test("POST /api/acp/runtime with invalid runtime returns 400", async ({ request }) => {
    const response = await request.post(`${BASE}/api/acp/runtime`, {
      data: { runtime: "deno" },
    });
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(typeof body.error).toBe("string");
  });

  test("POST /api/acp/runtime with missing runtime returns 400", async ({ request }) => {
    const response = await request.post(`${BASE}/api/acp/runtime`, {
      data: {},
    });
    expect(response.status()).toBe(400);
  });

  // ── Browser smoke test ────────────────────────────────────────────────

  test("runtime status is visible via browser fetch in page context", async ({ page }) => {
    // Navigate to any page on the app
    await page.goto(`${BASE}/`);

    // Call the API from within the browser JS context
    const result = await page.evaluate(async () => {
      const res = await fetch("/api/acp/runtime");
      return res.json();
    });

    expect(result.platform).toMatch(/^(darwin|linux|windows)-(aarch64|x86_64)$/);
    expect(result.runtimes).toBeDefined();
  });
});
