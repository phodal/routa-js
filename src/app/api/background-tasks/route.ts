/**
 * /api/background-tasks — REST API for persistent background task queue.
 *
 * GET  /api/background-tasks?workspaceId=...  → List tasks for workspace
 * POST /api/background-tasks                   → Enqueue a new background task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createBackgroundTask } from "@/core/models/background-task";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId") ?? "default";
  const status = searchParams.get("status");

  const system = getRoutaSystem();

  const tasks = status
    ? await system.backgroundTaskStore.listByStatus(workspaceId, status as never)
    : await system.backgroundTaskStore.listByWorkspace(workspaceId);

  return NextResponse.json({ tasks });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const system = getRoutaSystem();

  // Handle batch delete action
  if (body.action === "deleteByStatus") {
    const { status, workspaceId = "default" } = body;
    if (!status) {
      return NextResponse.json(
        { error: "status is required for deleteByStatus action" },
        { status: 400 }
      );
    }

    const tasks = await system.backgroundTaskStore.listByStatus(
      workspaceId,
      status as never
    );

    let deleted = 0;
    for (const task of tasks) {
      await system.backgroundTaskStore.delete(task.id);
      deleted++;
    }

    return NextResponse.json({
      success: true,
      deleted,
      message: `Deleted ${deleted} ${status} tasks`,
    });
  }

  const {
    prompt,
    agentId,
    workspaceId = "default",
    title,
    triggerSource = "manual",
    triggeredBy,
    priority = "NORMAL",
    maxAttempts = 3,
  } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const task = createBackgroundTask({
    id: uuidv4(),
    prompt,
    agentId,
    workspaceId,
    title: title ?? prompt.slice(0, 80),
    triggerSource,
    triggeredBy,
    priority,
    maxAttempts,
  });

  await system.backgroundTaskStore.save(task);

  return NextResponse.json({ task }, { status: 201 });
}
