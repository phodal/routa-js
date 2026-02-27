/**
 * /api/tasks/ready - Get tasks that are ready to be executed.
 *
 * GET /api/tasks/ready?workspaceId=... → List ready tasks (dependencies completed)
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { Task } from "@/core/models/task";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const workspaceId = searchParams.get("workspaceId") ?? "default";

  const system = getRoutaSystem();
  const tasks = await system.taskStore.findReadyTasks(workspaceId);

  return NextResponse.json({
    tasks: tasks.map(serializeTask),
  });
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

