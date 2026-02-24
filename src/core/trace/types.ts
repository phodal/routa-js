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
  range?: TraceRange;
}

/**
 * A line range within a file.
 */
export interface TraceRange {
  startLine: number;
  endLine: number;
}

/**
 * The contributor (model/agent) that generated this event.
 */
export interface Contributor {
  provider?: string;
  model?: string;
}

/**
 * Tool invocation information.
 */
export interface TraceTool {
  name: string;
  input?: Record<string, unknown>;
  output?: string;
}

/**
 * Conversation content for message events.
 */
export interface TraceConversation {
  role: "user" | "assistant" | "system";
  contentPreview?: string;
  fullContent?: string;
}

/**
 * Version control information.
 */
export interface TraceVcs {
  gitSha?: string;
  branch?: string;
}

/**
 * A single trace record.
 */
export interface TraceRecord {
  version: string;
  id: string;
  timestamp: string;
  sessionId: string;
  workspaceId?: string;
  contributor: Contributor;
  eventType: TraceEventType;
  tool?: TraceTool;
  files?: TraceFile[];
  conversation?: TraceConversation;
  vcs?: TraceVcs;
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

