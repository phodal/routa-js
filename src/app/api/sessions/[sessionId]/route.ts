/**
 * Session API Route - /api/sessions/[sessionId]
 *
 * Supports:
 * - PATCH: Rename a session
 * - DELETE: Delete a session
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const body = await request.json();
  const { name } = body;

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json(
      { error: "Invalid name" },
      { status: 400 }
    );
  }

  const store = getHttpSessionStore();
  const success = store.renameSession(sessionId, name.trim());

  if (!success) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const store = getHttpSessionStore();
  const success = store.deleteSession(sessionId);

  if (!success) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}

