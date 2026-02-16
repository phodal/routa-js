/**
 * /api/notes/events - SSE endpoint for real-time note change notifications.
 *
 * Clients connect with GET /api/notes/events?workspaceId=...
 * and receive Server-Sent Events whenever notes are created, updated, or deleted.
 *
 * Event format:
 *   data: { "type": "note:updated", "noteId": "...", "workspaceId": "...", "note": {...} }
 */

import { NextRequest } from "next/server";
import { getNoteEventBroadcaster } from "@/core/notes/note-event-broadcaster";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId") ?? "*";

  const broadcaster = getNoteEventBroadcaster();
  let connectionId: string | null = null;

  const stream = new ReadableStream({
    start(controller) {
      connectionId = broadcaster.attach(workspaceId, controller);
    },
    cancel() {
      if (connectionId) {
        broadcaster.detach(connectionId);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
