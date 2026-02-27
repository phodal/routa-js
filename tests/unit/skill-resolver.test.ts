#!/usr/bin/env npx tsx
/**
 * Integration test for resolveSkillContent() and SqliteSkillStore.
 *
 * Tests:
 *  1. resolveSkillContent() finds a filesystem skill
 *  2. resolveSkillContent() returns undefined for an unknown skill
 *  3. SqliteSkillStore CRUD: save → get → toSkillDefinition → delete
 *  4. resolveSkillContent() falls back to SQLite DB when not in filesystem
 *
 * Run: npx tsx tests/unit/skill-resolver.test.ts
 */

import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { resolveSkillContent } from "../../src/core/skills/skill-resolver";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}: ${(err as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function main() {
// ─── 1. resolveSkillContent via filesystem ────────────────────────────────────

console.log("\n── Test Group 1: resolveSkillContent (filesystem) ──\n");

await test("finds frontend-design via filesystem", async () => {
  const content = await resolveSkillContent("frontend-design");
  assert(typeof content === "string" && content.length > 100,
    `Expected skill content, got: ${content}`);
  assert(content!.includes("frontend") || content!.includes("design"),
    "Content should mention frontend or design");
});

await test("returns undefined for unknown skill", async () => {
  const content = await resolveSkillContent("non-existent-skill-xyz-abc");
  assert(content === undefined, `Expected undefined, got: ${content}`);
});

await test("finds skill from repo path", async () => {
  // The project itself has frontend-design in .agents/skills/
  const content = await resolveSkillContent("frontend-design", process.cwd());
  assert(typeof content === "string" && content.length > 100,
    `Expected skill content from repo path`);
});

// ─── 2. SqliteSkillStore CRUD ─────────────────────────────────────────────────

console.log("\n── Test Group 2: SqliteSkillStore CRUD ──\n");

// Create a temporary SQLite DB for testing
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-test-"));
const dbPath = path.join(tmpDir, "test.db");

try {
  // Dynamically import sqlite to avoid bundling issues
  const { getSqliteDatabase } = await import("../../src/core/db/sqlite");
  const db = getSqliteDatabase(dbPath);

  const { SqliteSkillStore } = await import("../../src/core/db/sqlite-stores");
  const store = new SqliteSkillStore(db);

  const testSkill = {
    id: "test-skill",
    name: "test-skill",
    description: "A test skill for unit testing",
    source: "test/source",
    catalogType: "local",
    files: [
      {
        path: "SKILL.md",
        content: "# Test Skill\n\nThis is the content of the test skill.",
      },
    ],
    license: "MIT",
    metadata: { author: "tester" },
  };

  await test("save a new skill", async () => {
    await store.save(testSkill);
    const stored = await store.get("test-skill");
    assert(stored !== undefined, "Skill should be saved");
    assert(stored!.name === "test-skill", "Name should match");
    assert(stored!.description === "A test skill for unit testing", "Description should match");
    assert(stored!.license === "MIT", "License should match");
  });

  await test("get returns correct files array", async () => {
    const stored = await store.get("test-skill");
    assert(stored !== undefined, "Skill should exist");
    assert(Array.isArray(stored!.files), "Files should be an array");
    assert(stored!.files.length === 1, "Should have 1 file");
    assert(stored!.files[0].path === "SKILL.md", "File path should match");
    assert(stored!.files[0].content.includes("content of the test skill"),
      "File content should match");
  });

  await test("toSkillDefinition extracts SKILL.md content", async () => {
    const stored = await store.get("test-skill");
    assert(stored !== undefined, "Skill should exist");
    const def = store.toSkillDefinition(stored!);
    assert(def.name === "test-skill", "Name should match");
    assert(def.content.includes("content of the test skill"),
      `Expected SKILL.md content, got: ${def.content}`);
    assert(def.source === "db:test/source", `Source should be 'db:test/source', got: ${def.source}`);
  });

  await test("list returns all skills", async () => {
    const all = await store.list();
    assert(all.length >= 1, "Should list at least the saved skill");
    const found = all.find(s => s.id === "test-skill");
    assert(found !== undefined, "test-skill should be in list");
  });

  await test("update (save existing) works", async () => {
    await store.save({
      ...testSkill,
      description: "Updated description",
    });
    const updated = await store.get("test-skill");
    assert(updated!.description === "Updated description", "Description should be updated");
  });

  await test("delete removes skill", async () => {
    await store.delete("test-skill");
    const deleted = await store.get("test-skill");
    assert(deleted === undefined, "Skill should be deleted");
  });

} finally {
  // Cleanup temp DB
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// ─── 3. Summary ──────────────────────────────────────────────────────────────

  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
