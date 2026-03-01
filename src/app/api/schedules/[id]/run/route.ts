/**
 * /api/schedules/[id]/run — Immediately trigger a schedule manually.
 *
 * POST /api/schedules/[id]/run  → Fire the schedule right now (creates a BackgroundTask)
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createBackgroundTask } from "@/core/models/background-task";
import { resolveSchedulePrompt } from "@/core/models/schedule";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const system = getRoutaSystem();

    const schedule = await system.scheduleStore.get(id);
    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    if (!schedule.enabled) {
      return NextResponse.json(
        { error: "Schedule is disabled. Enable it before running." },
        { status: 400 }
      );
    }

    const prompt = resolveSchedulePrompt(schedule);

    const task = createBackgroundTask({
      id: uuidv4(),
      prompt,
      agentId: schedule.agentId,
      workspaceId: schedule.workspaceId,
      title: `[Manual] ${schedule.name}`,
      triggerSource: "schedule",
      triggeredBy: "user-manual",
      maxAttempts: 1,
    });

    await system.backgroundTaskStore.save(task);

    // Update lastRunAt and lastTaskId on the schedule
    await system.scheduleStore.update(id, {
      lastRunAt: new Date(),
      lastTaskId: task.id,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (err) {
    console.error("[Schedules/run] POST error:", err);
    return NextResponse.json(
      { error: "Failed to trigger schedule", details: String(err) },
      { status: 500 }
    );
  }
}
