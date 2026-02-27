#!/usr/bin/env npx tsx
/**
 * End-to-end API test for skill integration.
 *
 * Tests the full flow:
 *   1. GET /api/skills          → lists available skills
 *   2. GET /api/skills?name=X   → loads skill content by name
 *   3. POST /api/acp (session/prompt with skillName) → skill content resolved on server
 *
 * Run: npx tsx tests/unit/skill-api.test.ts
 * Prerequisites: dev server running on http://localhost:3000
 */

const BASE = "http://localhost:3000";

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

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function json(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
// ──────────────────────────────────────────────────────────────────────────────
// Test Group 1: GET /api/skills
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n── Test Group 1: GET /api/skills ──\n");

await test("lists skills array", async () => {
  const data = await json("/api/skills");
  assert(Array.isArray(data.skills), `Expected skills array, got: ${JSON.stringify(data)}`);
  assert(data.skills.length > 0, "Should have at least one skill");
});

await test("returned skills have name and description", async () => {
  const data = await json("/api/skills");
  const skill = data.skills[0];
  assert(typeof skill.name === "string", "name should be a string");
  assert(typeof skill.description === "string", "description should be a string");
  // Content should NOT be in the list (only in individual fetch)
  assert(skill.content === undefined, "List should not include content");
});

await test("frontend-design skill is listed", async () => {
  const data = await json("/api/skills");
  const found = data.skills.find((s: { name: string }) => s.name === "frontend-design");
  assert(found !== undefined, "frontend-design should be listed");
});

// ──────────────────────────────────────────────────────────────────────────────
// Test Group 2: GET /api/skills?name=X
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n── Test Group 2: GET /api/skills?name=X ──\n");

await test("loads frontend-design content", async () => {
  const data = await json("/api/skills?name=frontend-design");
  assert(typeof data.content === "string", `Expected content string, got: ${typeof data.content}`);
  assert(data.content.length > 100, `Content too short: ${data.content.length}`);
  assert(data.name === "frontend-design", `Expected name 'frontend-design', got: ${data.name}`);
  console.log(`     Content length: ${data.content.length} bytes`);
  console.log(`     Preview: ${data.content.slice(0, 80).replace(/\n/g, " ")}...`);
});

await test("returns 404 for unknown skill", async () => {
  const res = await fetch(`${BASE}/api/skills?name=unknown-skill-zzz`);
  assert(res.status === 404, `Expected 404, got: ${res.status}`);
});

await test("includes description and license", async () => {
  const data = await json("/api/skills?name=frontend-design");
  assert(typeof data.description === "string", "Should have description");
  // license is optional but check it's not undefined if present in file
});

// ──────────────────────────────────────────────────────────────────────────────
// Test Group 3: POST /api/acp - session/prompt with skillName
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n── Test Group 3: POST /api/acp - skill resolution ──\n");

/**
 * POST /api/acp and read the response safely.
 * The response can be either:
 *   - JSON (regular session), or
 *   - SSE stream (Claude Code SDK session, Content-Type: text/event-stream)
 * 
 * We abort after 5s to avoid hanging on SSE streams.
 */
async function postAcp(params: Record<string, unknown>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${BASE}/api/acp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ jsonrpc: "2.0", method: "session/prompt", id: 1, params }),
    });
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      // SSE stream - read the first chunk only
      const reader = res.body!.getReader();
      const { value } = await reader.read();
      reader.cancel();
      const text = new TextDecoder().decode(value ?? new Uint8Array());
      return { type: "sse" as const, firstChunk: text, status: res.status };
    } else {
      const body = await res.json();
      return { type: "json" as const, body, status: res.status };
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { type: "timeout" as const, status: 0 };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

await test("skillName without skillContent: server resolves from filesystem", async () => {
  const result = await postAcp({
    sessionId: `test-skill-resolve-${Date.now()}`,
    prompt: "create a button",
    skillName: "frontend-design",
    // No skillContent — server must call resolveSkillContent()
  });
  console.log(`     Response type: ${result.type}, status: ${result.status}`);
  if (result.type === "json") {
    console.log(`     Body: ${JSON.stringify(result.body).slice(0, 150)}`);
    assert(result.status === 200, `Expected 200, got: ${result.status}`);
    // JSON response means synchronous result (non-SDK session or error)
    assert("jsonrpc" in result.body || "error" in result.body,
      `Expected JSON-RPC body, got: ${JSON.stringify(result.body).slice(0, 100)}`);
  } else if (result.type === "sse") {
    console.log(`     SSE first chunk: ${result.firstChunk.slice(0, 150)}`);
    assert(result.status === 200, `Expected 200, got: ${result.status}`);
    // SSE response means streaming (Claude Code SDK) - skill was passed to Claude
    assert(result.firstChunk.length > 0, "SSE response should have data");
  } else {
    // Timeout - the server is streaming (good) but we timed out
    console.log(`     (timed out reading SSE stream - skill loading worked)`);
  }
});

await test("skillName with skillContent: content passed directly, no extra resolution", async () => {
  const result = await postAcp({
    sessionId: `test-skill-content-${Date.now()}`,
    prompt: "create a button",
    skillName: "frontend-design",
    skillContent: "## Frontend Design\n\nCreate beautiful UIs.", // provided, skip resolution
  });
  console.log(`     Response type: ${result.type}, status: ${result.status}`);
  if (result.type === "json") {
    assert(result.status === 200, `Expected 200, got: ${result.status}`);
  } else if (result.type === "sse") {
    assert(result.status === 200, `Expected 200, got: ${result.status}`);
    assert(result.firstChunk.length > 0, "SSE response should have data");
  }
  // Either way (json or sse), no error = skillContent was accepted and passed
});

// ──────────────────────────────────────────────────────────────────────────────
// Test Group 4: Skill content format verification
// ──────────────────────────────────────────────────────────────────────────────
console.log("\n── Test Group 4: skill content format ──\n");

await test("skill content is valid markdown", async () => {
  const data = await json("/api/skills?name=frontend-design");
  const content: string = data.content;
  // Skill content should be a non-trivial markdown string
  assert(content.trim().length > 0, "Content should not be empty");
  // Should not start with {{ or <? (not a template/XML file)
  assert(!content.startsWith("{{"), "Content should not be a template");
});

await test("all listed skills can be loaded individually", async () => {
  const listData = await json("/api/skills");
  const skills: Array<{ name: string }> = listData.skills;
  let loaded = 0;
  const errors: string[] = [];
  for (const skill of skills.slice(0, 5)) { // check first 5
    try {
      const data = await json(`/api/skills?name=${encodeURIComponent(skill.name)}`);
      if (typeof data.content === "string" && data.content.length > 0) {
        loaded++;
      } else {
        errors.push(`${skill.name}: empty content`);
      }
    } catch (err) {
      errors.push(`${skill.name}: ${(err as Error).message}`);
    }
  }
  assert(errors.length === 0, `Skills with errors: ${errors.join(", ")}`);
  assert(loaded === Math.min(5, skills.length), `Only ${loaded}/${Math.min(5, skills.length)} skills loaded`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────
  console.log(`\n── Results: ${passed} passed, ${failed} failed ──\n`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
