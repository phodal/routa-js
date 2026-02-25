/**
 * /api/workspaces/[workspaceId] - Single workspace CRUD.
 *
 * GET    /api/workspaces/:id  → Get workspace with its codebases
 * PATCH  /api/workspaces/:id  → Update workspace title
 * DELETE /api/workspaces/:id  → Delete workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const system = getRoutaSystem();

  const workspace = await system.workspaceStore.get(workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const codebases = await system.codebaseStore.listByWorkspace(workspaceId);

  return NextResponse.json({ workspace, codebases });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const body = await request.json();
  const { title } = body;

  const system = getRoutaSystem();

  const existing = await system.workspaceStore.get(workspaceId);
  if (!existing) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  await system.workspaceStore.updateTitle(workspaceId, title);
  const workspace = await system.workspaceStore.get(workspaceId);

  return NextResponse.json({ workspace });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;
  const system = getRoutaSystem();

  await system.workspaceStore.delete(workspaceId);

  return NextResponse.json({ deleted: true });
}
