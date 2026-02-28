/**
 * ACP Warmup API Route - /api/acp/warmup
 *
 * Pre-warms an npx or uvx agent package so the first real launch is instant.
 * Mirrors the Kotlin `AcpWarmupService` from the IntelliJ plugin.
 *
 * POST /api/acp/warmup
 *   Body: { agentId: string }
 *   Triggers warmup in background and returns immediately (fire-and-forget).
 *
 * POST /api/acp/warmup?sync=true
 *   Awaits completion and returns the result.
 *
 * GET  /api/acp/warmup?id=<agentId>
 *   Returns the current warmup status for an agent.
 *
 * GET  /api/acp/warmup
 *   Returns warmup status for all tracked agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { AcpWarmupService } from "@/core/acp/acp-warmup";

export const dynamic = "force-dynamic";

// ─── GET /api/acp/warmup ─────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const service = AcpWarmupService.getInstance();
  const agentId = request.nextUrl.searchParams.get("id");

  if (agentId) {
    return NextResponse.json(service.getStatus(agentId));
  }

  return NextResponse.json({ statuses: service.getAllStatuses() });
}

// ─── POST /api/acp/warmup ─────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId } = body as { agentId?: string };

    if (!agentId) {
      return NextResponse.json({ error: "Missing agentId" }, { status: 400 });
    }

    const sync = request.nextUrl.searchParams.get("sync") === "true";
    const service = AcpWarmupService.getInstance();

    if (sync) {
      // Wait for warmup to complete
      const ok = await service.warmup(agentId);
      return NextResponse.json({
        agentId,
        success: ok,
        status: service.getStatus(agentId),
      });
    }

    // Fire-and-forget
    service.warmupInBackground(agentId);

    return NextResponse.json({
      agentId,
      started: true,
      message: `Warmup started for agent "${agentId}" in the background`,
    });
  } catch (error) {
    console.error("[ACP Warmup API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Warmup failed" },
      { status: 500 }
    );
  }
}
