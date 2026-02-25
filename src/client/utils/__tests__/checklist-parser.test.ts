/**
 * Tests for checklist-parser.ts
 * Run with: npx tsx src/client/utils/__tests__/checklist-parser.test.ts
 */

import { parseChecklist, hasChecklist, countChecklistStats } from "../checklist-parser";

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
console.log("\n=== Testing checklist-parser.ts ===\n");

test("parseChecklist: parses pending items (- [ ])", () => {
  const content = "- [ ] Task 1\n- [ ] Task 2";
  const items = parseChecklist(content);
  expect(items).toHaveLength(2);
  expect(items[0].status).toBe("pending");
  expect(items[0].text).toBe("Task 1");
  expect(items[1].status).toBe("pending");
});

test("parseChecklist: parses completed items (- [x] and - [X])", () => {
  const content = "- [x] Done task\n- [X] Also done";
  const items = parseChecklist(content);
  expect(items).toHaveLength(2);
  expect(items[0].status).toBe("completed");
  expect(items[1].status).toBe("completed");
});

test("parseChecklist: parses in-progress items (- [/])", () => {
  const content = "- [/] Working on this";
  const items = parseChecklist(content);
  expect(items).toHaveLength(1);
  expect(items[0].status).toBe("in_progress");
  expect(items[0].text).toBe("Working on this");
});

test("parseChecklist: parses cancelled items (- [-])", () => {
  const content = "- [-] Cancelled task";
  const items = parseChecklist(content);
  expect(items).toHaveLength(1);
  expect(items[0].status).toBe("cancelled");
});

test("parseChecklist: parses mixed status items", () => {
  const content = `
- [ ] Pending task
- [x] Completed task  
- [/] In progress task
- [-] Cancelled task
`;
  const items = parseChecklist(content);
  expect(items).toHaveLength(4);
  expect(items[0].status).toBe("pending");
  expect(items[1].status).toBe("completed");
  expect(items[2].status).toBe("in_progress");
  expect(items[3].status).toBe("cancelled");
});

test("parseChecklist: handles asterisk bullet points", () => {
  const content = "* [ ] Task with asterisk";
  const items = parseChecklist(content);
  expect(items).toHaveLength(1);
  expect(items[0].text).toBe("Task with asterisk");
});

test("parseChecklist: handles indented items", () => {
  const content = "  - [ ] Indented task\n\t- [x] Tab indented";
  const items = parseChecklist(content);
  expect(items).toHaveLength(2);
});

test("hasChecklist: returns true when checklist exists", () => {
  expect(hasChecklist("- [ ] Task")).toBe(true);
  expect(hasChecklist("- [x] Done")).toBe(true);
});

test("hasChecklist: returns false when no checklist", () => {
  expect(hasChecklist("Regular text")).toBe(false);
  expect(hasChecklist("- No brackets")).toBe(false);
});

test("countChecklistStats: counts all statuses correctly", () => {
  const items = parseChecklist(`
- [ ] Pending 1
- [ ] Pending 2
- [x] Done 1
- [x] Done 2
- [x] Done 3
- [/] In progress
- [-] Cancelled
`);
  const stats = countChecklistStats(items);
  expect(stats.total).toBe(7);
  expect(stats.pending).toBe(2);
  expect(stats.completed).toBe(3);
  expect(stats.inProgress).toBe(1);
  expect(stats.cancelled).toBe(1);
});

test("parseChecklist: returns empty array for no checklist content", () => {
  const items = parseChecklist("Just some regular text");
  expect(items).toHaveLength(0);
});

// Summary
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
// Note: process.exit is not needed in vitest

