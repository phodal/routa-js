/**
 * Workspace model
 *
 * Top-level organizational unit in Routa. Every agent, task, note,
 * session, and codebase belongs to exactly one workspace.
 */

export type WorkspaceStatus = "active" | "archived";

export interface Workspace {
  id: string;
  title: string;
  status: WorkspaceStatus;
  metadata: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export function createWorkspace(params: {
  id: string;
  title: string;
  metadata?: Record<string, string>;
}): Workspace {
  const now = new Date();
  return {
    id: params.id,
    title: params.title,
    status: "active",
    metadata: params.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
}
