/**
 * /api/tasks/[taskId] - Single task operations.
 *
 * GET    /api/tasks/:taskId  → Get task by ID
 * DELETE /api/tasks/:taskId  → Delete a task
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { Task } from "@/core/models/task";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  const system = getRoutaSystem();
  const task = await system.taskStore.get(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ task: serializeTask(task) });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  const system = getRoutaSystem();
  await system.taskStore.delete(taskId);

  return NextResponse.json({ deleted: true });
}

function serializeTask(task: Task) {
  return {
    id: task.id,
    title: task.title,
    objective: task.objective,
    scope: task.scope,
    acceptanceCriteria: task.acceptanceCriteria,
    verificationCommands: task.verificationCommands,
    assignedTo: task.assignedTo,
    status: task.status,
    dependencies: task.dependencies,
    parallelGroup: task.parallelGroup,
    workspaceId: task.workspaceId,
    sessionId: task.sessionId,
    completionSummary: task.completionSummary,
    verificationVerdict: task.verificationVerdict,
    verificationReport: task.verificationReport,
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
  };
}

