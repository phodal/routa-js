/**
 * Codebase model
 *
 * Represents a Git repository associated with a Workspace.
 * A Workspace can have multiple Codebases (e.g., microservices).
 */

export interface Codebase {
  id: string;
  workspaceId: string;
  repoPath: string;
  branch?: string;
  label?: string;
  isDefault: boolean;
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
}): Codebase {
  const now = new Date();
  return {
    id: params.id,
    workspaceId: params.workspaceId,
    repoPath: params.repoPath,
    branch: params.branch,
    label: params.label,
    isDefault: params.isDefault ?? false,
    createdAt: now,
    updatedAt: now,
  };
}
