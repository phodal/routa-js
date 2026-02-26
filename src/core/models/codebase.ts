/**
 * Codebase model
 *
 * Represents a Git repository associated with a Workspace.
 * A Workspace can have multiple Codebases (e.g., microservices).
 *
 * Supports two source types:
 *   - "local" (default): repoPath points to a local directory
 *   - "github": repoPath points to extracted temp dir, sourceUrl has the GitHub origin
 */

export type CodebaseSourceType = "local" | "github";

export interface Codebase {
  id: string;
  workspaceId: string;
  repoPath: string;
  branch?: string;
  label?: string;
  isDefault: boolean;
  /** Where the codebase comes from. Defaults to "local" for backward compat. */
  sourceType?: CodebaseSourceType;
  /** Original URL for non-local sources (e.g. "https://github.com/owner/repo") */
  sourceUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export function createCodebase(params: {
  id: string;
  workspaceId: string;
  repoPath: string;
  branch?: string;
  label?: string;
  isDefault?: boolean;
  sourceType?: CodebaseSourceType;
  sourceUrl?: string;
}): Codebase {
  const now = new Date();
  return {
    id: params.id,
    workspaceId: params.workspaceId,
    repoPath: params.repoPath,
    branch: params.branch,
    label: params.label,
    isDefault: params.isDefault ?? false,
    sourceType: params.sourceType,
    sourceUrl: params.sourceUrl,
    createdAt: now,
    updatedAt: now,
  };
}
