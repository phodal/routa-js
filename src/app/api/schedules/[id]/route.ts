/**
 * /api/schedules/[id] — Get, Update, Delete a specific schedule.
 *
 * GET    /api/schedules/[id]  → Get a single schedule
 * PATCH  /api/schedules/[id]  → Update fields (name, cronExpr, enabled, etc.)
 * DELETE /api/schedules/[id]  → Delete a schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { getNextRunTime } from "@/core/scheduling/cron-utils";

export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
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
    return NextResponse.json({ schedule });
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to get schedule", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const system = getRoutaSystem();
    const existing = await system.scheduleStore.get(id);
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    const { name, cronExpr, taskPrompt, agentId, enabled, promptTemplate } = body;

    // If cronExpr changed, recompute nextRunAt
    let nextRunAt = existing.nextRunAt;
    if (cronExpr && cronExpr !== existing.cronExpr) {
      nextRunAt = getNextRunTime(cronExpr) ?? undefined;
    }

    await system.scheduleStore.update(id, {
      ...(name !== undefined && { name }),
      ...(cronExpr !== undefined && { cronExpr }),
      ...(taskPrompt !== undefined && { taskPrompt }),
      ...(agentId !== undefined && { agentId }),
      ...(enabled !== undefined && { enabled }),
      ...(promptTemplate !== undefined && { promptTemplate }),
      ...(nextRunAt !== undefined && { nextRunAt }),
    });

    const updated = await system.scheduleStore.get(id);
    return NextResponse.json({ schedule: updated });
  } catch (err) {
    console.error("[Schedules] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update schedule", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const system = getRoutaSystem();
    const existing = await system.scheduleStore.get(id);
    if (!existing) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }
    await system.scheduleStore.delete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Schedules] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete schedule", details: String(err) },
      { status: 500 }
    );
  }
}
