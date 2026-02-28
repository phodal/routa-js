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

  const {
    prompt,
    agentId,
    workspaceId = "default",
    title,
    triggerSource = "manual",
    triggeredBy,
    maxAttempts = 3,
  } = body;

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }

  const system = getRoutaSystem();

  const task = createBackgroundTask({
    id: uuidv4(),
    prompt,
    agentId,
    workspaceId,
    title: title ?? prompt.slice(0, 80),
    triggerSource,
    triggeredBy,
    maxAttempts,
  });

  await system.backgroundTaskStore.save(task);

  return NextResponse.json({ task }, { status: 201 });
}
