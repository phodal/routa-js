/**
 * WorkspaceAgentEvent - Semantic event layer for Workspace Agent coordination.
 *
 * Sits between NormalizedSessionUpdate (wire normalization) and consumers
 * (Workspace Agents, UI). Converts low-level tool_call events into typed
 * semantic blocks that describe *what the agent is doing*, not just *that
 * a tool was called*.
 *
 * Inspired by JetBrains A2UX protocol (AcpToA2UXConverter pattern).
 */

// ─── Tool Block Status ────────────────────────────────────────────────────────

export type BlockStatus = "in_progress" | "completed" | "failed" | "canceled";

// ─── File Change ──────────────────────────────────────────────────────────────

export interface FileChange {
  /** Relative or absolute path of the file being changed */
  path: string;
  /** Type of change */
  changeType: "create" | "edit" | "delete" | "move";
  /** Content after change (for create/edit) */
  afterContent?: string;
  /** Original path (for move) */
  fromPath?: string;
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export type PlanItemStatus = "pending" | "in_progress" | "done" | "failed" | "canceled";

export interface PlanItem {
  description: string;
  status: PlanItemStatus;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface AgentUsage {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheInputTokens?: number;
  cost?: number;
}

// ─── WorkspaceAgentEvent ──────────────────────────────────────────────────────

/**
 * Lifecycle: agent session started.
 */
export interface AgentStartedEvent {
  type: "agent_started";
  sessionId: string;
  provider: string;
  timestamp: Date;
}

/**
 * Lifecycle: agent turn completed successfully.
 */
export interface AgentCompletedEvent {
  type: "agent_completed";
  sessionId: string;
  stopReason: string;
  usage?: AgentUsage;
  timestamp: Date;
}

/**
 * Lifecycle: agent encountered an error.
 */
export interface AgentFailedEvent {
  type: "agent_failed";
  sessionId: string;
  message: string;
  timestamp: Date;
}

/**
 * Progress: agent updated its execution plan.
 */
export interface PlanUpdatedEvent {
  type: "plan_updated";
  sessionId: string;
  items: PlanItem[];
  timestamp: Date;
}

/**
 * Block: generic tool call (catch-all for unclassified tools).
 * Stateful — same toolCallId may be emitted multiple times as status changes.
 */
export interface ToolCallBlockEvent {
  type: "tool_call_block";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  title?: string;
  status: BlockStatus;
  input?: Record<string, unknown>;
  output?: unknown;
  timestamp: Date;
}

/**
 * Block: file read / search / glob operations.
 */
export interface ReadBlockEvent {
  type: "read_block";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  status: BlockStatus;
  /** Files accessed */
  files: string[];
  timestamp: Date;
}

/**
 * Block: file write / edit / delete operations.
 */
export interface FileChangesBlockEvent {
  type: "file_changes_block";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  status: BlockStatus;
  changes: FileChange[];
  timestamp: Date;
}

/**
 * Block: terminal / bash / shell execution.
 */
export interface TerminalBlockEvent {
  type: "terminal_block";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  status: BlockStatus;
  command?: string;
  output?: string;
  exitCode?: number;
  timestamp: Date;
}

/**
 * Block: MCP tool call (tool name starts with "mcp__").
 */
export interface McpBlockEvent {
  type: "mcp_block";
  sessionId: string;
  toolCallId: string;
  toolName: string;
  status: BlockStatus;
  input?: Record<string, unknown>;
  output?: unknown;
  timestamp: Date;
}

/**
 * Block: agent text message (may be a streaming chunk).
 */
export interface MessageBlockEvent {
  type: "message_block";
  sessionId: string;
  role: "assistant" | "user";
  content: string;
  isChunk: boolean;
  timestamp: Date;
}

/**
 * Block: agent internal reasoning / thought.
 */
export interface ThoughtBlockEvent {
  type: "thought_block";
  sessionId: string;
  content: string;
  isChunk: boolean;
  timestamp: Date;
}

/**
 * Accounting: token usage reported at end of turn.
 */
export interface UsageReportedEvent {
  type: "usage_reported";
  sessionId: string;
  usage: AgentUsage;
  timestamp: Date;
}

/**
 * Union of all WorkspaceAgentEvent types.
 */
export type WorkspaceAgentEvent =
  | AgentStartedEvent
  | AgentCompletedEvent
  | AgentFailedEvent
  | PlanUpdatedEvent
  | ToolCallBlockEvent
  | ReadBlockEvent
  | FileChangesBlockEvent
  | TerminalBlockEvent
  | McpBlockEvent
  | MessageBlockEvent
  | ThoughtBlockEvent
  | UsageReportedEvent;

// ─── Tool Kind Classification ─────────────────────────────────────────────────

/**
 * Semantic category of a tool call, used to select the right block event type.
 */
export type ToolKind = "read" | "edit" | "execute" | "mcp" | "other";

/**
 * Classify a tool name into a semantic ToolKind.
 *
 * Patterns are based on common Claude Code / ACP tool naming conventions.
 */
export function classifyToolKind(toolName: string): ToolKind {
  const name = toolName.toLowerCase();

  // MCP tools always start with "mcp__"
  if (name.startsWith("mcp__")) return "mcp";

  // Read / search tools
  if (
    name === "read" ||
    name === "glob" ||
    name === "grep" ||
    name === "search" ||
    name === "find" ||
    name === "list" ||
    name === "ls" ||
    name.startsWith("read_") ||
    name.startsWith("search_") ||
    name.startsWith("list_") ||
    name.startsWith("view_") ||
    name.includes("_read") ||
    name.includes("_search") ||
    name.includes("_glob") ||
    name.includes("_grep")
  ) {
    return "read";
  }

  // Edit / write / delete tools
  if (
    name === "write" ||
    name === "edit" ||
    name === "multiedit" ||
    name === "create" ||
    name === "delete" ||
    name === "move" ||
    name === "rename" ||
    name === "patch" ||
    name.startsWith("write_") ||
    name.startsWith("edit_") ||
    name.startsWith("create_") ||
    name.startsWith("delete_") ||
    name.includes("str_replace") ||
    name.includes("_write") ||
    name.includes("_edit") ||
    name.includes("_create") ||
    name.includes("_delete") ||
    name.includes("_patch")
  ) {
    return "edit";
  }

  // Execute / terminal tools
  if (
    name === "bash" ||
    name === "run" ||
    name === "execute" ||
    name === "terminal" ||
    name === "shell" ||
    name === "cmd" ||
    name.startsWith("run_") ||
    name.startsWith("exec_") ||
    name.startsWith("bash_") ||
    name.includes("_run") ||
    name.includes("_exec") ||
    name.includes("_bash") ||
    name.includes("_terminal") ||
    name.includes("_shell")
  ) {
    return "execute";
  }

  return "other";
}

/**
 * Extract file paths from tool input based on tool kind.
 */
export function extractFilePaths(toolName: string, input?: Record<string, unknown>): string[] {
  if (!input) return [];

  const paths: string[] = [];

  // Common path field names
  const pathFields = ["path", "file_path", "filePath", "file", "filename", "pattern", "glob"];
  for (const field of pathFields) {
    const val = input[field];
    if (typeof val === "string" && val.length > 0) {
      paths.push(val);
    }
  }

  // Array of paths
  const arrayFields = ["paths", "files", "file_paths"];
  for (const field of arrayFields) {
    const val = input[field];
    if (Array.isArray(val)) {
      for (const p of val) {
        if (typeof p === "string") paths.push(p);
      }
    }
  }

  return [...new Set(paths)]; // deduplicate
}

/**
 * Extract file changes from tool input for edit-kind tools.
 */
export function extractFileChanges(toolName: string, input?: Record<string, unknown>): FileChange[] {
  if (!input) return [];

  const name = toolName.toLowerCase();
  const path = (input.path ?? input.file_path ?? input.filePath ?? "") as string;

  if (!path) return [];

  if (name === "delete" || name.includes("_delete") || name.startsWith("delete_")) {
    return [{ path, changeType: "delete" }];
  }

  if (name === "move" || name === "rename") {
    const toPath = (input.to ?? input.new_path ?? input.destination ?? "") as string;
    return [{ path, changeType: "move", fromPath: path, ...(toPath ? { path: toPath } : {}) }];
  }

  // write / edit / create / patch
  const afterContent = (input.content ?? input.new_content ?? input.new_str ?? "") as string;
  const changeType = name === "write" || name === "create" || name.startsWith("create_") || name.startsWith("write_") ? "create" : "edit";
  return [{ path, changeType, ...(afterContent ? { afterContent } : {}) }];
}
