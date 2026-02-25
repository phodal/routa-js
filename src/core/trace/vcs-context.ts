/**
 * VCS Context Provider for Agent Trace
 *
 * Populates TraceVcs with Git information (revision, branch, repo_root).
 * Uses existing git utilities from src/core/git.
 */

import { getServerBridge } from "@/core/platform";
import type { TraceVcs } from "./types";

/**
 * Get VCS context for a workspace directory.
 * Returns Git information if the directory is a git repository.
 */
export async function getVcsContext(cwd: string): Promise<TraceVcs | undefined> {
  const bridge = getServerBridge();

  // Check if git is available and this is a repo
  try {
    const revParseResult = await bridge.process.exec("git rev-parse --git-dir", { cwd });
    if (!revParseResult.stdout.trim()) {
      return undefined; // Not a git repo
    }
  } catch {
    return undefined; // Git not available or not a repo
  }

  // Get current commit (revision)
  let revision: string | undefined;
  try {
    const revResult = await bridge.process.exec("git rev-parse HEAD", { cwd });
    revision = revResult.stdout.trim();
  } catch {
    // Ignore errors
  }

  // Get current branch
  let branch: string | undefined;
  try {
    const branchResult = await bridge.process.exec("git rev-parse --abbrev-ref HEAD", { cwd });
    branch = branchResult.stdout.trim();
    if (branch === "HEAD") {
      // Detached HEAD state - try to get the branch name from ref
      try {
        const refResult = await bridge.process.exec("git symbolic-ref --short HEAD", { cwd });
        branch = refResult.stdout.trim() || undefined;
      } catch {
        branch = undefined;
      }
    }
  } catch {
    // Ignore errors
  }

  // Get repo root (git rev-parse --show-toplevel)
  let repoRoot: string | undefined;
  try {
    const rootResult = await bridge.process.exec("git rev-parse --show-toplevel", { cwd });
    repoRoot = rootResult.stdout.trim();
  } catch {
    // Ignore errors
  }

  // Only return Vcs context if we have at least some info
  if (revision || branch || repoRoot) {
    return {
      revision,
      branch,
      repoRoot,
    };
  }

  return undefined;
}

/**
 * Get VCS context synchronously (for hot paths where async is not possible).
 * This uses execSync and may block, so use sparingly.
 */
export function getVcsContextSync(cwd: string): TraceVcs | undefined {
  const bridge = getServerBridge();

  // Check if this is a git repo
  try {
    const isRepo = bridge.process.execSync("git rev-parse --git-dir", { cwd });
    if (!isRepo.trim()) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  // Get current commit
  let revision: string | undefined;
  try {
    revision = bridge.process.execSync("git rev-parse HEAD", { cwd }).trim();
  } catch {
    // Ignore
  }

  // Get current branch
  let branch: string | undefined;
  try {
    branch = bridge.process.execSync("git rev-parse --abbrev-ref HEAD", { cwd }).trim();
    if (branch === "HEAD") {
      branch = undefined;
    }
  } catch {
    // Ignore
  }

  // Get repo root
  let repoRoot: string | undefined;
  try {
    repoRoot = bridge.process.execSync("git rev-parse --show-toplevel", { cwd }).trim();
  } catch {
    // Ignore
  }

  if (revision || branch || repoRoot) {
    return {
      revision,
      branch,
      repoRoot,
    };
  }

  return undefined;
}

/**
 * Lightweight VCS context that only gets branch name.
 * Useful for hot paths where full context is too expensive.
 */
export function getVcsContextLight(cwd: string): Pick<TraceVcs, "branch"> | undefined {
  const bridge = getServerBridge();

  try {
    const branch = bridge.process.execSync("git rev-parse --abbrev-ref HEAD", { cwd }).trim();
    if (branch && branch !== "HEAD") {
      return { branch };
    }
  } catch {
    // Ignore
  }

  return undefined;
}
