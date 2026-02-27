/**
 * Session History API Route - /api/sessions/[sessionId]/history
 *
 * Returns the message history for a session, used when switching sessions
 * in the UI to restore the chat transcript.
 *
 * Query params:
 * - consolidated=true: Returns consolidated history (agent_message_chunk merged into agent_message)
 *
 * Falls back to DB when in-memory history is empty (serverless cold start).
 */

import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore, consolidateMessageHistory } from "@/core/acp/http-session-store";
import { loadHistoryFromDb } from "@/core/acp/session-db-persister";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  const consolidated = request.nextUrl.searchParams.get("consolidated") === "true";

  const store = getHttpSessionStore();
  let history = store.getHistory(sessionId);

  // On serverless cold start, in-memory history is empty — load from DB
  if (history.length === 0) {
    const dbHistory = await loadHistoryFromDb(sessionId);
    if (dbHistory.length > 0) {
      // Populate in-memory store so subsequent requests are fast
      for (const notification of dbHistory) {
        store.pushNotificationToHistory(sessionId, notification);
      }
      history = dbHistory;
    }
  }

  const result = consolidated ? consolidateMessageHistory(history) : history;

  return NextResponse.json(
    { history: result },
    { headers: { "Cache-Control": "no-store" } }
  );
}

