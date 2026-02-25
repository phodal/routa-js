/**
 * File Range Extractor for Agent Trace
 *
 * Extracts file paths and line ranges from tool call parameters
 * to populate TraceFile and TraceRange in trace records.
 *
 * Supports Claude Code tools (Read, Write, Edit, MultiEdit, NotebookEdit)
 * and generic file operations.
 */

import type { TraceFile, TraceRange } from "./types";

/**
 * File editing tools that we track for ranges.
 */
const FILE_EDIT_TOOLS = new Set([
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookRead",
  "NotebookEdit",
  // MCP tools may have prefixes like mcp__server__tool
]);

/**
 * Extract file information from tool call parameters.
 * Returns an array of TraceFile objects with ranges if applicable.
 */
export function extractFilesFromToolCall(
  toolName: string,
  params: Record<string, unknown> | undefined
): TraceFile[] {
  if (!params) return [];

  // Normalize tool name (strip MCP prefix)
  const baseToolName = normalizeToolName(toolName);

  if (!FILE_EDIT_TOOLS.has(baseToolName)) {
    return [];
  }

  const files: TraceFile[] = [];

  switch (baseToolName) {
    case "Read":
    case "Write": {
      const filePath = params.file_path as string | undefined ?? params.path as string | undefined;
      if (filePath) {
        files.push({
          path: filePath,
          operation: baseToolName === "Read" ? "read" : "write",
        });
      }
      break;
    }

    case "Edit": {
      const filePath = params.file_path as string | undefined ?? params.path as string | undefined;
      if (filePath) {
        const ranges = extractRangesFromEdit(params);
        files.push({
          path: filePath,
          operation: "edit",
          ranges,
        });
      }
      break;
    }

    case "MultiEdit": {
      // MultiEdit has multiple edits on possibly different files
      const edits = params.edits as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(edits)) {
        for (const edit of edits) {
          const editPath = edit.file_path as string | undefined ?? edit.path as string | undefined;
          if (editPath) {
            const ranges = extractRangesFromEdit(edit);
            files.push({
              path: editPath,
              operation: "edit",
              ranges,
            });
          }
        }
      }
      break;
    }

    case "NotebookRead":
    case "NotebookEdit": {
      const filePath = params.file_path as string | undefined ?? params.path as string | undefined;
      if (filePath) {
        files.push({
          path: filePath,
          operation: baseToolName === "NotebookRead" ? "read" : "edit",
        });
      }
      break;
    }
  }

  return files;
}

/**
 * Extract line ranges from Edit tool parameters.
 */
function extractRangesFromEdit(params: Record<string, unknown>): TraceRange[] | undefined {
  const ranges: TraceRange[] = [];

  // Edit tool can have:
  // - oldStr/newStr with optional oldLine/newLine
  // - line range specified directly

  // Check for explicit line range
  const startLine = params.startLine as number | undefined;
  const endLine = params.endLine as number | undefined;

  if (startLine !== undefined && endLine !== undefined) {
    ranges.push({
      startLine,
      endLine,
    });
  }

  // Check for oldStr/newStr with line numbers
  const oldLine = params.oldLine as number | undefined;
  const newLine = params.newLine as number | undefined;

  if (oldLine !== undefined && newLine !== undefined) {
    ranges.push({
      startLine: oldLine,
      endLine: newLine,
    });
  }

  // If we have oldStr but no explicit line numbers, we can't determine range
  // This would require file content analysis which is deferred

  return ranges.length > 0 ? ranges : undefined;
}

/**
 * Normalize tool name by stripping MCP prefix.
 * mcp__server-name__tool_name -> tool_name
 */
function normalizeToolName(toolName: string): string {
  if (toolName.startsWith("mcp__")) {
    const parts = toolName.split("__");
    if (parts.length >= 3) {
      return parts[parts.length - 1];
    }
  }
  return toolName;
}

/**
 * Compute content hash for a file (for attribution).
 * Uses a simple hash of the file path and content.
 *
 * Note: This is a lightweight implementation. For production,
 * consider using crypto.createHash() with actual file content.
 */
export async function computeContentHash(
  filePath: string,
  content: string | undefined
): Promise<string> {
  if (content === undefined) {
    // Hash just the path if no content available
    return simpleHash(filePath);
  }

  // Combine path and content for a stable hash
  const data = `${filePath}:${content}`;
  return simpleHash(data);
}

/**
 * Simple string hash (FNV-1a variant).
 */
function simpleHash(str: string): string {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16);
}
