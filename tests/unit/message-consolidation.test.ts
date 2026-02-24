#!/usr/bin/env npx tsx
/**
 * Unit test for message consolidation logic.
 * 
 * Tests that:
 * 1. Consecutive agent_message_chunk notifications are merged into single agent_message
 * 2. User messages are preserved as-is
 * 3. Tool calls and other notifications are preserved
 * 4. No data loss during merging
 * 
 * Run: npx tsx tests/unit/message-consolidation.test.ts
 */

import { consolidateMessageHistory, SessionUpdateNotification } from "../../src/core/acp/http-session-store";

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTest(name: string, fn: () => void) {
  try {
    fn();
    testsPassed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    testsFailed++;
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: Empty array returns empty
// ─────────────────────────────────────────────────────────────────────────────
runTest("empty array returns empty", () => {
  const result = consolidateMessageHistory([]);
  assert(result.length === 0, "Expected empty array");
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: Single chunk becomes single message
// ─────────────────────────────────────────────────────────────────────────────
runTest("single chunk becomes single message", () => {
  const input: SessionUpdateNotification[] = [
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } } },
  ];
  const result = consolidateMessageHistory(input);
  assert(result.length === 1, `Expected 1 message, got ${result.length}`);
  const update = result[0].update as Record<string, unknown>;
  assert(update.sessionUpdate === "agent_message", `Expected agent_message, got ${update.sessionUpdate}`);
  const content = update.content as { text: string };
  assert(content.text === "Hello", `Expected "Hello", got "${content.text}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: Multiple chunks merged into one message
// ─────────────────────────────────────────────────────────────────────────────
runTest("multiple consecutive chunks are merged", () => {
  const input: SessionUpdateNotification[] = [
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "I" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "'ll" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " help" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: " you" } } },
  ];
  const result = consolidateMessageHistory(input);
  assert(result.length === 1, `Expected 1 message, got ${result.length}`);
  const update = result[0].update as Record<string, unknown>;
  const content = update.content as { text: string };
  assert(content.text === "I'll help you", `Expected "I'll help you", got "${content.text}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: User messages preserved as-is
// ─────────────────────────────────────────────────────────────────────────────
runTest("user messages preserved as-is", () => {
  const input: SessionUpdateNotification[] = [
    { sessionId: "s1", update: { sessionUpdate: "user_message", content: { type: "text", text: "Hello AI" } } },
  ];
  const result = consolidateMessageHistory(input);
  assert(result.length === 1, `Expected 1 message, got ${result.length}`);
  const update = result[0].update as Record<string, unknown>;
  assert(update.sessionUpdate === "user_message", `Expected user_message, got ${update.sessionUpdate}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: Tool calls preserved between chunks
// ─────────────────────────────────────────────────────────────────────────────
runTest("tool calls preserved between chunks", () => {
  const input: SessionUpdateNotification[] = [
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "I'll read " } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "the file" } } },
    { sessionId: "s1", update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", status: "running" } },
    { sessionId: "s1", update: { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done!" } } },
  ];
  const result = consolidateMessageHistory(input);
  assert(result.length === 4, `Expected 4 items (2 agent_message + tool_call + tool_call_update), got ${result.length}`);
  
  const types = result.map(r => (r.update as Record<string, unknown>).sessionUpdate);
  assert(types[0] === "agent_message", `First should be agent_message, got ${types[0]}`);
  assert(types[1] === "tool_call", `Second should be tool_call, got ${types[1]}`);
  assert(types[2] === "tool_call_update", `Third should be tool_call_update, got ${types[2]}`);
  assert(types[3] === "agent_message", `Fourth should be agent_message, got ${types[3]}`);
  
  // Verify merged text
  const content0 = (result[0].update as Record<string, unknown>).content as { text: string };
  assert(content0.text === "I'll read the file", `Expected "I'll read the file", got "${content0.text}"`);
  const content3 = (result[3].update as Record<string, unknown>).content as { text: string };
  assert(content3.text === "Done!", `Expected "Done!", got "${content3.text}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 6: User message + agent response sequence
// ─────────────────────────────────────────────────────────────────────────────
runTest("user message + agent response sequence", () => {
  const input: SessionUpdateNotification[] = [
    { sessionId: "s1", update: { sessionUpdate: "user_message", content: { type: "text", text: "What is 2+2?" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "2" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "+" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "2" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "=" } } },
    { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "4" } } },
  ];
  const result = consolidateMessageHistory(input);
  assert(result.length === 2, `Expected 2 items (user + agent), got ${result.length}`);
  
  const update0 = result[0].update as Record<string, unknown>;
  assert(update0.sessionUpdate === "user_message", `First should be user_message`);
  
  const update1 = result[1].update as Record<string, unknown>;
  assert(update1.sessionUpdate === "agent_message", `Second should be agent_message`);
  const content1 = update1.content as { text: string };
  assert(content1.text === "2+2=4", `Expected "2+2=4", got "${content1.text}"`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(60)}`);
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);
process.exit(testsFailed > 0 ? 1 : 0);

