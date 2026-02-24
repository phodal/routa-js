/**
 * Session History API Route - /api/sessions/[sessionId]/history
 *
 * Returns the message history for a session, used when switching sessions
 * in the UI to restore the chat transcript.
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const store = getHttpSessionStore();
  const history = store.getHistory(sessionId);
  
  return NextResponse.json(
    { history },
    { headers: { "Cache-Control": "no-store" } }
  );
}

