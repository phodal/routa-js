/**
 * GET /api/github — List active GitHub virtual workspaces.
 *
 * Returns: { workspaces: Array<{ key, owner, repo, ref, fileCount, importedAt, expiresAt }> }
 */

import { NextResponse } from "next/server";
import { listActiveWorkspaces } from "@/core/github";

export const dynamic = "force-dynamic";

export async function GET() {
  const workspaces = listActiveWorkspaces();
  return NextResponse.json({ workspaces });
}
