/**
 * Session History API Route - /api/sessions/[sessionId]/history
 *
 * Returns the message history for a session, used when switching sessions
 * in the UI to restore the chat transcript.
 *
 * Query params:
 * - consolidated=true: Returns consolidated history (agent_message_chunk merged into agent_message)
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const consolidated = request.nextUrl.searchParams.get("consolidated") === "true";

  const store = getHttpSessionStore();
  const history = consolidated
    ? store.getConsolidatedHistory(sessionId)
    : store.getHistory(sessionId);

  return NextResponse.json(
    { history },
    { headers: { "Cache-Control": "no-store" } }
  );
}

