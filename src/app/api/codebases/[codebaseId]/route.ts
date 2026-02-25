/**
 * /api/codebases/[codebaseId] - Single codebase operations.
 *
 * PATCH  /api/codebases/:id → Update branch/label
 * DELETE /api/codebases/:id → Remove codebase
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  const { codebaseId } = await params;
  const body = await request.json();
  const { branch, label } = body;

  const system = getRoutaSystem();

  await system.codebaseStore.update(codebaseId, { branch, label });
  const codebase = await system.codebaseStore.get(codebaseId);

  return NextResponse.json({ codebase });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  const { codebaseId } = await params;
  const system = getRoutaSystem();

  await system.codebaseStore.remove(codebaseId);

  return NextResponse.json({ deleted: true });
}
