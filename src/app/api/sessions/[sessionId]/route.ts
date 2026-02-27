/**
 * Session API Route - /api/sessions/[sessionId]
 *
 * Supports:
 * - GET: Get session metadata (provider, role, model, etc.)
 * - PATCH: Rename a session
 * - DELETE: Delete a session
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";
import { getDatabaseDriver } from "@/core/db/index";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const store = getHttpSessionStore();
  const session = store.getSession(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    session: {
      sessionId: session.sessionId,
      name: session.name,
      cwd: session.cwd,
      workspaceId: session.workspaceId,
      routaAgentId: session.routaAgentId,
      provider: session.provider,
      role: session.role,
      modeId: session.modeId,
      model: session.model,
      createdAt: session.createdAt,
    },
  });
}

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

  // Persist rename to database
  try {
    const driver = getDatabaseDriver();
    if (driver === "sqlite") {
      const { getSqliteDatabase } = await import("@/core/db/sqlite");
      const { SqliteAcpSessionStore } = await import("@/core/db/sqlite-stores");
      const db = getSqliteDatabase();
      await new SqliteAcpSessionStore(db).rename(sessionId, name.trim());
    } else if (driver === "postgres") {
      const { getPostgresDatabase } = await import("@/core/db/index");
      const { PgAcpSessionStore } = await import("@/core/db/pg-acp-session-store");
      const db = getPostgresDatabase();
      await new PgAcpSessionStore(db).rename(sessionId, name.trim());
    }
  } catch (err) {
    console.error("[Sessions API] Failed to persist rename to database:", err);
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

  // Persist deletion to database
  try {
    const driver = getDatabaseDriver();
    if (driver === "sqlite") {
      const { getSqliteDatabase } = await import("@/core/db/sqlite");
      const { SqliteAcpSessionStore } = await import("@/core/db/sqlite-stores");
      const db = getSqliteDatabase();
      await new SqliteAcpSessionStore(db).delete(sessionId);
    } else if (driver === "postgres") {
      const { getPostgresDatabase } = await import("@/core/db/index");
      const { PgAcpSessionStore } = await import("@/core/db/pg-acp-session-store");
      const db = getPostgresDatabase();
      await new PgAcpSessionStore(db).delete(sessionId);
    }
  } catch (err) {
    console.error("[Sessions API] Failed to persist deletion to database:", err);
  }

  return NextResponse.json({ ok: true });
}

