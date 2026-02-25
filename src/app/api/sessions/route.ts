/**
 * Sessions REST API Route - /api/sessions
 *
 * Lists ACP sessions created via /api/acp for the browser UI.
 * This is NOT part of ACP; it's only for the web dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const store = getHttpSessionStore();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");

  let sessions = store.listSessions();
  if (workspaceId) {
    sessions = sessions.filter((s) => s.workspaceId === workspaceId);
  }

  return NextResponse.json(
    { sessions },
    { headers: { "Cache-Control": "no-store" } }
  );
}

