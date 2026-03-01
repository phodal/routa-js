/**
 * /api/schedules — CRUD API for cron-based agent trigger schedules.
 *
 * GET    /api/schedules?workspaceId=...  → List schedules for workspace
 * POST   /api/schedules                  → Create a new schedule
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { v4 as uuidv4 } from "uuid";
import { getNextRunTime } from "@/core/scheduling/cron-utils";

export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const workspaceId = searchParams.get("workspaceId") ?? "default";

    const system = getRoutaSystem();
    const schedules = await system.scheduleStore.listByWorkspace(workspaceId);

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[Schedules] GET error:", err);
    return NextResponse.json(
      { error: "Failed to list schedules", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const {
      name,
      cronExpr,
      taskPrompt,
      agentId,
      workspaceId = "default",
      enabled = true,
      promptTemplate,
    } = body;

    if (!name || !cronExpr || !taskPrompt || !agentId) {
      return NextResponse.json(
        { error: "Required: name, cronExpr, taskPrompt, agentId" },
        { status: 400 }
      );
    }

    // Validate cron expression
    const { isValid, error: cronError } = validateCronExpr(cronExpr);
    if (!isValid) {
      return NextResponse.json(
        { error: `Invalid cron expression: ${cronError}` },
        { status: 400 }
      );
    }

    const system = getRoutaSystem();
    const schedule = await system.scheduleStore.create({
      id: uuidv4(),
      name,
      cronExpr,
      taskPrompt,
      agentId,
      workspaceId,
      enabled,
      promptTemplate,
    });

    // Compute and persist the first nextRunAt
    const nextRunAt = getNextRunTime(cronExpr);
    if (nextRunAt) {
      await system.scheduleStore.update(schedule.id, { nextRunAt });
      schedule.nextRunAt = nextRunAt;
    }

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (err) {
    console.error("[Schedules] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create schedule", details: String(err) },
      { status: 500 }
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validateCronExpr(expr: string): { isValid: boolean; error?: string } {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    return { isValid: false, error: "Must have exactly 5 fields: min hour dom mon dow" };
  }
  return { isValid: true };
}
