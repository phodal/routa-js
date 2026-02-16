/**
 * Notes API contract tests.
 *
 * Tests the /api/notes endpoints for create, list, get, delete.
 * Validates response shapes and metadata structure.
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

const NOTE_TYPES = ["spec", "task", "general"];

export async function testNotes(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const testNoteId = `test-note-${Date.now()}`;

  // ── POST /api/notes — create note ──
  results.push(
    await runTest("POST /api/notes — create note", async () => {
      const { status, data } = await api("POST", "/api/notes", {
        noteId: testNoteId,
        title: "Contract Test Note",
        content: "This note verifies API parity",
        workspaceId: "default",
        type: "general",
      });
      assert(status === 200 || status === 201, `Expected 200 or 201, got ${status}`);
      const d = data as Record<string, unknown>;
      assertHasField(d, "note");
      const note = d.note as Record<string, unknown>;
      validateNoteShape(note);
      assert(note.title === "Contract Test Note", "Title should match");
    })
  );

  // ── GET /api/notes — list notes ──
  results.push(
    await runTest("GET /api/notes — list notes", async () => {
      const { status, data } = await api("GET", "/api/notes?workspaceId=default");
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertArrayField(d, "notes");
    })
  );

  // ── GET /api/notes?noteId=xxx — get note by query ──
  results.push(
    await runTest("GET /api/notes?noteId=xxx — get note by query", async () => {
      const { status, data } = await api(
        "GET",
        `/api/notes?noteId=${testNoteId}&workspaceId=default`
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertHasField(d, "note");
    })
  );

  // ── GET /api/notes?type=general — filter by type ──
  results.push(
    await runTest("GET /api/notes?type=general — filter by type", async () => {
      const { status, data } = await api(
        "GET",
        "/api/notes?workspaceId=default&type=general"
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertArrayField(d, "notes");
    })
  );

  // ── POST /api/notes — update existing note ──
  results.push(
    await runTest("POST /api/notes — update existing note", async () => {
      const { status, data } = await api("POST", "/api/notes", {
        noteId: testNoteId,
        title: "Updated Title",
        content: "Updated content",
        workspaceId: "default",
      });
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assertHasField(d, "note");
      const note = d.note as Record<string, unknown>;
      assert(note.title === "Updated Title", "Title should be updated");
    })
  );

  // ── DELETE /api/notes?noteId=xxx — delete by query ──
  results.push(
    await runTest("DELETE /api/notes?noteId=xxx — delete by query", async () => {
      const { status, data } = await api(
        "DELETE",
        `/api/notes?noteId=${testNoteId}&workspaceId=default`
      );
      assertStatus(status, 200);
      const d = data as Record<string, unknown>;
      assert(d.deleted === true, "Should return deleted: true");
      assert(d.noteId === testNoteId, "Should return noteId");
    })
  );

  return results;
}

function validateNoteShape(note: Record<string, unknown>) {
  assert(typeof note.id === "string", "note.id should be string");
  assert(typeof note.title === "string", "note.title should be string");
  assert(typeof note.content === "string", "note.content should be string");
  assert(typeof note.workspaceId === "string", "note.workspaceId should be string");
  assertHasField(note, "metadata");
  const metadata = note.metadata as Record<string, unknown>;
  assertEnum(metadata.type as string, NOTE_TYPES, "metadata.type");
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
