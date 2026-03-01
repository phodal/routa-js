/**
 * /api/background-tasks/[id]/retry — Retry a FAILED background task.
 *
 * POST /api/background-tasks/[id]/retry
 *   → Resets a FAILED task to PENDING status for retry
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const system = getRoutaSystem();
  
  const task = await system.backgroundTaskStore.get(id);
  
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  
  if (task.status !== "FAILED") {
    return NextResponse.json(
      { error: "Only FAILED tasks can be retried" },
      { status: 400 }
    );
  }
  
  if (task.attempts >= task.maxAttempts) {
    return NextResponse.json(
      { error: `Max retry attempts reached (${task.maxAttempts})` },
      { status: 400 }
    );
  }
  
  // Reset task to PENDING status
  await system.backgroundTaskStore.updateStatus(id, "PENDING", {
    errorMessage: undefined,
    completedAt: undefined,
  });
  
  const updated = await system.backgroundTaskStore.get(id);
  return NextResponse.json({ task: updated });
}

