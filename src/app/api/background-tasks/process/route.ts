/**
 * /api/background-tasks/process — Trigger the background worker.
 *
 * POST /api/background-tasks/process
 *   → Starts a dispatch cycle (for Vercel Cron or manual trigger).
 */

import { NextResponse } from "next/server";
import { getBackgroundWorker } from "@/core/background-worker";

export const dynamic = "force-dynamic";

export async function POST() {
  const worker = getBackgroundWorker();
  await worker.dispatchPending();
  await worker.checkCompletions();
  return NextResponse.json({ ok: true, dispatched: true });
}
