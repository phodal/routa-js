/**
 * A2A Task resource endpoint - HTTP+JSON REST binding
 *
 * GET  /api/a2a/tasks/[id]          — GetTask
 * POST /api/a2a/tasks/[id]          — (action routing via query param)
 *
 * Note: For CancelTask, POST /api/a2a/tasks/[id]?action=cancel
 *       For SubscribeToTask, GET /api/a2a/tasks/[id]?action=subscribe (SSE)
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2ATaskBridge } from "@/core/a2a";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, A2A-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * GET /api/a2a/tasks/[id] — GetTask
 * GET /api/a2a/tasks/[id]?action=subscribe — SubscribeToTask (SSE)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const action = request.nextUrl.searchParams.get("action");
  const bridge = getA2ATaskBridge();

  const task = bridge.getTask(id);

  if (!task) {
    return NextResponse.json(
      {
        type: "https://a2a-protocol.org/errors/task-not-found",
        title: "Task Not Found",
        status: 404,
        detail: `The specified task ID '${id}' does not exist or is not accessible`,
        taskId: id,
      },
      { status: 404, headers: CORS_HEADERS }
    );
  }

  if (action === "subscribe") {
    // SSE stream for task updates
    const terminal = ["completed", "failed", "canceled", "rejected"];
    if (terminal.includes(task.status.state)) {
      return NextResponse.json(
        {
          type: "https://a2a-protocol.org/errors/unsupported-operation",
          title: "Unsupported Operation",
          status: 400,
          detail: "Cannot subscribe to a task in a terminal state",
          taskId: id,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Send current task state immediately
        const sendEvent = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        sendEvent({ task });

        // Keep-alive ping
        const interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            clearInterval(interval);
          }
        }, 30000);

        request.signal.addEventListener("abort", () => {
          clearInterval(interval);
          try {
            controller.close();
          } catch {
            // ignore
          }
        });
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...CORS_HEADERS,
      },
    });
  }

  // Standard GetTask response
  const historyLength = parseInt(
    request.nextUrl.searchParams.get("historyLength") ?? "0",
    10
  );

  const responseTask = historyLength === 0
    ? { ...task, history: undefined }
    : historyLength > 0
    ? { ...task, history: task.history?.slice(-historyLength) }
    : task;

  return NextResponse.json(responseTask, {
    headers: { "Cache-Control": "no-store", ...CORS_HEADERS },
  });
}

/**
 * POST /api/a2a/tasks/[id]?action=cancel — CancelTask
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const action = request.nextUrl.searchParams.get("action") ?? "cancel";
  const bridge = getA2ATaskBridge();

  if (action !== "cancel") {
    return NextResponse.json(
      {
        type: "https://a2a-protocol.org/errors/unsupported-operation",
        title: "Unsupported Operation",
        status: 400,
        detail: `Action '${action}' is not supported. Use 'cancel'.`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  try {
    const task = bridge.cancelTask(id);
    if (!task) {
      return NextResponse.json(
        {
          type: "https://a2a-protocol.org/errors/task-not-found",
          title: "Task Not Found",
          status: 404,
          detail: `Task '${id}' not found`,
          taskId: id,
        },
        { status: 404, headers: CORS_HEADERS }
      );
    }
    return NextResponse.json(task, { headers: CORS_HEADERS });
  } catch (err) {
    if (err instanceof Error && err.message === "TaskNotCancelableError") {
      return NextResponse.json(
        {
          type: "https://a2a-protocol.org/errors/task-not-cancelable",
          title: "Task Not Cancelable",
          status: 409,
          detail: "The task is in a terminal state and cannot be canceled",
          taskId: id,
        },
        { status: 409, headers: CORS_HEADERS }
      );
    }
    throw err;
  }
}
