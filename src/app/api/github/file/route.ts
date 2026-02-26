/**
 * GET /api/github/file?owner=X&repo=Y&path=Z&ref=R — Read a file from an imported GitHub repo.
 *
 * Returns: { content: string, path: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getCachedWorkspace, GitHubWorkspaceError } from "@/core/github";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  const repo = request.nextUrl.searchParams.get("repo");
  const filePath = request.nextUrl.searchParams.get("path");
  const ref = request.nextUrl.searchParams.get("ref") || "HEAD";

  if (!owner || !repo || !filePath) {
    return NextResponse.json(
      { error: "Missing 'owner', 'repo', or 'path' query parameters" },
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

  try {
    const content = workspace.readFile(filePath);
    return NextResponse.json({ content, path: filePath });
  } catch (err) {
    // Use name + code check to survive cross-bundle instanceof failures in dev mode
    if (err instanceof GitHubWorkspaceError || (err instanceof Error && err.name === "GitHubWorkspaceError")) {
      const code = (err as GitHubWorkspaceError).code;
      const status = code === "NOT_FOUND" ? 404 : code === "FORBIDDEN" ? 403 : 500;
      return NextResponse.json({ error: err.message, code }, { status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Read failed" },
      { status: 500 },
    );
  }
}
