/**
 * A2A Message endpoint - HTTP+JSON REST binding
 *
 * POST /api/a2a/message?action=send  — SendMessage (returns Task or Message)
 * POST /api/a2a/message?action=stream — SendStreamingMessage (SSE)
 *
 * As per A2A spec section 11.3.1:
 * - POST /message:send
 * - POST /message:stream
 *
 * Note: Next.js can't use `:` in file paths, so `action` query param is used
 * for routing. Clients may also hit `/api/a2a/message/send` or `/api/a2a/message/stream`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2ATaskBridge, A2ATask } from "@/core/a2a";
import { getRoutaSystem } from "@/core/routa-system";
import { AgentRole } from "@/core/models/agent";

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
 * POST /api/a2a/message — SendMessage or SendStreamingMessage
 *
 * Query params:
 *   action=send (default) | action=stream
 */
export async function POST(request: NextRequest) {
  const action = request.nextUrl.searchParams.get("action") ?? "send";

  try {
    const body = await request.json();

    // Validate message structure per A2A spec
    const message = body.message;
    if (!message || !message.parts || !Array.isArray(message.parts)) {
      return NextResponse.json(
        {
          type: "https://a2a-protocol.org/errors/invalid-request",
          title: "Invalid Request",
          status: 400,
          detail: "Request must include a 'message' object with 'parts' array",
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Extract text from the message parts
    const textParts = message.parts
      .filter((p: Record<string, unknown>) => p.text)
      .map((p: Record<string, unknown>) => p.text as string);

    if (textParts.length === 0) {
      return NextResponse.json(
        {
          type: "https://a2a-protocol.org/errors/content-type-not-supported",
          title: "Content Type Not Supported",
          status: 415,
          detail: "Only text/plain message parts are supported",
        },
        { status: 415, headers: CORS_HEADERS }
      );
    }

    const userPrompt = textParts.join("\n");
    const workspaceId = (body.metadata?.workspaceId as string) ?? null;
    const contextId = message.contextId as string | undefined;

    // Create a Routa agent for this request
    const system = getRoutaSystem();
    const bridge = getA2ATaskBridge();

    // Determine agent role from the request metadata or default to ROUTA
    const roleStr = (body.metadata?.agentRole as string) ?? "ROUTA";
    const role: AgentRole = (AgentRole[roleStr as keyof typeof AgentRole]) ?? AgentRole.ROUTA;

    // Create the task in the bridge first
    const a2aTask = bridge.createTask({
      userPrompt,
      workspaceId: workspaceId ?? undefined,
      contextId,
    });

    // Try to create a Routa agent if we have a workspaceId
    if (workspaceId) {
      try {
        const agentResult = await system.tools.createAgent({
          name: `a2a-agent-${a2aTask.id.slice(0, 8)}`,
          role,
          workspaceId,
        });

        if (agentResult.success && agentResult.data) {
          const agentData = agentResult.data as { agentId: string };
          // Link the Routa agent to the A2A task
          bridge.linkAgent(a2aTask.id, agentData.agentId);
        }
      } catch (err) {
        console.warn("[A2A] Failed to create Routa agent:", err);
        // Continue - the A2A task is still created
      }
    }

    const updatedTask = bridge.getTask(a2aTask.id) ?? a2aTask;

    if (action === "stream") {
      return handleStreamResponse(updatedTask);
    }

    // Non-streaming: return the task
    return NextResponse.json(
      { task: updatedTask },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[A2A message] Error:", error);
    return NextResponse.json(
      {
        type: "https://a2a-protocol.org/errors/internal-error",
        title: "Internal Error",
        status: 500,
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}

/**
 * Handle streaming response via SSE
 */
function handleStreamResponse(task: A2ATask) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: unknown) => {
        const eventData = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(eventData));
      };

      // Send initial task state
      sendEvent({ task });

      // Simulate a working status update after brief delay
      setTimeout(() => {
        sendEvent({
          statusUpdate: {
            taskId: task.id,
            contextId: task.contextId,
            status: {
              state: "working",
              timestamp: new Date().toISOString(),
              message: {
                messageId: crypto.randomUUID(),
                role: "agent",
                parts: [{ text: "Processing your request..." }],
              },
            },
          },
        });

        // Close the stream
        setTimeout(() => {
          try {
            controller.close();
          } catch {
            // ignore
          }
        }, 500);
      }, 200);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
}
