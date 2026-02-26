/**
 * /api/notes - REST API for collaborative note editing.
 *
 * GET    /api/notes?workspaceId=...&type=...  → List notes
 * POST   /api/notes                           → Create/update a note
 * DELETE /api/notes?noteId=...&workspaceId=... → Delete a note
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createNote, Note } from "@/core/models/note";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId");
  const type = searchParams.get("type") as "spec" | "task" | "general" | null;
  const noteId = searchParams.get("noteId");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const system = getRoutaSystem();

  // Single note fetch
  if (noteId) {
    const note = await system.noteStore.get(noteId, workspaceId);
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    return NextResponse.json({ note: serializeNote(note) });
  }

  // List notes
  const notes = type
    ? await system.noteStore.listByType(workspaceId, type)
    : await system.noteStore.listByWorkspace(workspaceId);

  return NextResponse.json({
    notes: notes.map(serializeNote),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    noteId,
    title,
    content,
    workspaceId,
    type = "general",
    metadata,
    source: rawSource = "user",
  } = body;

  // Validate source type
  const source = (["agent", "user", "system"].includes(rawSource) ? rawSource : "user") as "agent" | "user" | "system";

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const system = getRoutaSystem();
  const store = system.noteStore;

  // Update existing note
  if (noteId) {
    const existing = await store.get(noteId, workspaceId);
    if (existing) {
      if (content !== undefined) existing.content = content;
      if (title !== undefined) existing.title = title;
      if (metadata) Object.assign(existing.metadata, metadata);
      existing.updatedAt = new Date();

      await store.save(existing, source);

      // Broadcast update for real-time sync (PgNoteStore/SqliteNoteStore don't broadcast)
      system.noteBroadcaster.notifyUpdated(existing, source);

      return NextResponse.json({ note: serializeNote(existing) });
    }
  }

  // Create new note
  const note = createNote({
    id: noteId ?? `note-${Date.now()}`,
    title: title ?? "Untitled",
    content: content ?? "",
    workspaceId,
    metadata: {
      type,
      ...metadata,
    },
  });

  await store.save(note, source);

  // Broadcast creation for real-time sync (PgNoteStore/SqliteNoteStore don't broadcast)
  system.noteBroadcaster.notifyCreated(note, source);

  return NextResponse.json({ note: serializeNote(note) }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const noteId = searchParams.get("noteId");
  const workspaceId = searchParams.get("workspaceId");

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 });
  }
  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const system = getRoutaSystem();
  await system.noteStore.delete(noteId, workspaceId);

  // Broadcast deletion for real-time sync
  system.noteBroadcaster.notifyDeleted(noteId, workspaceId, "user");

  return NextResponse.json({ deleted: true, noteId });
}

function serializeNote(note: Note) {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    workspaceId: note.workspaceId,
    metadata: note.metadata,
    createdAt: note.createdAt instanceof Date ? note.createdAt.toISOString() : note.createdAt,
    updatedAt: note.updatedAt instanceof Date ? note.updatedAt.toISOString() : note.updatedAt,
  };
}
