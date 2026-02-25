/**
 * File Changes Tracker - Track file modifications from tool execution results
 *
 * Extracts file change information from:
 * - tool_call_update events (Edit, Write tools)
 * - report_to_parent tool's filesModified field
 * - task_completion events
 */

export type FileOperation = "created" | "modified" | "deleted";

export interface FileChange {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  operation: FileOperation;
}

export interface FileChangesState {
  files: Map<string, FileChange>;
  totalAdded: number;
  totalRemoved: number;
}

/**
 * Create an empty file changes state
 */
export function createFileChangesState(): FileChangesState {
  return {
    files: new Map(),
    totalAdded: 0,
    totalRemoved: 0,
  };
}

/**
 * Update file changes state with a new file change
 */
export function updateFileChange(
  state: FileChangesState,
  change: FileChange
): FileChangesState {
  const existing = state.files.get(change.path);

  if (existing) {
    // Update existing entry - accumulate changes
    const updated: FileChange = {
      path: change.path,
      linesAdded: existing.linesAdded + change.linesAdded,
      linesRemoved: existing.linesRemoved + change.linesRemoved,
      operation: change.operation === "deleted" ? "deleted" : existing.operation,
    };
    state.files.set(change.path, updated);
    state.totalAdded += change.linesAdded;
    state.totalRemoved += change.linesRemoved;
  } else {
    // New entry
    state.files.set(change.path, change);
    state.totalAdded += change.linesAdded;
    state.totalRemoved += change.linesRemoved;
  }

  return state;
}

/**
 * Extract file change from tool execution result
 */
export function extractFileChangeFromToolResult(
  toolName: string,
  rawOutput: string | undefined,
  rawInput?: Record<string, unknown>
): FileChange | null {
  if (!rawOutput) return null;

  const path = (rawInput?.path as string) || (rawInput?.file_path as string);
  if (!path) return null;

  // Determine operation based on tool name
  let operation: FileOperation = "modified";
  const normalizedTool = toolName.toLowerCase();

  if (normalizedTool.includes("write") || normalizedTool.includes("create") || normalizedTool === "save-file") {
    // Check if it's a new file vs modification
    if (rawOutput.includes("created") || rawOutput.includes("new file")) {
      operation = "created";
    }
  } else if (normalizedTool.includes("delete") || normalizedTool.includes("remove")) {
    operation = "deleted";
  }

  // Try to extract line counts from output
  let linesAdded = 0;
  let linesRemoved = 0;

  // Pattern: "+123 -45" or "added 123, removed 45"
  const lineCountMatch = rawOutput.match(/\+(\d+)\s*-(\d+)/);
  if (lineCountMatch) {
    linesAdded = parseInt(lineCountMatch[1], 10);
    linesRemoved = parseInt(lineCountMatch[2], 10);
  } else {
    // Count newlines in content for Write tool
    const content = rawInput?.content as string;
    if (content && operation === "created") {
      linesAdded = content.split("\n").length;
    }
  }

  return { path, linesAdded, linesRemoved, operation };
}

/**
 * Extract file changes from filesModified array (report_to_parent, task_completion)
 */
export function extractFilesModified(filesModified: string[] | undefined): FileChange[] {
  if (!filesModified || !Array.isArray(filesModified)) return [];

  return filesModified.map((path) => ({
    path,
    linesAdded: 0,
    linesRemoved: 0,
    operation: "modified" as FileOperation,
  }));
}

/**
 * Get summary statistics
 */
export function getFileChangesSummary(state: FileChangesState): {
  fileCount: number;
  totalAdded: number;
  totalRemoved: number;
} {
  return {
    fileCount: state.files.size,
    totalAdded: state.totalAdded,
    totalRemoved: state.totalRemoved,
  };
}

