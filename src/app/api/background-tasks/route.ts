/**
 * /api/background-tasks — REST API for persistent background task queue.
 *
 * GET  /api/background-tasks?workspaceId=...  → List tasks for workspace
 * POST /api/background-tasks                   → Enqueue a new background task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createBackgroundTask } from "@/core/models/background-task";
import { getBackgroundWorker, startBackgroundWorker } from "@/core/background-worker";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

function requireWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = requireWorkspaceId(searchParams.get("workspaceId"));
  const status = searchParams.get("status");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

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
    const { status, workspaceId, triggerSource } = body;
    const normalizedWorkspaceId = requireWorkspaceId(workspaceId);
    if (!status) {
      return NextResponse.json(
        { error: "status is required for deleteByStatus action" },
        { status: 400 }
      );
    }
    if (!normalizedWorkspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required for deleteByStatus action" },
        { status: 400 }
      );
    }

    const allTasks = await system.backgroundTaskStore.listByStatus(
      normalizedWorkspaceId,
      status as never
    );

    // Optional: filter by triggerSource (e.g. delete only "polling" PENDING tasks)
    const tasks = triggerSource
      ? allTasks.filter((t) => t.triggerSource === triggerSource)
      : allTasks;

    let deleted = 0;
    for (const task of tasks) {
      await system.backgroundTaskStore.delete(task.id);
      deleted++;
    }

    return NextResponse.json({
      success: true,
      deleted,
      message: `Deleted ${deleted} ${status}${triggerSource ? ` (${triggerSource})` : ""} tasks`,
    });
  }

  const {
    prompt,
    agentId,
    workspaceId,
    title,
    triggerSource = "manual",
    triggeredBy,
    priority = "NORMAL",
    maxAttempts = 3,
  } = body;
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId);

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400 });
  }
  if (!normalizedWorkspaceId) {
    return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
  }

  const task = createBackgroundTask({
    id: uuidv4(),
    prompt,
    agentId,
    workspaceId: normalizedWorkspaceId,
    title: title ?? prompt.slice(0, 80),
    triggerSource,
    triggeredBy,
    priority,
    maxAttempts,
  });

  await system.backgroundTaskStore.save(task);

  // Ensure worker is running and kick an immediate dispatch cycle (fire-and-forget)
  startBackgroundWorker();
  void getBackgroundWorker().dispatchPending();

  return NextResponse.json({ task }, { status: 201 });
}
