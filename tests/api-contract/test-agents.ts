/**
 * Agent API contract tests.
 *
 * Tests the /api/agents endpoints for create, list, get, status update, delete.
 * Validates response shapes match the OpenAPI contract.
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

const AGENT_ROLES = ["ROUTA", "CRAFTER", "GATE", "DEVELOPER"];
const AGENT_STATUSES = ["PENDING", "ACTIVE", "COMPLETED", "ERROR", "CANCELLED"];
const MODEL_TIERS = ["SMART", "BALANCED", "FAST"];

export async function testAgents(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let createdAgentId = "";

  // ── POST /api/agents — create agent ──
  results.push(
    await runTest("POST /api/agents — create agent", async () => {
      const { status, data } = await api("POST", "/api/agents", {
        name: "Test Agent",
        role: "DEVELOPER",
        workspaceId: "default",
        modelTier: "FAST",
      });
      // Both backends should return 200 or 201
      assert(status === 200 || status === 201, `Expected 200 or 201, got ${status}`);
      const d = data as Record<string, unknown>;

      // Rust returns { agentId, agent }, Next.js returns { agentId, ... }
      // Check that we get some agent data back
      if (d.agent) {
        const agent = d.agent as Record<string, unknown>;
        validateAgentShape(agent);
        createdAgentId = agent.id as string;
      } else if (d.agentId) {
        createdAgentId = d.agentId as string;
      } else if (d.id) {
        validateAgentShape(d);
        createdAgentId = d.id as string;
      }
      assert(createdAgentId.length > 0, "Should return an agent ID");
    })
  );

  // ── GET /api/agents — list agents ──
  results.push(
    await runTest("GET /api/agents — list agents", async () => {
      const { status, data } = await api("GET", "/api/agents?workspaceId=default");
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      // Response should have agents array
      assertArrayField(d, "agents");
      const agents = d.agents as Record<string, unknown>[];
      assert(agents.length > 0, "Should have at least 1 agent");
    })
  );

  // ── GET /api/agents?id=xxx — get single agent via query ──
  results.push(
    await runTest("GET /api/agents?id=xxx — get agent by query", async () => {
      if (!createdAgentId) throw new Error("Depends on create test");
      const { status, data } = await api(
        "GET",
        `/api/agents?id=${createdAgentId}`
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      // Should return agent data (shape may vary between backends)
      assert(d !== null, "Should return agent data");
    })
  );

  // ── POST /api/agents/{id}/status — update status ──
  results.push(
    await runTest("POST /api/agents/{id}/status — update status", async () => {
      if (!createdAgentId) throw new Error("Depends on create test");
      const { status, data } = await api(
        "POST",
        `/api/agents/${createdAgentId}/status`,
        { status: "ACTIVE" }
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assert(d.updated === true, "Should return updated: true");
    })
  );

  // ── DELETE /api/agents/{id} — delete agent ──
  results.push(
    await runTest("DELETE /api/agents/{id} — delete agent", async () => {
      if (!createdAgentId) throw new Error("Depends on create test");
      const { status, data } = await api(
        "DELETE",
        `/api/agents/${createdAgentId}`
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assert(d.deleted === true, "Should return deleted: true");
    })
  );

  return results;
}

function validateAgentShape(agent: Record<string, unknown>) {
  assert(typeof agent.id === "string", "agent.id should be string");
  assert(typeof agent.name === "string", "agent.name should be string");
  assertEnum(agent.role as string, AGENT_ROLES, "agent.role");
  assertEnum(agent.modelTier as string, MODEL_TIERS, "agent.modelTier");
  assertEnum(agent.status as string, AGENT_STATUSES, "agent.status");
  assert(typeof agent.workspaceId === "string", "agent.workspaceId should be string");
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
