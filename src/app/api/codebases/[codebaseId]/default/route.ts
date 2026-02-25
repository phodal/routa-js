/**
 * /api/codebases/[codebaseId]/default - Set codebase as default.
 *
 * POST /api/codebases/:id/default → Set as default codebase for its workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  const { codebaseId } = await params;
  const system = getRoutaSystem();

  const codebase = await system.codebaseStore.get(codebaseId);
  if (!codebase) {
    return NextResponse.json({ error: "Codebase not found" }, { status: 404 });
  }

  await system.codebaseStore.setDefault(codebase.workspaceId, codebaseId);
  const updated = await system.codebaseStore.get(codebaseId);

  return NextResponse.json({ codebase: updated });
}
