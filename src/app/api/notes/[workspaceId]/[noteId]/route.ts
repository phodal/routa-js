/**
 * GET    /api/notes/[workspaceId]/[noteId] — Get a note by ID
 * DELETE /api/notes/[workspaceId]/[noteId] — Delete a note by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  const { workspaceId, noteId } = await params;
  const system = getRoutaSystem();
  const note = await system.noteStore.get(noteId, workspaceId);
  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json({ note });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; noteId: string }> },
) {
  const { workspaceId, noteId } = await params;
  const system = getRoutaSystem();
  await system.noteStore.delete(noteId, workspaceId);
  system.noteBroadcaster.notifyDeleted(noteId, workspaceId, "user");
  return NextResponse.json({ deleted: true, noteId });
}
