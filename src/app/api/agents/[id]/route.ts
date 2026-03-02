/**
 * GET  /api/agents/[id] — Get a single agent by ID
 * DELETE /api/agents/[id] — Delete an agent by ID
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const system = getRoutaSystem();
  const result = await system.tools.getAgentStatus(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result.data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const system = getRoutaSystem();
  // getAgentStatus acts as existence check; delete via store directly
  await system.agentStore.delete(id);
  return NextResponse.json({ deleted: true, id });
}
