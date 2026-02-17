/**
 * Skill Catalog API Route - /api/skills/catalog
 *
 * Browse and install skills from remote GitHub catalogs (e.g. openai/skills).
 * Uses the GitHub Contents API for lightweight listing (no git clone needed)
 * and zip download for selective installation.
 *
 * GET /api/skills/catalog?repo=openai/skills&path=skills/.curated&ref=main
 *   Lists available skills in a remote catalog
 *   Returns: { skills: CatalogSkill[], repo, path }
 *
 * POST /api/skills/catalog
 *   Installs specific skill(s) from a catalog
 *   Body: { repo, path, ref?, skills: string[], dest? }
 *   Returns: { success, installed: string[], errors: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DEFAULT_CATALOG_REPO = "openai/skills";
const DEFAULT_CATALOG_PATH = "skills/.curated";
const DEFAULT_REF = "main";

interface CatalogSkill {
  name: string;
  installed: boolean;
}

interface GitHubContentsEntry {
  name: string;
  type: "file" | "dir" | "symlink";
  path: string;
  sha: string;
}

function getGitHubToken(): string | undefined {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
}

async function githubRequest(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": "routa-skill-catalog",
    Accept: "application/vnd.github.v3+json",
  };
  const token = getGitHubToken();
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }
  return fetch(url, { headers });
}

function getInstalledSkillNames(): Set<string> {
  const installed = new Set<string>();

  const skillDirs = [
    path.join(process.cwd(), ".agents/skills"),
    path.join(process.cwd(), ".codex/skills"),
    path.join(os.homedir(), ".codex/skills"),
    path.join(os.homedir(), ".agents/skills"),
  ];

  for (const dir of skillDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          installed.add(entry.name);
        }
      }
    } catch {
      // skip unreadable directories
    }
  }

  return installed;
}

/**
 * GET /api/skills/catalog
 * List skills from a remote GitHub catalog via Contents API.
 */
export async function GET(request: NextRequest) {
  const repo = request.nextUrl.searchParams.get("repo") || DEFAULT_CATALOG_REPO;
  const catalogPath = request.nextUrl.searchParams.get("path") || DEFAULT_CATALOG_PATH;
  const ref = request.nextUrl.searchParams.get("ref") || DEFAULT_REF;

  const apiUrl = `https://api.github.com/repos/${repo}/contents/${catalogPath}?ref=${ref}`;

  try {
    const response = await githubRequest(apiUrl);

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: `Catalog not found: https://github.com/${repo}/tree/${ref}/${catalogPath}` },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: `GitHub API error: HTTP ${response.status}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as GitHubContentsEntry[];

    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: "Unexpected response from GitHub API" },
        { status: 500 }
      );
    }

    const installed = getInstalledSkillNames();

    const skills: CatalogSkill[] = data
      .filter((entry) => entry.type === "dir")
      .map((entry) => ({
        name: entry.name,
        installed: installed.has(entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      skills,
      repo,
      path: catalogPath,
      ref,
    });
  } catch (err) {
    console.error("[skills/catalog] GET failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch catalog" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/skills/catalog
 * Install specific skills from a GitHub catalog.
 * Uses zip download (like Codex) for efficiency.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      repo = DEFAULT_CATALOG_REPO,
      path: catalogPath = DEFAULT_CATALOG_PATH,
      ref = DEFAULT_REF,
      skills: skillNames,
      dest,
    } = body as {
      repo?: string;
      path?: string;
      ref?: string;
      skills: string[];
      dest?: string;
    };

    if (!Array.isArray(skillNames) || skillNames.length === 0) {
      return NextResponse.json(
        { error: "Missing 'skills' array in request body" },
        { status: 400 }
      );
    }

    // Parse owner/repo
    const parts = repo.split("/");
    if (parts.length !== 2) {
      return NextResponse.json(
        { error: "Invalid repo format. Expected: owner/repo" },
        { status: 400 }
      );
    }
    const [owner, repoName] = parts;

    // Download the repo zip
    const zipUrl = `https://codeload.github.com/${owner}/${repoName}/zip/${ref}`;
    const zipResponse = await githubRequest(zipUrl);

    if (!zipResponse.ok) {
      return NextResponse.json(
        { error: `Failed to download repo: HTTP ${zipResponse.status}` },
        { status: zipResponse.status }
      );
    }

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());

    // Extract zip to a temp directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "routa-skill-install-"));

    try {
      // Use the built-in unzip approach
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip(zipBuffer);
      zip.extractAllTo(tmpDir, true);

      // Find the top-level directory in the zip (GitHub wraps in repo-ref/)
      const topDirs = fs
        .readdirSync(tmpDir, { withFileTypes: true })
        .filter((e) => e.isDirectory());

      if (topDirs.length !== 1) {
        return NextResponse.json(
          { error: "Unexpected archive layout" },
          { status: 500 }
        );
      }

      const repoRoot = path.join(tmpDir, topDirs[0].name);

      // Destination for installed skills
      const destBase = dest || path.join(os.homedir(), ".codex/skills");
      fs.mkdirSync(destBase, { recursive: true });

      const installed: string[] = [];
      const errors: string[] = [];

      for (const skillName of skillNames) {
        try {
          const skillSrc = path.join(repoRoot, catalogPath, skillName);

          if (!fs.existsSync(skillSrc) || !fs.statSync(skillSrc).isDirectory()) {
            errors.push(`Skill not found in catalog: ${skillName}`);
            continue;
          }

          const skillMdPath = path.join(skillSrc, "SKILL.md");
          if (!fs.existsSync(skillMdPath)) {
            errors.push(`No SKILL.md in ${skillName}`);
            continue;
          }

          const destDir = path.join(destBase, skillName);
          if (fs.existsSync(destDir)) {
            errors.push(`Already installed: ${skillName}`);
            continue;
          }

          copyDirRecursive(skillSrc, destDir);
          installed.push(skillName);
        } catch (err) {
          errors.push(
            `Failed to install ${skillName}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      return NextResponse.json({
        success: installed.length > 0,
        installed,
        errors,
        dest: destBase,
      });
    } finally {
      // Cleanup temp directory
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error("[skills/catalog] POST failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to install from catalog" },
      { status: 500 }
    );
  }
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
