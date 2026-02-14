/**
 * Skill Clone API Route - /api/skills/clone
 *
 * Clones a GitHub repository that contains skills (e.g. vercel-labs/agent-skills)
 * and imports them into the local .agents/skills/ directory.
 *
 * POST /api/skills/clone
 *   Body: { url: string, skillsDir?: string }
 *   - url: GitHub URL or owner/repo format
 *   - skillsDir: subdirectory in the repo where skills live (default: "skills")
 *   Returns: { success: true, imported: string[], path: string }
 *
 * GET /api/skills/clone?repoPath=/path/to/repo
 *   Discovers skills from an already-cloned repo path
 *   Returns: { skills: SkillSummary[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { parseGitHubUrl, getCloneBaseDir, repoToDirName } from "@/core/git";
import { discoverSkillsFromPath } from "@/core/skills";

const LOCAL_SKILLS_DIR = ".agents/skills";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, skillsDir = "skills" } = body as {
      url?: string;
      skillsDir?: string;
    };

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing 'url' field" },
        { status: 400 }
      );
    }

    // Parse GitHub URL
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Invalid GitHub URL. Expected: https://github.com/owner/repo or owner/repo",
        },
        { status: 400 }
      );
    }

    const { owner, repo } = parsed;
    const repoName = repoToDirName(owner, repo);

    // Clone to a temporary directory under the clone base
    const baseDir = getCloneBaseDir();
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
        // Pull failed, use existing
      }
    } else {
      // Shallow clone to save time/space
      const cloneUrl = `https://github.com/${owner}/${repo}.git`;
      execSync(`git clone --depth 1 "${cloneUrl}" "${targetDir}"`, {
        stdio: "pipe",
        timeout: 120000,
      });
    }

    // Discover skills from the cloned repo
    const discovered = discoverSkillsFromPath(targetDir);

    if (discovered.length === 0) {
      return NextResponse.json(
        {
          error: `No skills found in ${owner}/${repo}. Checked: skills/, .agents/skills/, .opencode/skills/, .claude/skills/`,
        },
        { status: 404 }
      );
    }

    // Copy discovered skills to .agents/skills/
    const localSkillsBase = path.join(process.cwd(), LOCAL_SKILLS_DIR);
    fs.mkdirSync(localSkillsBase, { recursive: true });

    const imported: string[] = [];

    for (const skill of discovered) {
      const skillSourceDir = path.dirname(skill.source);
      const skillTargetDir = path.join(localSkillsBase, skill.name);

      // Copy the entire skill directory
      copyDirRecursive(skillSourceDir, skillTargetDir);
      imported.push(skill.name);
    }

    return NextResponse.json({
      success: true,
      imported,
      count: imported.length,
      repoPath: targetDir,
      source: `${owner}/${repo}`,
    });
  } catch (err) {
    console.error("[skills/clone] Failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to clone skill repository",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/skills/clone?repoPath=/path/to/repo
 * Discover skills from a repo path without importing them.
 */
export async function GET(request: NextRequest) {
  const repoPath = request.nextUrl.searchParams.get("repoPath");

  if (!repoPath) {
    return NextResponse.json(
      { error: "Missing 'repoPath' query parameter" },
      { status: 400 }
    );
  }

  if (!fs.existsSync(repoPath)) {
    return NextResponse.json(
      { error: `Path not found: ${repoPath}` },
      { status: 404 }
    );
  }

  try {
    const discovered = discoverSkillsFromPath(repoPath);
    return NextResponse.json({
      skills: discovered.map((s) => ({
        name: s.name,
        description: s.description,
        license: s.license,
        compatibility: s.compatibility,
        source: s.source,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to discover skills from repo",
      },
      { status: 500 }
    );
  }
}

/**
 * Recursively copy a directory
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip .git directories
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
