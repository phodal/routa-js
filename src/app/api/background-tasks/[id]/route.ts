/**
 * /api/background-tasks/[id] — Single task operations.
 *
 * GET    /api/background-tasks/[id]  → Get task status
 * DELETE /api/background-tasks/[id]  → Cancel / delete task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const system = getRoutaSystem();
  const task = await system.backgroundTaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ task });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const system = getRoutaSystem();
  const task = await system.backgroundTaskStore.get(id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status === "PENDING" || task.status === "RUNNING") {
    await system.backgroundTaskStore.updateStatus(id, "CANCELLED", {
      completedAt: new Date(),
    });
    const updated = await system.backgroundTaskStore.get(id);
    return NextResponse.json({ task: updated });
  }

  await system.backgroundTaskStore.delete(id);
  return NextResponse.json({ success: true });
}
