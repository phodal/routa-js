/**
 * POST /api/github/import — Import a GitHub repo as a virtual workspace.
 *
 * Body: { owner: string, repo: string, ref?: string }
 * Returns: { success: true, owner, repo, ref, fileCount, extractedPath, importedAt }
 *
 * Also accepts shorthand: { url: "https://github.com/owner/repo" }
 */

import { NextRequest, NextResponse } from "next/server";
import { importGitHubRepo, GitHubWorkspaceError } from "@/core/github";
import { parseGitHubUrl } from "@/core/git/git-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let { owner, repo, ref } = body as { owner?: string; repo?: string; ref?: string };

    // Support shorthand URL
    if (!owner && body.url) {
      const parsed = parseGitHubUrl(body.url);
      if (!parsed) {
        return NextResponse.json(
          { error: "Invalid GitHub URL. Expected: https://github.com/owner/repo or owner/repo" },
          { status: 400 },
        );
      }
      owner = parsed.owner;
      repo = parsed.repo;
    }

    if (!owner || !repo) {
      return NextResponse.json(
        { error: "Missing 'owner' and 'repo' fields (or provide 'url')" },
        { status: 400 },
      );
    }

    const token = process.env.GITHUB_TOKEN;
    const workspace = await importGitHubRepo({ owner, repo, ref, token });

    return NextResponse.json({
      success: true,
      owner: workspace.owner,
      repo: workspace.repo,
      ref: workspace.ref,
      fileCount: workspace.fileCount,
      extractedPath: workspace.extractedPath,
      importedAt: workspace.importedAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof GitHubWorkspaceError || (err instanceof Error && err.name === "GitHubWorkspaceError")) {
      const code = (err as GitHubWorkspaceError).code;
      const status = code === "NOT_FOUND" ? 404
        : code === "FORBIDDEN" ? 403
        : code === "TOO_LARGE" ? 413
        : 500;
      return NextResponse.json({ error: err.message, code }, { status });
    }
    console.error("[github/import] Failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 },
    );
  }
}
