/**
 * /api/workspaces/[workspaceId]/archive - Archive a workspace.
 *
 * POST /api/workspaces/:id/archive → Set status to "archived"
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const system = getRoutaSystem();

  const existing = await system.workspaceStore.get(workspaceId);
  if (!existing) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await system.workspaceStore.updateStatus(workspaceId, "archived");
  const workspace = await system.workspaceStore.get(workspaceId);

  return NextResponse.json({ workspace });
}
