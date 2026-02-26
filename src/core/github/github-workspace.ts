/**
 * GitHub Virtual Workspace
 *
 * Downloads a GitHub repo zipball and provides a virtual filesystem
 * for browsing and code review. Works on serverless (Vercel) by
 * extracting to /tmp, with in-memory fallback.
 *
 * Usage:
 *   const ws = await importGitHubRepo({ owner: "vercel", repo: "next.js" });
 *   const tree = ws.getTree();
 *   const content = ws.readFile("src/index.ts");
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ─── Types ───────────────────────────────────────────────────────────────

export interface GitHubImportOptions {
  owner: string;
  repo: string;
  ref?: string;           // branch/tag/sha — defaults to HEAD (default branch)
  token?: string;         // GitHub PAT for private repos
  maxSizeMB?: number;     // Max download size (default: 200MB)
}

export interface VirtualFileEntry {
  path: string;           // Relative path from repo root
  name: string;           // Filename only
  isDirectory: boolean;
  size?: number;          // File size in bytes (files only)
  children?: VirtualFileEntry[];
}

export interface GitHubWorkspace {
  owner: string;
  repo: string;
  ref: string;
  extractedPath: string;  // Absolute path to extracted root
  importedAt: Date;
  fileCount: number;

  /** Get the full file tree */
  getTree(): VirtualFileEntry[];
  /** Read a file's content */
  readFile(filePath: string): string;
  /** Check if a path exists */
  exists(filePath: string): boolean;
  /** Search files by fuzzy query */
  search(query: string, limit?: number): Array<{ path: string; name: string; score: number }>;
  /** Clean up extracted files */
  dispose(): void;
}

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_MAX_SIZE_MB = 200;
const WORKSPACE_TTL_MS = 60 * 60 * 1000; // 1 hour
const EXTRACT_BASE = path.join(os.tmpdir(), "routa-gh");

const IGNORE_PATTERNS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".cache",
  "coverage", ".turbo", "target", "__pycache__", ".venv", "venv",
]);

// ─── In-memory workspace registry ────────────────────────────────────────

interface WorkspaceEntry {
  workspace: GitHubWorkspace;
  expiresAt: number;
}

/**
 * Use globalThis so the registry survives Next.js dev-mode per-route
 * module re-evaluation. In production a single module instance is used,
 * but in dev each route bundle compiles its own copy of this file.
 */
const REGISTRY_KEY = "__routa_gh_registry__";
if (!(globalThis as Record<string, unknown>)[REGISTRY_KEY]) {
  (globalThis as Record<string, unknown>)[REGISTRY_KEY] = new Map<string, WorkspaceEntry>();
}
const registry = (globalThis as Record<string, unknown>)[REGISTRY_KEY] as Map<string, WorkspaceEntry>;

export function workspaceKey(owner: string, repo: string, ref: string): string {
  return `${owner}/${repo}@${ref}`;
}

/** Get a cached workspace if still valid */
export function getCachedWorkspace(owner: string, repo: string, ref: string): GitHubWorkspace | null {
  const key = workspaceKey(owner, repo, ref);
  const entry = registry.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    entry.workspace.dispose();
    registry.delete(key);
    return null;
  }
  return entry.workspace;
}

/** Evict expired workspaces */
export function cleanupExpired(): number {
  let cleaned = 0;
  for (const [key, entry] of registry) {
    if (Date.now() > entry.expiresAt) {
      entry.workspace.dispose();
      registry.delete(key);
      cleaned++;
    }
  }
  return cleaned;
}


// ─── Core: Download & Extract ────────────────────────────────────────────

/**
 * Import a GitHub repository by downloading its zipball.
 * Returns a GitHubWorkspace for browsing files.
 */
export async function importGitHubRepo(options: GitHubImportOptions): Promise<GitHubWorkspace> {
  const { owner, repo, ref = "HEAD", token, maxSizeMB = DEFAULT_MAX_SIZE_MB } = options;

  // Check cache first
  const cached = getCachedWorkspace(owner, repo, ref);
  if (cached) return cached;

  // Evict stale entries before importing
  cleanupExpired();

  // Download zipball
  const zipBuffer = await downloadZipball(owner, repo, ref, token, maxSizeMB);

  // Extract to /tmp
  const extractedPath = await extractZip(zipBuffer, owner, repo);

  // Build workspace
  const fileIndex = buildFileIndex(extractedPath);
  const workspace = createWorkspaceHandle(owner, repo, ref, extractedPath, fileIndex);

  // Cache it
  registry.set(workspaceKey(owner, repo, ref), {
    workspace,
    expiresAt: Date.now() + WORKSPACE_TTL_MS,
  });

  return workspace;
}

async function downloadZipball(
  owner: string,
  repo: string,
  ref: string,
  token?: string,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
): Promise<Buffer> {
  // Use codeload.github.com for direct zip download (faster, no redirect)
  // For HEAD, use the default branch — GitHub resolves it automatically
  const refParam = ref === "HEAD" ? "HEAD" : ref;
  const url = `https://codeload.github.com/${owner}/${repo}/zip/${refParam}`;

  const headers: Record<string, string> = {
    "User-Agent": "routa-github-workspace",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new GitHubWorkspaceError(
        `Repository not found: ${owner}/${repo} (ref: ${ref}). Check the name or provide a GITHUB_TOKEN for private repos.`,
        "NOT_FOUND",
      );
    }
    if (response.status === 403) {
      throw new GitHubWorkspaceError(
        `Rate limited or forbidden: ${owner}/${repo}. Provide a GITHUB_TOKEN to increase limits.`,
        "FORBIDDEN",
      );
    }
    throw new GitHubWorkspaceError(
      `GitHub download failed: HTTP ${response.status}`,
      "DOWNLOAD_FAILED",
    );
  }

  // Check content-length if available
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const sizeMB = parseInt(contentLength, 10) / (1024 * 1024);
    if (sizeMB > maxSizeMB) {
      throw new GitHubWorkspaceError(
        `Repository too large: ${sizeMB.toFixed(1)}MB exceeds ${maxSizeMB}MB limit`,
        "TOO_LARGE",
      );
    }
  }

  const buf = Buffer.from(await response.arrayBuffer());

  // Double-check actual size when content-length was missing or incorrect
  const actualMB = buf.byteLength / (1024 * 1024);
  if (actualMB > maxSizeMB) {
    throw new GitHubWorkspaceError(
      `Repository too large: ${actualMB.toFixed(1)}MB exceeds ${maxSizeMB}MB limit`,
      "TOO_LARGE",
    );
  }

  return buf;
}

async function extractZip(zipBuffer: Buffer, owner: string, repo: string): Promise<string> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(zipBuffer);

  // Ensure base extraction directory exists
  fs.mkdirSync(EXTRACT_BASE, { recursive: true });

  const targetDir = path.join(EXTRACT_BASE, `${owner}--${repo}`);

  // Clean previous extraction if exists
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  // Extract to a temp dir first, then find the repo root
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "routa-gh-extract-"));
  try {
    zip.extractAllTo(tmpDir, true);

    // GitHub zips have a single top-level directory like "repo-branch/"
    const topDirs = fs.readdirSync(tmpDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (topDirs.length !== 1) {
      throw new GitHubWorkspaceError("Unexpected archive layout", "EXTRACT_FAILED");
    }

    const repoRoot = path.join(tmpDir, topDirs[0].name);

    // Move to stable path — renameSync fails across devices (EXDEV),
    // so fall back to recursive copy + delete.
    try {
      fs.renameSync(repoRoot, targetDir);
    } catch (renameErr: unknown) {
      if ((renameErr as NodeJS.ErrnoException).code === "EXDEV") {
        fs.cpSync(repoRoot, targetDir, { recursive: true });
        fs.rmSync(repoRoot, { recursive: true, force: true });
      } else {
        throw renameErr;
      }
    }

    return targetDir;
  } finally {
    // Clean up temp dir (repoRoot was moved out)
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

// ─── File Index ──────────────────────────────────────────────────────────

interface FileIndex {
  tree: VirtualFileEntry[];
  paths: string[];          // Flat list of all file paths for search
  fileCount: number;
}

function buildFileIndex(rootDir: string): FileIndex {
  const paths: string[] = [];
  const tree = scanDirectory(rootDir, rootDir, paths);
  return { tree, paths, fileCount: paths.length };
}

function scanDirectory(dir: string, rootDir: string, paths: string[]): VirtualFileEntry[] {
  const entries: VirtualFileEntry[] = [];

  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  // Sort: directories first, then files, alphabetically
  dirEntries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of dirEntries) {
    if (IGNORE_PATTERNS.has(entry.name)) continue;
    if (entry.name.startsWith(".")) continue; // skip dotfiles in tree

    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      const children = scanDirectory(fullPath, rootDir, paths);
      entries.push({
        path: relativePath,
        name: entry.name,
        isDirectory: true,
        children,
      });
    } else if (entry.isFile()) {
      let size: number | undefined;
      try {
        size = fs.statSync(fullPath).size;
      } catch {
        // skip
      }
      paths.push(relativePath);
      entries.push({
        path: relativePath,
        name: entry.name,
        isDirectory: false,
        size,
      });
    }
  }

  return entries;
}

// ─── Workspace Handle ────────────────────────────────────────────────────

function createWorkspaceHandle(
  owner: string,
  repo: string,
  ref: string,
  extractedPath: string,
  index: FileIndex,
): GitHubWorkspace {
  return {
    owner,
    repo,
    ref,
    extractedPath,
    importedAt: new Date(),
    fileCount: index.fileCount,

    getTree() {
      return index.tree;
    },

    readFile(filePath: string): string {
      const absPath = path.resolve(extractedPath, filePath);
      // Security: ensure the resolved path is within extractedPath
      if (!absPath.startsWith(extractedPath + path.sep) && absPath !== extractedPath) {
        throw new GitHubWorkspaceError(`Path traversal denied: ${filePath}`, "FORBIDDEN");
      }
      if (!fs.existsSync(absPath)) {
        throw new GitHubWorkspaceError(`File not found: ${filePath}`, "NOT_FOUND");
      }
      return fs.readFileSync(absPath, "utf-8");
    },

    exists(filePath: string): boolean {
      const absPath = path.resolve(extractedPath, filePath);
      if (!absPath.startsWith(extractedPath + path.sep) && absPath !== extractedPath) {
        return false;
      }
      return fs.existsSync(absPath);
    },

    search(query: string, limit = 20): Array<{ path: string; name: string; score: number }> {
      if (!query.trim()) {
        return index.paths.slice(0, limit).map((p) => ({
          path: p,
          name: path.basename(p),
          score: 0,
        }));
      }

      const queryLower = query.toLowerCase();
      const results: Array<{ path: string; name: string; score: number }> = [];

      for (const filePath of index.paths) {
        const score = fuzzyScore(queryLower, filePath.toLowerCase(), path.basename(filePath).toLowerCase());
        if (score > 0) {
          results.push({ path: filePath, name: path.basename(filePath), score });
        }
      }

      results.sort((a, b) => b.score - a.score);
      return results.slice(0, limit);
    },

    dispose() {
      try {
        if (fs.existsSync(extractedPath)) {
          fs.rmSync(extractedPath, { recursive: true, force: true });
        }
      } catch {
        // best-effort
      }
    },
  };
}

// ─── Fuzzy Search ────────────────────────────────────────────────────────

function fuzzyScore(query: string, target: string, fileName: string): number {
  if (target === query) return 1000;
  if (target.includes(query)) {
    if (fileName.startsWith(query)) return 900;
    if (fileName.includes(query)) return 800;
    return 700;
  }

  let score = 0;
  let qi = 0;
  let consecutive = 0;

  for (let i = 0; i < target.length && qi < query.length; i++) {
    if (target[i] === query[qi]) {
      score += 10 + consecutive;
      consecutive += 5;
      qi++;
    } else {
      consecutive = 0;
    }
  }

  return qi < query.length ? 0 : score + Math.max(0, 100 - target.length);
}

// ─── Error ───────────────────────────────────────────────────────────────

export type GitHubWorkspaceErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "DOWNLOAD_FAILED"
  | "TOO_LARGE"
  | "EXTRACT_FAILED";

export class GitHubWorkspaceError extends Error {
  constructor(
    message: string,
    public code: GitHubWorkspaceErrorCode,
  ) {
    super(message);
    this.name = "GitHubWorkspaceError";
  }
}

// ─── Utility: list all active workspaces ─────────────────────────────────

export function listActiveWorkspaces(): Array<{
  key: string;
  owner: string;
  repo: string;
  ref: string;
  fileCount: number;
  importedAt: Date;
  expiresAt: Date;
}> {
  cleanupExpired();
  const result: Array<{
    key: string;
    owner: string;
    repo: string;
    ref: string;
    fileCount: number;
    importedAt: Date;
    expiresAt: Date;
  }> = [];

  for (const [key, entry] of registry) {
    const ws = entry.workspace;
    result.push({
      key,
      owner: ws.owner,
      repo: ws.repo,
      ref: ws.ref,
      fileCount: ws.fileCount,
      importedAt: ws.importedAt,
      expiresAt: new Date(entry.expiresAt),
    });
  }

  return result;
}
