/**
 * Tests for file-changes-tracker.ts
 * Run with: npx tsx src/client/utils/__tests__/file-changes-tracker.test.ts
 */

import {
  createFileChangesState,
  updateFileChange,
  extractFileChangeFromToolResult,
  extractFilesModified,
  getFileChangesSummary,
  type FileChange,
} from "../file-changes-tracker";

// Simple test framework
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}`);
    console.error(`  Error: ${e instanceof Error ? e.message : e}`);
    failed++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
    },
    toBeUndefined() {
      if (actual !== undefined) throw new Error(`Expected undefined, got ${actual}`);
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toHaveLength(length: number) {
      if (!Array.isArray(actual)) throw new Error("Expected array");
      if (actual.length !== length) throw new Error(`Expected length ${length}, got ${actual.length}`);
    },
  };
}

// Tests
console.log("\n=== Testing file-changes-tracker.ts ===\n");

test("createFileChangesState: creates empty state", () => {
  const state = createFileChangesState();
  expect(state.files.size).toBe(0);
  expect(state.totalAdded).toBe(0);
  expect(state.totalRemoved).toBe(0);
});

test("updateFileChange: adds new file change", () => {
  let state = createFileChangesState();
  const change: FileChange = {
    path: "src/test.ts",
    linesAdded: 10,
    linesRemoved: 5,
    operation: "modified",
  };
  state = updateFileChange(state, change);
  expect(state.files.size).toBe(1);
  expect(state.totalAdded).toBe(10);
  expect(state.totalRemoved).toBe(5);
});

test("updateFileChange: accumulates changes for same file", () => {
  let state = createFileChangesState();
  state = updateFileChange(state, { path: "src/test.ts", linesAdded: 10, linesRemoved: 5, operation: "modified" });
  state = updateFileChange(state, { path: "src/test.ts", linesAdded: 5, linesRemoved: 2, operation: "modified" });
  expect(state.files.size).toBe(1);
  const file = state.files.get("src/test.ts")!;
  expect(file.linesAdded).toBe(15);
  expect(file.linesRemoved).toBe(7);
  expect(state.totalAdded).toBe(15);
  expect(state.totalRemoved).toBe(7);
});

test("updateFileChange: tracks multiple files", () => {
  let state = createFileChangesState();
  state = updateFileChange(state, { path: "file1.ts", linesAdded: 10, linesRemoved: 0, operation: "created" });
  state = updateFileChange(state, { path: "file2.ts", linesAdded: 20, linesRemoved: 5, operation: "modified" });
  expect(state.files.size).toBe(2);
  expect(state.totalAdded).toBe(30);
  expect(state.totalRemoved).toBe(5);
});

test("extractFileChangeFromToolResult: returns null without path", () => {
  const result = extractFileChangeFromToolResult("Edit", "some output", {});
  expect(result).toBe(null);
});

test("extractFileChangeFromToolResult: extracts from Write tool", () => {
  const result = extractFileChangeFromToolResult(
    "Write",
    "File created successfully",
    { path: "src/new-file.ts", content: "line1\nline2\nline3" }
  );
  expect(result?.path).toBe("src/new-file.ts");
  expect(result?.operation).toBe("created");
  expect(result?.linesAdded).toBe(3);
});

test("extractFileChangeFromToolResult: extracts from Edit tool with diff", () => {
  const result = extractFileChangeFromToolResult(
    "Edit",
    "Changes applied +15 -8",
    { path: "src/modified.ts" }
  );
  expect(result?.path).toBe("src/modified.ts");
  expect(result?.operation).toBe("modified");
  expect(result?.linesAdded).toBe(15);
  expect(result?.linesRemoved).toBe(8);
});

test("extractFileChangeFromToolResult: handles delete tool", () => {
  const result = extractFileChangeFromToolResult(
    "delete-file",
    "File deleted",
    { path: "src/old.ts" }
  );
  expect(result?.operation).toBe("deleted");
});

test("extractFilesModified: extracts from array", () => {
  const changes = extractFilesModified(["file1.ts", "file2.ts", "file3.ts"]);
  expect(changes).toHaveLength(3);
  expect(changes[0].path).toBe("file1.ts");
  expect(changes[0].operation).toBe("modified");
});

test("extractFilesModified: returns empty for undefined", () => {
  const changes = extractFilesModified(undefined);
  expect(changes).toHaveLength(0);
});

test("getFileChangesSummary: returns correct summary", () => {
  let state = createFileChangesState();
  state = updateFileChange(state, { path: "f1.ts", linesAdded: 100, linesRemoved: 50, operation: "modified" });
  state = updateFileChange(state, { path: "f2.ts", linesAdded: 50, linesRemoved: 10, operation: "created" });
  const summary = getFileChangesSummary(state);
  expect(summary.fileCount).toBe(2);
  expect(summary.totalAdded).toBe(150);
  expect(summary.totalRemoved).toBe(60);
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
// Note: process.exit is not needed in vitest

