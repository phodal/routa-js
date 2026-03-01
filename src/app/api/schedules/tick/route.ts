/**
 * /api/schedules/tick — Cron tick handler.
 *
 * Called every minute by Vercel Cron Jobs (configured in vercel.json).
 * Finds all due schedules and fires BackgroundTasks for each.
 *
 * Also used by the in-process SchedulerService (node-cron) for local dev.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createBackgroundTask } from "@/core/models/background-task";
import { resolveSchedulePrompt } from "@/core/models/schedule";
import { getNextRunTime } from "@/core/scheduling/cron-utils";
import { v4 as uuidv4 } from "uuid";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  try {
    const system = getRoutaSystem();
    const dueSchedules = await system.scheduleStore.listDue();

    if (dueSchedules.length === 0) {
      return NextResponse.json({ fired: 0, scheduleIds: [] });
    }

    const fired: string[] = [];

    for (const schedule of dueSchedules) {
      try {
        const prompt = resolveSchedulePrompt(schedule);
        const task = createBackgroundTask({
          id: uuidv4(),
          prompt,
          agentId: schedule.agentId,
          workspaceId: schedule.workspaceId,
          title: `[Scheduled] ${schedule.name}`,
          triggerSource: "schedule",
          triggeredBy: `schedule:${schedule.id}`,
          maxAttempts: 1,
        });

        await system.backgroundTaskStore.save(task);

        // Advance schedule timing
        const nextRunAt = getNextRunTime(schedule.cronExpr);
        await system.scheduleStore.update(schedule.id, {
          lastRunAt: new Date(),
          lastTaskId: task.id,
          nextRunAt: nextRunAt ?? undefined,
        });

        fired.push(schedule.id);
        console.log(
          `[ScheduleTick] Fired schedule "${schedule.name}" (${schedule.id}) → task ${task.id}`
        );
      } catch (err) {
        console.error(
          `[ScheduleTick] Failed to fire schedule ${schedule.id}:`,
          err
        );
      }
    }

    return NextResponse.json({ fired: fired.length, scheduleIds: fired });
  } catch (err) {
    console.error("[ScheduleTick] Error:", err);
    return NextResponse.json(
      { error: "Tick failed", details: String(err) },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing in browser
export async function GET(request: NextRequest) {
  return POST(request);
}
