#!/usr/bin/env npx tsx
/**
 * Unit test for NoteTools.
 *
 * Tests that:
 * 1. setNoteContent auto-converts @@@task blocks for spec note
 * 2. setNoteContent returns taskIds in response
 * 3. setNoteContent respects autoConvertTasks: false
 * 4. Non-spec notes don't auto-convert by default
 *
 * Run: npx tsx tests/unit/note-tools.test.ts
 */

import { NoteTools } from "../../src/core/tools/note-tools";
import { InMemoryNoteStore } from "../../src/core/store/note-store";
import { InMemoryTaskStore } from "../../src/core/store/task-store";
import { SPEC_NOTE_ID } from "../../src/core/models/note";

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
// Setup
// ─────────────────────────────────────────────────────────────────────────────

function createTestNoteTools(): {
  noteStore: InMemoryNoteStore;
  taskStore: InMemoryTaskStore;
  noteTools: NoteTools;
} {
  const noteStore = new InMemoryNoteStore();
  const taskStore = new InMemoryTaskStore();
  const noteTools = new NoteTools(noteStore, taskStore);
  return { noteStore, taskStore, noteTools };
}

const WORKSPACE_ID = "test-workspace";

const CONTENT_WITH_TASK_BLOCKS = `# Project Spec

## Goal
Implement feature X

@@@task
# Implement Feature X
## Objective
Build the feature

## Scope
src/features/x.ts

## Definition of Done
- Feature works
- Tests pass

## Verification
npm test
@@@

## Notes
Some additional notes here.
`;

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Spec note auto-converts @@@task blocks
// ─────────────────────────────────────────────────────────────────────────────
runTest("setNoteContent auto-converts @@@task blocks for spec note", async () => {
  const { noteTools, taskStore } = createTestNoteTools();

  const result = await noteTools.setNoteContent({
    noteId: SPEC_NOTE_ID,
    workspaceId: WORKSPACE_ID,
    content: CONTENT_WITH_TASK_BLOCKS,
  });

  assert(result.success, `Expected success, got error: ${result.error}`);
  const data = result.data as Record<string, unknown>;
  assert(data.tasksCreated === 1, `Expected 1 task created, got ${data.tasksCreated}`);
  assert(Array.isArray(data.tasks), "Expected tasks array in response");

  const tasks = data.tasks as Array<{ taskId: string; title: string }>;
  assert(tasks.length === 1, `Expected 1 task, got ${tasks.length}`);
  assert(tasks[0].title === "Implement Feature X", `Expected title 'Implement Feature X', got '${tasks[0].title}'`);

  // Verify task was actually created in TaskStore
  const storedTasks = await taskStore.listByWorkspace(WORKSPACE_ID);
  assert(storedTasks.length === 1, `Expected 1 task in store, got ${storedTasks.length}`);
  assert(storedTasks[0].title === "Implement Feature X", "Task title should match");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: setNoteContent with autoConvertTasks: false should skip conversion
// ─────────────────────────────────────────────────────────────────────────────
runTest("setNoteContent with autoConvertTasks: false skips conversion", async () => {
  const { noteTools, taskStore } = createTestNoteTools();

  const result = await noteTools.setNoteContent({
    noteId: SPEC_NOTE_ID,
    workspaceId: WORKSPACE_ID,
    content: CONTENT_WITH_TASK_BLOCKS,
    autoConvertTasks: false,
  });

  assert(result.success, `Expected success, got error: ${result.error}`);
  const data = result.data as Record<string, unknown>;
  assert(data.tasksCreated === undefined, "Should not have tasksCreated when autoConvert is false");

  // Verify no task was created
  const storedTasks = await taskStore.listByWorkspace(WORKSPACE_ID);
  assert(storedTasks.length === 0, `Expected 0 tasks in store, got ${storedTasks.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Non-spec note does not auto-convert by default
// ─────────────────────────────────────────────────────────────────────────────
runTest("Non-spec note does not auto-convert @@@task blocks by default", async () => {
  const { noteTools, taskStore } = createTestNoteTools();

  // First create the note
  await noteTools.createNote({
    noteId: "my-general-note",
    title: "General Note",
    workspaceId: WORKSPACE_ID,
    type: "general",
  });

  const result = await noteTools.setNoteContent({
    noteId: "my-general-note",
    workspaceId: WORKSPACE_ID,
    content: CONTENT_WITH_TASK_BLOCKS,
  });

  assert(result.success, `Expected success, got error: ${result.error}`);
  const data = result.data as Record<string, unknown>;
  assert(data.tasksCreated === undefined, "Should not auto-convert for non-spec note");

  // Verify no task was created
  const storedTasks = await taskStore.listByWorkspace(WORKSPACE_ID);
  assert(storedTasks.length === 0, `Expected 0 tasks in store, got ${storedTasks.length}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Run and report
// ─────────────────────────────────────────────────────────────────────────────
setTimeout(() => {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Tests passed: ${testsPassed}`);
  console.log(`Tests failed: ${testsFailed}`);
  process.exit(testsFailed > 0 ? 1 : 0);
}, 100);

