/**
 * GET /api/github/search?owner=X&repo=Y&q=Z&ref=R&limit=20 — Search files in an imported GitHub repo.
 *
 * Returns: { files: Array<{ path, name, score }>, total: number, query: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCachedWorkspace } from "@/core/github";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  const repo = request.nextUrl.searchParams.get("repo");
  const query = request.nextUrl.searchParams.get("q") || "";
  const ref = request.nextUrl.searchParams.get("ref") || "HEAD";
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 20;

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing 'owner' and 'repo' query parameters" },
      { status: 400 },
    );
  }

  const workspace = getCachedWorkspace(owner, repo, ref);
  if (!workspace) {
    return NextResponse.json(
      { error: `Workspace not imported. POST /api/github/import first for ${owner}/${repo}` },
      { status: 404 },
    );
  }

  const files = workspace.search(query, limit);

  return NextResponse.json({
    files,
    total: files.length,
    query,
  });
}
