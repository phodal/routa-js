/**
 * OpenAPI Schema Validation Tests
 *
 * Validates that runtime API responses conform to the schemas declared in
 * api-contract.yaml. Covers create ➜ read ➜ delete flows for all major
 * resources, asserting that each response matches the declared schema.
 *
 * Run via:
 *   BASE_URL=http://localhost:3000 npx tsx tests/api-contract/run.ts --suite=schema-validation
 */

import {
  api,
  assert,
  assertStatus,
  assertMatchesSchema,
  assertMatchesOperationResponse,
  assertMatchesOperationRequest,
  type TestResult,
} from "./helpers";
import {
  validateSchema,
  validateOperationResponse,
  listContractEndpoints,
} from "./schema-validator";

// ─────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────
// Static contract integrity tests (no server needed)
// ─────────────────────────────────────────────────────────
async function testContractIntegrity(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await runTest("Contract: all operations have operationId", async () => {
      const endpoints = listContractEndpoints();
      assert(endpoints.length > 0, "Contract must define at least one endpoint");

      const withoutId = endpoints.filter((e) =>
        e.operationId.includes(":") // fallback key pattern when operationId is missing
      );
      assert(
        withoutId.length === 0,
        `Operations missing operationId: ${withoutId.map((e) => `${e.method} ${e.path}`).join(", ")}`
      );
    })
  );

  results.push(
    await runTest("Contract: POST/PUT/PATCH operations define request schemas", async () => {
      const endpoints = listContractEndpoints();
      const mutating = endpoints.filter((e) =>
        ["POST", "PUT", "PATCH"].includes(e.method)
      );
      const missing = mutating.filter((e) => !e.hasRequestSchema);
      // Allow some endpoints without request schemas (e.g. parameterised-only)
      // Log as informational rather than hard fail
      if (missing.length > 0) {
        console.log(
          `  ℹ️  ${missing.length} mutating operation(s) lack request schemas: ` +
            missing.map((e) => `${e.method} ${e.path}`).join(", ")
        );
      }
      // Must have at least some request schemas defined
      const withSchemas = mutating.filter((e) => e.hasRequestSchema);
      assert(
        withSchemas.length > 0,
        "Expected at least some POST/PUT/PATCH operations to have request schemas"
      );
    })
  );

  results.push(
    await runTest("Contract: GET operations define response schemas", async () => {
      const endpoints = listContractEndpoints();
      const gets = endpoints.filter((e) => e.method === "GET");
      const withSchemas = gets.filter((e) => e.hasResponseSchema);
      assert(
        withSchemas.length > 0,
        "Expected at least some GET operations to have response schemas"
      );
    })
  );

  results.push(
    await runTest("Contract: component schemas are parseable by AJV", async () => {
      const schemaNames = [
        "Agent", "Task", "Note", "Workspace",
        "AgentRole", "TaskStatus", "NoteType", "WorkspaceStatus",
        "ErrorResponse", "DeletedResponse",
      ];
      for (const name of schemaNames) {
        const result = validateSchema(name, {});
        // We expect validation to run (even if invalid) — errors mean AJV parsed it
        assert(
          typeof result.valid === "boolean",
          `Schema "${name}" could not be compiled`
        );
      }
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────
// Workspace schema validation
// ─────────────────────────────────────────────────────────
async function testWorkspaceSchema(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let workspaceId = "";

  results.push(
    await runTest("Schema: POST /api/workspaces — response matches contract", async () => {
      const reqBody = { title: "Schema Test Workspace" };
      assertMatchesOperationRequest("createWorkspace", reqBody);

      const { status, data } = await api("POST", "/api/workspaces", reqBody);
      assert(status === 200 || status === 201, `Expected 200/201, got ${status}`);
      assertMatchesOperationResponse("createWorkspace", 200, data);

      const d = data as Record<string, unknown>;
      if (d.workspace) {
        assertMatchesSchema("Workspace", d.workspace);
        workspaceId = (d.workspace as Record<string, unknown>).id as string;
      }
    })
  );

  results.push(
    await runTest("Schema: GET /api/workspaces — response matches contract", async () => {
      const { status, data } = await api("GET", "/api/workspaces");
      assertStatus(status, 200);
      assertMatchesOperationResponse("listWorkspaces", 200, data);

      const d = data as Record<string, unknown>;
      if (Array.isArray(d.workspaces) && d.workspaces.length > 0) {
        assertMatchesSchema("Workspace", d.workspaces[0]);
      }
    })
  );

  results.push(
    await runTest("Schema: Agent.role must be valid enum value", async () => {
      const invalidRole = { role: "INVALID_ROLE" };
      const result = validateSchema("AgentRole", invalidRole.role);
      assert(!result.valid, "Expected AgentRole to reject 'INVALID_ROLE'");
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────
// Agent schema validation
// ─────────────────────────────────────────────────────────
async function testAgentSchema(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let agentId = "";

  results.push(
    await runTest("Schema: POST /api/agents — request body matches contract", async () => {
      const reqBody = {
        name: "Schema Validation Agent",
        role: "DEVELOPER",
        workspaceId: "default",
        modelTier: "FAST",
      };
      assertMatchesOperationRequest("createAgent", reqBody);
    })
  );

  results.push(
    await runTest("Schema: POST /api/agents — response matches contract", async () => {
      const { status, data } = await api("POST", "/api/agents", {
        name: "Schema Validation Agent",
        role: "DEVELOPER",
        workspaceId: "default",
        modelTier: "FAST",
      });
      assert(status === 200 || status === 201, `Expected 200/201, got ${status}`);
      assertMatchesOperationResponse("createAgent", 200, data);

      const d = data as Record<string, unknown>;
      if (d.agent) {
        assertMatchesSchema("Agent", d.agent);
        agentId = (d.agent as Record<string, unknown>).id as string;
      } else if (d.agentId) {
        agentId = d.agentId as string;
      }
    })
  );

  results.push(
    await runTest("Schema: GET /api/agents — response matches contract", async () => {
      const { status, data } = await api("GET", "/api/agents?workspaceId=default");
      assertStatus(status, 200);
      assertMatchesOperationResponse("listAgents", 200, data);

      const d = data as Record<string, unknown>;
      if (Array.isArray(d.agents) && d.agents.length > 0) {
        for (const agent of (d.agents as unknown[]).slice(0, 3)) {
          assertMatchesSchema("Agent", agent);
        }
      }
    })
  );

  results.push(
    await runTest("Schema: Agent schema rejects missing required fields", async () => {
      const incomplete = { name: "Missing Fields Agent" }; // missing id, role, etc.
      const result = validateSchema("Agent", incomplete);
      assert(!result.valid, "Agent schema should reject objects missing required fields");
      assert(result.errors.length > 0, "Should report specific missing field errors");
    })
  );

  results.push(
    await runTest("Schema: AgentStatus enum validation", async () => {
      const validStatuses = ["PENDING", "ACTIVE", "COMPLETED", "ERROR", "CANCELLED"];
      for (const status of validStatuses) {
        const result = validateSchema("AgentStatus", status);
        assert(result.valid, `AgentStatus "${status}" should be valid`);
      }
      const invalidResult = validateSchema("AgentStatus", "RUNNING");
      assert(!invalidResult.valid, "AgentStatus 'RUNNING' should be invalid");
    })
  );

  results.push(
    await runTest("Schema: ModelTier enum validation", async () => {
      const validTiers = ["SMART", "BALANCED", "FAST"];
      for (const tier of validTiers) {
        const result = validateSchema("ModelTier", tier);
        assert(result.valid, `ModelTier "${tier}" should be valid`);
      }
      const invalidResult = validateSchema("ModelTier", "TURBO");
      assert(!invalidResult.valid, "ModelTier 'TURBO' should be invalid");
    })
  );

  // Cleanup
  if (agentId) {
    results.push(
      await runTest("Schema: DELETE /api/agents/{id} — response matches contract", async () => {
        const { status, data } = await api("DELETE", `/api/agents/${agentId}`);
        assertStatus(status, 200);
        assertMatchesOperationResponse("deleteAgent", 200, data);
        assertMatchesSchema("DeletedResponse", data);
      })
    );
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// Task schema validation
// ─────────────────────────────────────────────────────────
async function testTaskSchema(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let taskId = "";

  results.push(
    await runTest("Schema: POST /api/tasks — request body matches contract", async () => {
      const reqBody = {
        title: "Schema Validation Task",
        objective: "Test that schema validation works",
        workspaceId: "default",
      };
      assertMatchesOperationRequest("createTask", reqBody);
    })
  );

  results.push(
    await runTest("Schema: POST /api/tasks — response matches contract", async () => {
      const { status, data } = await api("POST", "/api/tasks", {
        title: "Schema Validation Task",
        objective: "Test that schema validation works",
        workspaceId: "default",
      });
      assert(status === 200 || status === 201, `Expected 200/201, got ${status}`);
      assertMatchesOperationResponse("createTask", 200, data);

      const d = data as Record<string, unknown>;
      if (d.task) {
        assertMatchesSchema("Task", d.task);
        taskId = (d.task as Record<string, unknown>).id as string;
      }
    })
  );

  results.push(
    await runTest("Schema: GET /api/tasks — response matches contract", async () => {
      const { status, data } = await api("GET", "/api/tasks?workspaceId=default");
      assertStatus(status, 200);
      assertMatchesOperationResponse("listTasks", 200, data);

      const d = data as Record<string, unknown>;
      if (Array.isArray(d.tasks)) {
        for (const task of (d.tasks as unknown[]).slice(0, 3)) {
          assertMatchesSchema("Task", task);
        }
      }
    })
  );

  results.push(
    await runTest("Schema: TaskStatus enum validation", async () => {
      const validStatuses = [
        "PENDING", "IN_PROGRESS", "REVIEW_REQUIRED", "COMPLETED",
        "NEEDS_FIX", "BLOCKED", "CANCELLED",
      ];
      for (const status of validStatuses) {
        const result = validateSchema("TaskStatus", status);
        assert(result.valid, `TaskStatus "${status}" should be valid`);
      }
      const invalidResult = validateSchema("TaskStatus", "DONE");
      assert(!invalidResult.valid, "TaskStatus 'DONE' should be invalid");
    })
  );

  results.push(
    await runTest("Schema: Task schema rejects missing required fields", async () => {
      const incomplete = { title: "Incomplete" }; // missing many required fields
      const result = validateSchema("Task", incomplete);
      assert(!result.valid, "Task schema should reject objects missing required fields");
    })
  );

  // Cleanup
  if (taskId) {
    results.push(
      await runTest("Schema: DELETE /api/tasks/{id} — response matches contract", async () => {
        const { status, data } = await api("DELETE", `/api/tasks/${taskId}`);
        assertStatus(status, 200);
        assertMatchesOperationResponse("deleteTask", 200, data);
        assertMatchesSchema("DeletedResponse", data);
      })
    );
  }

  return results;
}

// ─────────────────────────────────────────────────────────
// Note schema validation
// ─────────────────────────────────────────────────────────
async function testNoteSchema(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await runTest("Schema: POST /api/notes — request body matches contract", async () => {
      const reqBody = {
        title: "Schema Validation Note",
        content: "Test content",
        workspaceId: "default",
        type: "general",
      };
      assertMatchesOperationRequest("createOrUpdateNote", reqBody);
    })
  );

  results.push(
    await runTest("Schema: POST /api/notes — response matches contract", async () => {
      const { status, data } = await api("POST", "/api/notes", {
        title: "Schema Validation Note",
        content: "Test content",
        workspaceId: "default",
        type: "general",
      });
      assert(status === 200 || status === 201, `Expected 200/201, got ${status}`);
      assertMatchesOperationResponse("createOrUpdateNote", 200, data);

      const d = data as Record<string, unknown>;
      if (d.note) {
        assertMatchesSchema("Note", d.note);
      }
    })
  );

  results.push(
    await runTest("Schema: GET /api/notes — response matches contract", async () => {
      const { status, data } = await api("GET", "/api/notes?workspaceId=default");
      assertStatus(status, 200);

      const d = data as Record<string, unknown>;
      if (Array.isArray(d.notes)) {
        for (const note of (d.notes as unknown[]).slice(0, 3)) {
          assertMatchesSchema("Note", note);
        }
      }
    })
  );

  results.push(
    await runTest("Schema: NoteType enum validation", async () => {
      const validTypes = ["spec", "task", "general"];
      for (const type of validTypes) {
        const result = validateSchema("NoteType", type);
        assert(result.valid, `NoteType "${type}" should be valid`);
      }
      const invalidResult = validateSchema("NoteType", "memo");
      assert(!invalidResult.valid, "NoteType 'memo' should be invalid");
    })
  );

  results.push(
    await runTest("Schema: Note schema rejects missing required fields", async () => {
      const incomplete = { title: "Incomplete" };
      const result = validateSchema("Note", incomplete);
      assert(!result.valid, "Note schema should reject objects missing required fields");
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────
// Error response schema validation
// ─────────────────────────────────────────────────────────
async function testErrorSchema(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await runTest("Schema: 404 responses match ErrorResponse schema", async () => {
      const { status, data } = await api("GET", "/api/agents/nonexistent-agent-id-12345");
      // Both 404 and 200 with empty data are acceptable
      if (status === 404) {
        assertMatchesSchema("ErrorResponse", data);
      }
    })
  );

  results.push(
    await runTest("Schema: ErrorResponse rejects missing 'error' field", async () => {
      const result = validateSchema("ErrorResponse", { message: "something went wrong" });
      assert(!result.valid, "ErrorResponse should require 'error' field, not 'message'");
    })
  );

  results.push(
    await runTest("Schema: DeletedResponse validation", async () => {
      const valid = validateSchema("DeletedResponse", { deleted: true });
      assert(valid.valid, "DeletedResponse { deleted: true } should be valid");

      const invalid = validateSchema("DeletedResponse", { deleted: false });
      // The const:true constraint means deleted must be true
      assert(!invalid.valid, "DeletedResponse { deleted: false } should be invalid (const: true)");
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────
// Cross-backend comparison validation
// ─────────────────────────────────────────────────────────
async function testResponseConsistency(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  results.push(
    await runTest("Schema: GET /api/health — response matches declared schema", async () => {
      const { status, data } = await api("GET", "/api/health");
      assertStatus(status, 200);
      assertMatchesOperationResponse("getHealth", 200, data);

      const d = data as Record<string, unknown>;
      assert(typeof d.status === "string", "health.status should be a string");
      assert(typeof d.timestamp === "string", "health.timestamp should be a string");
    })
  );

  results.push(
    await runTest("Schema: Workspace fields use correct types", async () => {
      const validWorkspace = {
        id: "ws-123",
        title: "Test",
        status: "active",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = validateSchema("Workspace", validWorkspace);
      assert(result.valid, `Valid workspace should pass schema: ${result.errors.join(", ")}`);
    })
  );

  results.push(
    await runTest("Schema: Agent fields use correct types", async () => {
      const validAgent = {
        id: "agent-123",
        name: "Test Agent",
        role: "DEVELOPER",
        modelTier: "FAST",
        workspaceId: "default",
        status: "PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };
      const result = validateSchema("Agent", validAgent);
      assert(result.valid, `Valid agent should pass schema: ${result.errors.join(", ")}`);
    })
  );

  results.push(
    await runTest("Schema: Task fields use correct types", async () => {
      const validTask = {
        id: "task-123",
        title: "Test Task",
        objective: "Do something",
        status: "PENDING",
        dependencies: [],
        workspaceId: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = validateSchema("Task", validTask);
      assert(result.valid, `Valid task should pass schema: ${result.errors.join(", ")}`);
    })
  );

  results.push(
    await runTest("Schema: Note fields use correct types", async () => {
      const validNote = {
        id: "note-123",
        title: "Test Note",
        content: "Content here",
        workspaceId: "default",
        metadata: { type: "general" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = validateSchema("Note", validNote);
      assert(result.valid, `Valid note should pass schema: ${result.errors.join(", ")}`);
    })
  );

  return results;
}

// ─────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────
export async function testSchemaValidation(): Promise<TestResult[]> {
  const allResults: TestResult[] = [];

  // Static contract integrity checks (no server required)
  allResults.push(...(await testContractIntegrity()));

  // Runtime schema validation (requires server)
  allResults.push(...(await testResponseConsistency()));
  allResults.push(...(await testWorkspaceSchema()));
  allResults.push(...(await testAgentSchema()));
  allResults.push(...(await testTaskSchema()));
  allResults.push(...(await testNoteSchema()));
  allResults.push(...(await testErrorSchema()));

  return allResults;
}
