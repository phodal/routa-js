/**
 * Workspace API contract tests.
 *
 * Tests the /api/workspaces endpoints against whichever backend is running.
 */

import {
  api,
  assert,
  assertStatus,
  assertHasField,
  assertArrayField,
  assertEnum,
  type TestResult,
} from "./helpers";

export async function testWorkspaces(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let createdId = "";

  // ── GET /api/workspaces — list ──
  results.push(
    await runTest("GET /api/workspaces — list workspaces", async () => {
      const { status, data } = await api("GET", "/api/workspaces");
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertArrayField(d, "workspaces");
    })
  );

  // ── POST /api/workspaces — create ──
  results.push(
    await runTest("POST /api/workspaces — create workspace", async () => {
      const { status, data } = await api("POST", "/api/workspaces", {
        title: "Test Workspace",
        repoPath: "/tmp/test-repo",
        branch: "main",
      });
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertHasField(d, "workspace");
      const ws = d.workspace as Record<string, unknown>;
      assert(ws.title === "Test Workspace", "Title should match");
      assertEnum(ws.status as string, ["active", "archived"], "status");
      assert(typeof ws.id === "string" && ws.id.length > 0, "Should have id");
      createdId = ws.id as string;
    })
  );

  // ── GET /api/workspaces/{id} — get single ──
  results.push(
    await runTest("GET /api/workspaces/{id} — get workspace", async () => {
      if (!createdId) throw new Error("Depends on create test");
      const { status, data } = await api("GET", `/api/workspaces/${createdId}`);
      assertStatus(status, 200);
      const ws = data as Record<string, unknown>;
      assert(ws.id === createdId, "ID should match");
      assert(ws.title === "Test Workspace", "Title should match");
    })
  );

  // ── GET /api/workspaces/{id} — not found ──
  results.push(
    await runTest("GET /api/workspaces/{id} — 404 for missing", async () => {
      const { status } = await api("GET", "/api/workspaces/nonexistent-id-12345");
      assertStatus(status, 404);
    })
  );

  // ── DELETE /api/workspaces/{id} — delete ──
  results.push(
    await runTest("DELETE /api/workspaces/{id} — delete workspace", async () => {
      if (!createdId) throw new Error("Depends on create test");
      const { status, data } = await api("DELETE", `/api/workspaces/${createdId}`);
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assert(d.deleted === true, "Should return deleted: true");
    })
  );

  return results;
}

async function runTest(
  name: string,
  fn: () => Promise<void>
): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return { name, passed: true, duration: Date.now() - start };
  } catch (err) {
    return {
      name,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      duration: Date.now() - start,
    };
  }
}
