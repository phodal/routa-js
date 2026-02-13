/**
 * Clone API Route - /api/clone
 *
 * POST /api/clone - Clone a GitHub repository to local directory
 *   Body: { url: string }
 *   Returns: { success: true, path: string, name: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const CLONE_BASE_DIR = ".routa/repos";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body as { url?: string };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing 'url' field" },
        { status: 400 }
      );
    }

    // Validate GitHub URL pattern
    const ghMatch = url.match(
      /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/\s#?.]+)/
    );
    if (!ghMatch) {
      return NextResponse.json(
        { error: "Invalid GitHub URL. Expected: https://github.com/owner/repo" },
        { status: 400 }
      );
    }

    const owner = ghMatch[1];
    const repo = ghMatch[2].replace(/\.git$/, "");
    const repoName = `${owner}--${repo}`;

    // Ensure base directory exists
    const baseDir = path.join(process.cwd(), CLONE_BASE_DIR);
    fs.mkdirSync(baseDir, { recursive: true });

    const targetDir = path.join(baseDir, repoName);

    if (fs.existsSync(targetDir)) {
      // Already cloned - pull latest
      try {
        execSync("git pull --ff-only", {
          cwd: targetDir,
          stdio: "pipe",
          timeout: 30000,
        });
      } catch {
        // Pull failed, that's ok - use existing
      }
      return NextResponse.json({
        success: true,
        path: targetDir,
        name: `${owner}/${repo}`,
        existed: true,
      });
    }

    // Clone the repository
    const cloneUrl = `https://github.com/${owner}/${repo}.git`;
    execSync(`git clone --depth 1 "${cloneUrl}" "${targetDir}"`, {
      stdio: "pipe",
      timeout: 120000, // 2 minutes timeout
    });

    return NextResponse.json({
      success: true,
      path: targetDir,
      name: `${owner}/${repo}`,
      existed: false,
    });
  } catch (err) {
    console.error("[clone] Failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to clone repository",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/clone - List cloned repositories
 */
export async function GET() {
  try {
    const baseDir = path.join(process.cwd(), CLONE_BASE_DIR);
    if (!fs.existsSync(baseDir)) {
      return NextResponse.json({ repos: [] });
    }

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    const repos = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const fullPath = path.join(baseDir, e.name);
        const parts = e.name.split("--");
        return {
          name: parts.length === 2 ? `${parts[0]}/${parts[1]}` : e.name,
          path: fullPath,
          dirName: e.name,
        };
      });

    return NextResponse.json({ repos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list repos" },
      { status: 500 }
    );
  }
}
