/**
 * /api/workspaces - REST API for workspace management.
 *
 * GET    /api/workspaces?status=active|archived  → List workspaces
 * POST   /api/workspaces                         → Create a workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { createWorkspace, WorkspaceStatus } from "@/core/models/workspace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") as WorkspaceStatus | null;
  const system = getRoutaSystem();

  const workspaces = status
    ? await system.workspaceStore.listByStatus(status)
    : await system.workspaceStore.list();

  return NextResponse.json({ workspaces });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { title } = body;

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const system = getRoutaSystem();
  const workspace = createWorkspace({
    id: crypto.randomUUID(),
    title,
  });

  await system.workspaceStore.save(workspace);

  return NextResponse.json({ workspace }, { status: 201 });
}
