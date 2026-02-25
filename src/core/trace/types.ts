/**
 * Agent Trace Domain Types
 *
 * Based on https://github.com/cursor/agent-trace specification.
 * Records "which model/session/tool affected which files and when".
 */

export const TRACE_VERSION = "0.1.0";

/**
 * Event types for trace records.
 */
export type TraceEventType =
  | "user_message"
  | "agent_message"
  | "agent_thought"
  | "tool_call"
  | "tool_result"
  | "session_start"
  | "session_end";

/**
 * A file affected by an event.
 */
export interface TraceFile {
  path: string;
  /** Affected ranges within the file */
  ranges?: TraceRange[];
  /** Operation type (read, write, delete, create) */
  operation?: string;
  /** Content hash after operation (for attribution) */
  contentHash?: string;
}

/**
 * A line range within a file.
 */
export interface TraceRange {
  /** Start line (1-based) */
  startLine: number;
  /** End line (1-based, inclusive) */
  endLine: number;
  /** Start column (1-based, optional) */
  startColumn?: number;
  /** End column (1-based, optional) */
  endColumn?: number;
}

/**
 * The contributor (model/agent) that generated this event.
 */
export interface Contributor {
  /** Provider name (e.g., "claude", "opencode", "codex") */
  provider: string;
  /** Model identifier (e.g., "claude-sonnet-4-20250514") */
  model?: string;
  /** Normalized model ID in format "provider/model" */
  normalizedId?: string;
}

/**
 * Tool invocation information.
 */
export interface TraceTool {
  /** Tool name (e.g., "read_file", "write_file", "delegate_task_to_agent") */
  name: string;
  /** Tool call ID (from the agent) */
  toolCallId?: string;
  /** Tool status ("running", "completed", "failed") */
  status?: string;
  /** Raw input parameters */
  input?: unknown;
  /** Raw output (for tool results) */
  output?: unknown;
}

/**
 * Conversation content for message events.
 */
export interface TraceConversation {
  /** Turn number in the conversation */
  turn?: number;
  /** Message role (user, assistant, tool) */
  role?: string;
  /** Message content (truncated for storage) */
  contentPreview?: string;
  /** Full content (optional) */
  fullContent?: string;
}

/**
 * Version control information.
 */
export interface TraceVcs {
  /** Current Git revision (commit SHA) */
  revision?: string;
  /** Current Git branch */
  branch?: string;
  /** Repository root path */
  repoRoot?: string;
  /** Legacy field for SHA (kept for compatibility) */
  gitSha?: string;
}

/**
 * A single trace record.
 */
export interface TraceRecord {
  /** Schema version (e.g., "0.1.0") */
  version: string;
  /** Unique identifier for this trace */
  id: string;
  /** ISO 8601 timestamp when the trace was recorded */
  timestamp: string;
  /** Session ID this trace belongs to */
  sessionId: string;
  /** Workspace ID */
  workspaceId?: string;
  /** The contributor (model/provider) that produced this trace */
  contributor: Contributor;
  /** Type of trace event */
  eventType: TraceEventType;
  /** Tool information (if this is a tool call) */
  tool?: TraceTool;
  /** Files affected by this trace */
  files?: TraceFile[];
  /** Conversation context */
  conversation?: TraceConversation;
  /** VCS (Git) context */
  vcs?: TraceVcs;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create a new TraceRecord with defaults.
 */
export function createTraceRecord(
  sessionId: string,
  eventType: TraceEventType,
  contributor: Contributor
): TraceRecord {
  return {
    version: TRACE_VERSION,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionId,
    contributor,
    eventType,
  };
}

/**
 * Builder-style functions for TraceRecord.
 */
export function withWorkspaceId(record: TraceRecord, workspaceId: string): TraceRecord {
  return { ...record, workspaceId };
}

export function withTool(record: TraceRecord, tool: TraceTool): TraceRecord {
  return { ...record, tool };
}

export function withFile(record: TraceRecord, file: TraceFile): TraceRecord {
  const files = record.files ?? [];
  return { ...record, files: [...files, file] };
}

export function withConversation(record: TraceRecord, conversation: TraceConversation): TraceRecord {
  return { ...record, conversation };
}

export function withVcs(record: TraceRecord, vcs: TraceVcs): TraceRecord {
  return { ...record, vcs };
}

export function withMetadata(record: TraceRecord, key: string, value: unknown): TraceRecord {
  const metadata = record.metadata ?? {};
  return { ...record, metadata: { ...metadata, [key]: value } };
}

