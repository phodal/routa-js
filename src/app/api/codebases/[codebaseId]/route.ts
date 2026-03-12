/**
 * /api/codebases/[codebaseId] - Single codebase operations.
 *
 * PATCH  /api/codebases/:id → Update branch/label
 * DELETE /api/codebases/:id → Remove codebase
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";
import { GitWorktreeService } from "@/core/git/git-worktree-service";
import { resolveCodebaseSource } from "@/app/api/codebases/codebase-source";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  const { codebaseId } = await params;
  const body = await request.json();
  const { branch, label, repoPath, sourceType, sourceUrl } = body as {
    branch?: string;
    label?: string;
    repoPath?: string;
    sourceType?: "local" | "github";
    sourceUrl?: string;
  };

  const system = getRoutaSystem();

  const source = repoPath ? resolveCodebaseSource(repoPath) : {};
  const updates: {
    branch?: string;
    label?: string;
    repoPath?: string;
    sourceType?: "local" | "github";
    sourceUrl?: string;
  } = {};

  if (branch !== undefined) updates.branch = branch;
  if (label !== undefined) updates.label = label;
  if (repoPath !== undefined) updates.repoPath = repoPath;
  if (typeof sourceType === "string" && sourceType.trim()) updates.sourceType = sourceType;
  if (typeof sourceUrl === "string" && sourceUrl.trim()) updates.sourceUrl = sourceUrl;
  if (repoPath !== undefined) {
    if (source.sourceType) updates.sourceType = source.sourceType;
    if (source.sourceUrl) updates.sourceUrl = source.sourceUrl;
  }

  if (Object.keys(updates).length > 0) {
    await system.codebaseStore.update(codebaseId, updates);
  }
  const codebase = await system.codebaseStore.get(codebaseId);

  return NextResponse.json({ codebase });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ codebaseId: string }> }
) {
  const { codebaseId } = await params;
  const system = getRoutaSystem();

  // Clean up worktrees on disk before deleting the codebase
  try {
    const service = new GitWorktreeService(system.worktreeStore, system.codebaseStore);
    await service.removeAllForCodebase(codebaseId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Codebase DELETE] Worktree cleanup failed for ${codebaseId}:`, message);
    return NextResponse.json(
      { error: `Worktree cleanup failed: ${message}` },
      { status: 500 }
    );
  }

  await system.codebaseStore.remove(codebaseId);

  return NextResponse.json({ deleted: true });
}
