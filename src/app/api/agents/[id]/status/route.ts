/**
 * POST /api/agents/[id]/status — Update agent status by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { status } = body as { status?: string };

  if (!status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const system = getRoutaSystem();
  await system.agentStore.updateStatus(id, status as never);
  return NextResponse.json({ updated: true, id, status });
}
