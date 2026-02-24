#!/usr/bin/env npx tsx
/**
 * Unit test for RoutaOrchestrator.
 * 
 * Tests that:
 * 1. Task not found errors include helpful hints
 * 2. Errors differentiate between UUID-like and name-like taskIds
 * 3. Unknown specialist returns helpful error
 * 
 * Run: npx tsx tests/unit/orchestrator.test.ts
 */

import { createInMemorySystem, RoutaSystem } from "../../src/core/routa-system";
import { RoutaOrchestrator, OrchestratorConfig } from "../../src/core/orchestration/orchestrator";
import { AcpProcessManager } from "../../src/core/acp/acp-process-manager";
import { createTask, TaskStatus } from "../../src/core/models/task";
import { v4 as uuidv4 } from "uuid";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock AcpProcessManager
// ─────────────────────────────────────────────────────────────────────────────

class MockAcpProcessManager {
  async createSession(): Promise<string> {
    return "mock-session-id";
  }
  async createClaudeSession(): Promise<string> {
    return "mock-claude-session-id";
  }
  getProcess(): null {
    return null;
  }
  getClaudeProcess(): null {
    return null;
  }
  killSession(): void {}
  isClaudeSession(): boolean {
    return false;
  }
  isOpencodeAdapterSession(): boolean {
    return false;
  }
  getOpencodeAdapter(): null {
    return null;
  }
  getAcpSessionId(): string | undefined {
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

function createTestOrchestrator(): { system: RoutaSystem; orchestrator: RoutaOrchestrator } {
  const system = createInMemorySystem();
  const mockProcessManager = new MockAcpProcessManager() as unknown as AcpProcessManager;
  const config: OrchestratorConfig = {
    defaultCrafterProvider: "opencode",
    defaultGateProvider: "opencode",
    defaultCwd: "/tmp/test",
  };
  const orchestrator = new RoutaOrchestrator(system, mockProcessManager, config);
  return { system, orchestrator };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Task not found with task name (not UUID)
// ─────────────────────────────────────────────────────────────────────────────
runTest("Task not found with task name shows helpful hint", async () => {
  const { orchestrator } = createTestOrchestrator();

  const result = await orchestrator.delegateTaskWithSpawn({
    taskId: "openspec-ts-enhance-types-parser", // This looks like a task name, not UUID
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "CRAFTER",
  });

  assert(!result.success, "Expected error result");
  assert(result.error !== undefined, "Expected error message");
  const error1 = result.error!;
  assert(
    error1.includes("looks like a task name, not a UUID"),
    `Expected hint about task name vs UUID, got: ${error1}`
  );
  assert(
    error1.includes("create_task"),
    `Expected mention of create_task, got: ${error1}`
  );
  assert(
    error1.includes("convert_task_blocks"),
    `Expected mention of convert_task_blocks, got: ${error1}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Task not found with UUID-like ID
// ─────────────────────────────────────────────────────────────────────────────
runTest("Task not found with UUID shows different hint", async () => {
  const { orchestrator } = createTestOrchestrator();

  const fakeUuid = "dda97509-b414-4c50-9835-73a1ec2f0001";
  const result = await orchestrator.delegateTaskWithSpawn({
    taskId: fakeUuid,
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "CRAFTER",
  });

  assert(!result.success, "Expected error result");
  assert(result.error !== undefined, "Expected error message");
  const error2 = result.error!;
  // Should NOT say "looks like a task name"
  assert(
    !error2.includes("looks like a task name"),
    `Should not mention task name for UUID, got: ${error2}`
  );
  assert(
    error2.includes("list_tasks") || error2.includes("create_task"),
    `Expected hint about list_tasks or create_task, got: ${error2}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Unknown specialist error
// ─────────────────────────────────────────────────────────────────────────────
runTest("Unknown specialist returns helpful error", async () => {
  const { orchestrator } = createTestOrchestrator();

  const result = await orchestrator.delegateTaskWithSpawn({
    taskId: uuidv4(),
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "UNKNOWN_SPECIALIST",
  });

  assert(!result.success, "Expected error result");
  assert(result.error !== undefined, "Expected error message");
  const error3 = result.error!;
  assert(
    error3.includes("Unknown specialist"),
    `Expected unknown specialist error, got: ${error3}`
  );
  assert(
    error3.includes("CRAFTER") || error3.includes("GATE"),
    `Expected valid specialist suggestions, got: ${error3}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: Valid task exists - should not return task not found
// ─────────────────────────────────────────────────────────────────────────────
runTest("Valid task ID should proceed (may fail at spawn, not at task lookup)", async () => {
  const { system, orchestrator } = createTestOrchestrator();

  // Create a real task
  const taskId = uuidv4();
  const task = createTask({
    id: taskId,
    title: "Test Task",
    objective: "Test objective",
    workspaceId: "ws-123",
  });
  await system.taskStore.save(task);

  const result = await orchestrator.delegateTaskWithSpawn({
    taskId,
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "CRAFTER",
  });

  // The task lookup should succeed.
  // It may fail later (e.g., at agent creation or spawn), but NOT with "Task not found"
  if (!result.success && result.error) {
    assert(
      !result.error.includes("Task not found"),
      `Should not get Task not found for existing task, got: ${result.error}`
    );
  }
  // If it succeeds, that's also fine for this test
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Kebab-case task names detected
// ─────────────────────────────────────────────────────────────────────────────
runTest("Kebab-case task name is detected as non-UUID", async () => {
  const { orchestrator } = createTestOrchestrator();

  const result = await orchestrator.delegateTaskWithSpawn({
    taskId: "my-awesome-task-name",
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "CRAFTER",
  });

  assert(!result.success, "Expected error result");
  assert(result.error !== undefined, "Expected error message");
  const error5 = result.error!;
  assert(
    error5.includes("looks like a task name"),
    `Expected task name detection, got: ${error5}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: Camel-case task names detected
// ─────────────────────────────────────────────────────────────────────────────
runTest("CamelCase task name is detected as non-UUID", async () => {
  const { orchestrator } = createTestOrchestrator();

  const result = await orchestrator.delegateTaskWithSpawn({
    taskId: "MyAwesomeTaskName",
    callerAgentId: "agent-123",
    callerSessionId: "session-123",
    workspaceId: "ws-123",
    specialist: "CRAFTER",
  });

  assert(!result.success, "Expected error result");
  assert(result.error !== undefined, "Expected error message");
  const error6 = result.error!;
  assert(
    error6.includes("looks like a task name"),
    `Expected task name detection, got: ${error6}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
Promise.resolve().then(async () => {
  // Wait for all tests to complete
  await new Promise(resolve => setTimeout(resolve, 500));
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);
  process.exit(testsFailed > 0 ? 1 : 0);
});

