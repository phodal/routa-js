"use client";

/**
 * TracePanel - Displays Agent Trace records for debugging
 *
 * Shows:
 * - Session lifecycle events (start/end)
 * - User messages
 * - Agent responses (messages, thoughts)
 * - Tool calls and results (with input params as table)
 * - File modifications
 *
 * Based on the Agent Trace specification: https://github.com/cursor/agent-trace
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { desktopAwareFetch } from "../utils/diagnostics";
import type { TraceRecord } from "@/core/trace";
import { CodeBlock } from "./code-block";
import { CodeRetrievalViewer } from "./code-retrieval-viewer";
import { FileOutputViewer, parseFileOutput } from "./file-output-viewer";
import { MarkdownViewer } from "./markdown/markdown-viewer";

interface TracePanelProps {
  sessionId: string | null;
}

/** Collapsible JSON tree view for tool outputs */
function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 1);

  if (value === null) return <span className="text-gray-400 dark:text-gray-500">null</span>;
  if (typeof value === "boolean")
    return <span className="text-yellow-600 dark:text-yellow-400">{String(value)}</span>;
  if (typeof value === "number")
    return <span className="text-blue-600 dark:text-blue-400">{value}</span>;
  if (typeof value === "string")
    return (
      <span className="text-green-700 dark:text-green-400">
        &quot;{value}&quot;
      </span>
    );

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-gray-500">[]</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-mono"
        >
          {collapsed ? `[…${value.length}]` : "["}
        </button>
        {!collapsed && (
          <>
            <div className="pl-3 border-l border-gray-200 dark:border-gray-700 ml-1">
              {value.map((item, i) => (
                <div key={i} className="my-0.5">
                  <span className="text-gray-400 dark:text-gray-500 select-none">{i}: </span>
                  <JsonNode value={item} depth={depth + 1} />
                  {i < value.length - 1 && <span className="text-gray-400">,</span>}
                </div>
              ))}
            </div>
            <span className="text-gray-500">]</span>
          </>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-gray-500">{"{}"}</span>;
    return (
      <span>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-mono"
        >
          {collapsed ? `{…${entries.length}}` : "{"}
        </button>
        {!collapsed && (
          <>
            <div className="pl-3 border-l border-gray-200 dark:border-gray-700 ml-1">
              {entries.map(([k, v], i) => (
                <div key={k} className="my-0.5">
                  <span className="text-purple-700 dark:text-purple-400 font-semibold">&quot;{k}&quot;</span>
                  <span className="text-gray-500">: </span>
                  <JsonNode value={v} depth={depth + 1} />
                  {i < entries.length - 1 && <span className="text-gray-400">,</span>}
                </div>
              ))}
            </div>
            <span className="text-gray-500">{"}"}</span>
          </>
        )}
      </span>
    );
  }

  return <span className="text-gray-700 dark:text-gray-300">{String(value)}</span>;
}

/** Try to parse a string as JSON; return parsed value or null */
function tryParseJson(s: string): unknown | null {
  const trimmed = s.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Render tool output: JSON tree if parseable, otherwise code block */
function ToolOutput({ output, toolName }: { output: string; toolName?: string }) {
  const parsed = useMemo(() => tryParseJson(output), [output]);
  const [mode, setMode] = useState<"tree" | "raw" | "code">("code");
  const isLarge = output.length > 500;

  // Check if this is a codebase-retrieval output
  // Format 1: JSON array with [{type: "text", text: "..."}]
  // Format 2: JSON object with {output: "The following code sections..."}
  // Format 3: Plain text starting with "The following code sections"
  const isCodebaseRetrievalFormat = (() => {
    // Format 1: Array format
    if (parsed && Array.isArray(parsed) && parsed.length > 0 &&
        parsed[0]?.type === "text" && typeof parsed[0]?.text === "string" &&
        parsed[0].text.includes("Path:") && parsed[0].text.includes("code sections")) {
      return true;
    }

    // Format 2: Object with output field containing code sections
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const outputField = (parsed as Record<string, unknown>).output;
      if (typeof outputField === "string" &&
          outputField.includes("Path:") &&
          outputField.includes("code sections")) {
        return true;
      }
    }

    // Format 3: Plain text or toolName hint
    if (toolName === "codebase-retrieval" && output.includes("Path:")) {
      return true;
    }

    return false;
  })();

  // Extract the actual content for codebase-retrieval
  const codeRetrievalContent = useMemo(() => {
    if (!isCodebaseRetrievalFormat) return output;

    // Format 2: Object with output field
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const outputField = (parsed as Record<string, unknown>).output;
      if (typeof outputField === "string") {
        return outputField;
      }
    }

    return output;
  }, [output, parsed, isCodebaseRetrievalFormat]);

  // If it's codebase-retrieval with code sections, always use CodeRetrievalViewer
  if (isCodebaseRetrievalFormat) {
    return (
      <div>
        <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Output (Code Sections)
          </span>
        </div>
        <div className="p-2">
          <CodeRetrievalViewer output={codeRetrievalContent} initiallyExpanded={true} />
        </div>
      </div>
    );
  }

  // Extract inner output from JSON wrapper (common pattern: {output: "..."})
  const innerOutput = parsed && typeof parsed === "object" && "output" in parsed
    ? (parsed as { output: string }).output
    : null;

  // Check if content is rich text/markdown (has many newlines, markdown-like patterns)
  // This is useful for web-fetch results that return HTML converted to markdown
  const isRichTextContent = useMemo(() => {
    const contentToCheck = typeof innerOutput === "string" ? innerOutput : output;
    if (!contentToCheck || contentToCheck.length < 200) return false;

    // Count newlines - rich content typically has many
    const newlineCount = (contentToCheck.match(/\n/g) || []).length;
    if (newlineCount < 10) return false;

    // Check for markdown-like patterns
    const hasMarkdownHeaders = /^#{1,6}\s+/m.test(contentToCheck);
    const hasMarkdownLinks = /\[.+?\]\(.+?\)/.test(contentToCheck);
    const hasMarkdownLists = /^[\s]*[-*+]\s+/m.test(contentToCheck);
    const hasMarkdownBold = /\*\*[^*]+\*\*/.test(contentToCheck);
    const hasHtmlTags = /<[a-z][^>]*>/i.test(contentToCheck);

    // If it has multiple markdown indicators, treat as rich text
    const markdownScore = [hasMarkdownHeaders, hasMarkdownLinks, hasMarkdownLists, hasMarkdownBold, hasHtmlTags]
      .filter(Boolean).length;

    // Also check for web-fetch tool specifically
    if (toolName === "web-fetch" || toolName === "fetch") {
      return newlineCount >= 5;
    }

    return markdownScore >= 2 || (newlineCount > 30 && markdownScore >= 1);
  }, [output, innerOutput, toolName]);

  // Render rich text content with MarkdownViewer
  const [richTextExpanded, setRichTextExpanded] = useState(false);
  const richTextContent = typeof innerOutput === "string" ? innerOutput : output;

  if (isRichTextContent && !isCodebaseRetrievalFormat) {
    return (
      <div>
        <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <button
            onClick={() => setRichTextExpanded(!richTextExpanded)}
            className="flex items-center gap-1.5 text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg
              className={`w-3 h-3 transition-transform ${richTextExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Output (Rendered)
          </button>
          <span className="text-[9px] text-gray-400 dark:text-gray-500">
            {richTextContent.length} chars
          </span>
        </div>
        {richTextExpanded ? (
          <div className="p-3 max-h-[500px] overflow-y-auto bg-white dark:bg-gray-900/40">
            <MarkdownViewer
              content={richTextContent}
              className="text-xs prose prose-sm dark:prose-invert max-w-none"
            />
          </div>
        ) : (
          <div
            onClick={() => setRichTextExpanded(true)}
            className="px-3 py-2 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 line-clamp-3"
          >
            {richTextContent.slice(0, 200).replace(/\n/g, " ")}
            {richTextContent.length > 200 && "…"}
          </div>
        )}
      </div>
    );
  }

  // Check if this is a search/read tool output with special format
  // These tools output JSON with an "output" field containing the actual content
  const isSearchOrRead = toolName === "search" || toolName === "read";

  if (isSearchOrRead && innerOutput) {
    const fileOutputParsed = parseFileOutput(innerOutput, toolName);
    if (fileOutputParsed.kind !== "unknown") {
      const label = toolName === "search"
        ? `Search Results (${fileOutputParsed.matchCount ?? fileOutputParsed.searchMatches?.length ?? 0} matches)`
        : "File Content";
      return (
        <div>
          <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
            <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              {label}
            </span>
          </div>
          <div className="p-2">
            <FileOutputViewer output={innerOutput} toolName={toolName} initiallyExpanded={true} />
          </div>
        </div>
      );
    }
  }

  if (!parsed) {
    // Non-JSON output - use CodeBlock for syntax highlighting
    return (
      <div>
        <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
          <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Output
          </span>
          {isLarge && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500">
              {output.length} chars
            </span>
          )}
        </div>
        <CodeBlock
          content={output}
          language="auto"
          variant="simple"
          className="!border-0 !rounded-none"
          wordWrap={true}
        />
      </div>
    );
  }

  // JSON output - offer tree/raw/code views
  return (
    <div>
      <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 flex items-center justify-between">
        <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Output (JSON)
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("code")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "code"
                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Code
          </button>
          <button
            onClick={() => setMode("tree")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "tree"
                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Tree
          </button>
          <button
            onClick={() => setMode("raw")}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              mode === "raw"
                ? "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            }`}
          >
            Raw
          </button>
        </div>
      </div>
      {mode === "tree" ? (
        <div className="px-2 py-1.5 text-[10px] font-mono bg-white dark:bg-gray-900/40 overflow-auto">
          <JsonNode value={parsed} depth={0} />
        </div>
      ) : mode === "code" ? (
        <CodeBlock
          content={JSON.stringify(parsed, null, 2)}
          language="json"
          variant={isLarge ? "rich" : "simple"}
          className="!border-0 !rounded-none"
          wordWrap={true}
          showHeader={false}
        />
      ) : (
        <pre className="px-2 py-1.5 text-[10px] font-mono text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words bg-white dark:bg-gray-900/40">
          {output}
        </pre>
      )}
    </div>
  );
}

/** Render tool input parameters as a visible key-value table */
function ToolInputTable({ input }: { input: unknown }) {
  if (input == null) return null;

  if (typeof input === "object" && !Array.isArray(input)) {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return null;
    return (
      <table className="w-full text-[10px] border-collapse">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-gray-100 dark:border-gray-700/50 last:border-0">
              <td className="py-1 pr-3 font-mono font-semibold text-gray-500 dark:text-gray-400 align-top whitespace-nowrap w-px">
                {key}
              </td>
              <td className="py-1 font-mono text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-all">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <pre className="text-[10px] text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

/** A merged tool call + result record */
interface MergedToolRecord {
  type: "merged_tool";
  toolCall: TraceRecord;
  toolResult?: TraceRecord;
  toolCallId: string;
}

/** A regular trace record or a merged tool record */
type DisplayRecord = TraceRecord | MergedToolRecord;

function isMergedTool(record: DisplayRecord): record is MergedToolRecord {
  return (record as MergedToolRecord).type === "merged_tool";
}

/**
 * A conversation turn - either a user message or an agent response block
 * Agent response blocks group together: thoughts, messages, and tools
 */
interface ConversationTurn {
  type: "user" | "agent";
  startTime: string;
  endTime: string;
  items: DisplayRecord[];
}

/**
 * Group traces into conversation turns for a continuous flow layout.
 * User messages start a new turn. Agent content (thoughts, messages, tools)
 * are grouped together until the next user message.
 */
function groupIntoConversationTurns(records: DisplayRecord[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentAgentTurn: ConversationTurn | null = null;

  for (const record of records) {
    const trace = isMergedTool(record) ? record.toolCall : record;
    const eventType = isMergedTool(record) ? "tool_call" : trace.eventType;

    if (eventType === "user_message") {
      // Flush current agent turn if any
      if (currentAgentTurn && currentAgentTurn.items.length > 0) {
        turns.push(currentAgentTurn);
        currentAgentTurn = null;
      }
      // User message is its own turn
      turns.push({
        type: "user",
        startTime: trace.timestamp,
        endTime: trace.timestamp,
        items: [record],
      });
    } else if (
      eventType === "agent_message" ||
      eventType === "agent_thought" ||
      eventType === "tool_call" ||
      isMergedTool(record)
    ) {
      // Agent content - add to current agent turn or create new one
      if (!currentAgentTurn) {
        currentAgentTurn = {
          type: "agent",
          startTime: trace.timestamp,
          endTime: trace.timestamp,
          items: [],
        };
      }
      currentAgentTurn.items.push(record);
      currentAgentTurn.endTime = trace.timestamp;
    } else if (eventType === "session_start" || eventType === "session_end") {
      // Session events - flush agent turn and add as separate item
      if (currentAgentTurn && currentAgentTurn.items.length > 0) {
        turns.push(currentAgentTurn);
        currentAgentTurn = null;
      }
      turns.push({
        type: "agent", // Use agent type for session events
        startTime: trace.timestamp,
        endTime: trace.timestamp,
        items: [record],
      });
    }
    // Skip tool_result as they are merged with tool_call
  }

  // Flush remaining agent turn
  if (currentAgentTurn && currentAgentTurn.items.length > 0) {
    turns.push(currentAgentTurn);
  }

  return turns;
}

/**
 * Merge tool_call and tool_result traces by toolCallId.
 * Returns a mixed array of regular traces and merged tool records.
 */
function mergeToolTraces(traces: TraceRecord[]): DisplayRecord[] {
  const result: DisplayRecord[] = [];
  const processedResultIds = new Set<string>();

  // First pass: find all tool_calls and mark their matching results
  for (const trace of traces) {
    if (trace.eventType === "tool_result" && trace.tool?.toolCallId) {
      const hasMatchingCall = traces.some(
        (t) => t.eventType === "tool_call" && t.tool?.toolCallId === trace.tool?.toolCallId
      );
      if (hasMatchingCall) {
        processedResultIds.add(trace.id);
      }
    }
  }

  // Build the result array
  for (const trace of traces) {
    if (trace.eventType === "tool_call" && trace.tool?.toolCallId) {
      // Find matching result
      const matchingResult = traces.find(
        (t) =>
          t.eventType === "tool_result" &&
          t.tool?.toolCallId === trace.tool?.toolCallId
      );
      result.push({
        type: "merged_tool",
        toolCall: trace,
        toolResult: matchingResult,
        toolCallId: trace.tool.toolCallId,
      });
    } else if (trace.eventType === "tool_result" && trace.tool?.toolCallId) {
      // Skip if already merged with a tool_call
      if (processedResultIds.has(trace.id)) {
        continue;
      }
      // Orphan result (no matching call) - still show it
      result.push(trace);
    } else {
      // All other event types
      result.push(trace);
    }
  }

  return result;
}

/**
 * Infer actual tool name from input parameters when name is "other" or "unknown".
 * This handles cases where the ACP provider doesn't send the correct tool name.
 */
function inferToolName(name: string, input: unknown): string {
  if (name !== "other" && name !== "unknown") {
    return name;
  }

  if (!input || typeof input !== "object") {
    return name;
  }

  const inputObj = input as Record<string, unknown>;

  // codebase-retrieval: has "information_request" parameter
  if ("information_request" in inputObj) {
    return "codebase-retrieval";
  }

  // file read operations
  if ("file_path" in inputObj && !("content" in inputObj)) {
    return "read-file";
  }

  // file write operations
  if ("file_path" in inputObj && "content" in inputObj) {
    return "write-file";
  }

  // shell/bash commands
  if ("command" in inputObj) {
    return "shell";
  }

  // web search
  if ("query" in inputObj && "num_results" in inputObj) {
    return "web-search";
  }

  // web fetch
  if ("url" in inputObj && !("query" in inputObj)) {
    return "web-fetch";
  }

  return name;
}

/** Merged Tool View - shows tool call input and result output together */
function MergedToolView({
  merged,
  formatTime,
}: {
  merged: MergedToolRecord;
  formatTime: (timestamp: string) => string;
}) {
  const [expanded, setExpanded] = useState(true); // Default expanded
  const { toolCall, toolResult } = merged;
  const rawToolName = toolCall.tool?.name ?? "unknown";
  const toolName = inferToolName(rawToolName, toolCall.tool?.input);
  const status = toolResult?.tool?.status ?? toolCall.tool?.status ?? "running";

  // Parse output for display
  const rawOutput = toolResult?.tool?.output;
  const outputStr =
    rawOutput == null
      ? ""
      : typeof rawOutput === "string"
        ? rawOutput
        : JSON.stringify(rawOutput, null, 2);

  const hasOutput = !!outputStr;

  return (
    <div className="px-4 py-2.5 flex gap-3 border-l-2 border-orange-300 dark:border-orange-700">
      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0 w-16 text-right pt-0.5">
        {formatTime(toolCall.timestamp)}
      </span>
      <div className="flex-1 min-w-0">
        {/* Tool header row with expand toggle */}
        <div className="flex items-center gap-2 mb-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
          >
            <svg
              className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 uppercase tracking-wide">
              Tool
            </span>
          </button>
          <code className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 rounded border border-orange-100 dark:border-orange-800/40">
            {toolName}
          </code>
          <span
            className={`text-[10px] font-medium ${
              status === "completed"
                ? "text-green-600 dark:text-green-400"
                : status === "failed"
                  ? "text-red-600 dark:text-red-400"
                  : "text-yellow-600 dark:text-yellow-400"
            }`}
          >
            {status}
          </span>
          {toolResult && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500">
              → {formatTime(toolResult.timestamp)}
            </span>
          )}
        </div>

        {/* Collapsed preview or expanded details */}
        {!expanded ? (
          // Collapsed: show brief input summary
          <div
            onClick={() => setExpanded(true)}
            className="cursor-pointer text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate hover:text-gray-700 dark:hover:text-gray-300"
          >
            {toolCall.tool?.input
              ? typeof toolCall.tool.input === "string"
                ? toolCall.tool.input.slice(0, 100)
                : JSON.stringify(toolCall.tool.input).slice(0, 100)
              : "(no input)"}
            {(toolCall.tool?.input?.toString().length ?? 0) > 100 && "…"}
          </div>
        ) : (
          // Expanded: show full input and output
          <div className="space-y-2">
            {/* Input parameters */}
            {toolCall.tool && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700/60 overflow-hidden">
                <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60">
                  <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Input Parameters
                  </span>
                </div>
                <div className="px-2 py-1.5 bg-white dark:bg-gray-900/40">
                  <ToolInputTable input={toolCall.tool} />
                </div>
              </div>
            )}

            {/* Files affected */}
            {toolCall.files && toolCall.files.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {toolCall.files.map((f, i) => (
                  <span
                    key={i}
                    className="text-[9px] font-mono px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded border border-gray-200 dark:border-gray-700"
                  >
                    {f.operation && (
                      <span className="text-blue-500 dark:text-blue-400 mr-1">
                        {f.operation}
                      </span>
                    )}
                    {f.path}
                  </span>
                ))}
              </div>
            )}

            {/* Output */}
            {hasOutput && (
              <div className="rounded-md border border-cyan-200 dark:border-cyan-800/40 overflow-hidden">
                <ToolOutput output={outputStr} toolName={toolName} />
              </div>
            )}

            {/* No output yet */}
            {!toolResult && (
              <div className="text-[10px] text-yellow-600 dark:text-yellow-400 italic">
                ⏳ Waiting for result...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Inline tool display for conversation flow - compact, non-intrusive */
function InlineToolView({
  merged,
  formatTime,
}: {
  merged: MergedToolRecord;
  formatTime: (timestamp: string) => string;
}) {
  const [expanded, setExpanded] = useState(true); // Default expanded
  const { toolCall, toolResult } = merged;
  const rawToolName = toolCall.tool?.name ?? "unknown";
  const toolName = inferToolName(rawToolName, toolCall.tool?.input);
  const status = toolResult?.tool?.status ?? toolCall.tool?.status ?? "running";

  const rawOutput = toolResult?.tool?.output;
  const outputStr =
    rawOutput == null
      ? ""
      : typeof rawOutput === "string"
        ? rawOutput
        : JSON.stringify(rawOutput, null, 2);

  const statusIcon = status === "completed" ? "✓" : status === "failed" ? "✗" : "⏳";
  const statusColor =
    status === "completed"
      ? "text-green-600 dark:text-green-400"
      : status === "failed"
        ? "text-red-600 dark:text-red-400"
        : "text-yellow-600 dark:text-yellow-400 animate-pulse";

  // Generate a brief summary of the tool input
  const inputSummary = useMemo(() => {
    const input = toolCall.tool?.input;
    if (!input) return "";
    if (typeof input === "string") return input.slice(0, 50);
    const obj = input as Record<string, unknown>;
    // Show key field based on tool type
    if (obj.url) return String(obj.url).slice(0, 50);
    if (obj.path) return String(obj.path);
    if (obj.file_path) return String(obj.file_path);
    if (obj.command) return String(obj.command).slice(0, 50);
    if (obj.information_request) return String(obj.information_request).slice(0, 40);
    if (obj.query) return String(obj.query).slice(0, 40);
    return "";
  }, [toolCall.tool?.input]);

  return (
    <div className="my-2">
      {/* Compact tool header - inline with flow */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors w-full text-left"
      >
        <svg
          className={`w-3 h-3 text-orange-400 transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-[10px] text-orange-500 dark:text-orange-400">🔧</span>
        <code className="text-[11px] font-mono font-medium text-orange-700 dark:text-orange-300">
          {toolName}
        </code>
        {inputSummary && (
          <>
            <span className="text-gray-300 dark:text-gray-600">→</span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate flex-1 font-mono">
              {inputSummary}
            </span>
          </>
        )}
        <span className={`text-xs shrink-0 ${statusColor}`}>{statusIcon}</span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {formatTime(toolCall.timestamp)}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mt-2 ml-4 pl-3 border-l-2 border-orange-200 dark:border-orange-800/40 space-y-2">
          {/* Input */}
          {toolCall.tool?.input != null && (
            <div className="rounded-md border border-gray-200 dark:border-gray-700/60 overflow-hidden">
              <div className="px-2 py-1 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60">
                <span className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Input
                </span>
              </div>
              <div className="px-2 py-1.5 bg-white dark:bg-gray-900/40">
                <ToolInputTable input={toolCall.tool.input} />
              </div>
            </div>
          )}
          {/* Output */}
          {outputStr && (
            <div className="rounded-md border border-cyan-200 dark:border-cyan-800/40 overflow-hidden">
              <ToolOutput output={outputStr} toolName={toolName} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsible thought bubble for conversation flow */
function InlineThoughtView({ trace }: { trace: TraceRecord }) {
  const [expanded, setExpanded] = useState(false);
  const content = trace.conversation?.fullContent || trace.conversation?.contentPreview || "";

  if (!content) return null;

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="group flex items-start gap-2 my-1 px-3 py-1.5 rounded-lg bg-yellow-50/40 dark:bg-yellow-900/5 border border-yellow-100/50 dark:border-yellow-800/20 hover:bg-yellow-50/70 dark:hover:bg-yellow-900/10 transition-colors w-full text-left"
    >
      <span className="text-[10px] text-yellow-500 shrink-0 pt-0.5">💭</span>
      <p className={`text-[11px] text-gray-500 dark:text-gray-400 italic leading-relaxed ${expanded ? "" : "line-clamp-2"}`}>
        {content}
      </p>
      {!expanded && content.length > 150 && (
        <span className="text-[9px] text-yellow-500 dark:text-yellow-400 shrink-0 pt-0.5">...</span>
      )}
    </button>
  );
}

/** User message bubble for conversation flow */
function UserMessageBubble({
  trace,
  formatTime,
}: {
  trace: TraceRecord;
  formatTime: (timestamp: string) => string;
}) {
  const content = trace.conversation?.fullContent || trace.conversation?.contentPreview || "";

  return (
    <div className="flex items-start gap-3 group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
        <span className="text-sm">👤</span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">User</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTime(trace.timestamp)}
          </span>
        </div>
        <div className="px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
          <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words leading-relaxed">
            {content || <span className="italic text-gray-400">(empty)</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Agent response block - groups thoughts, messages, and tools into a continuous flow */
function AgentResponseBlock({
  turn,
  formatTime,
}: {
  turn: ConversationTurn;
  formatTime: (timestamp: string) => string;
}) {
  const [thoughtsExpanded, setThoughtsExpanded] = useState(false);

  // Separate thoughts from other content
  const thoughts: TraceRecord[] = [];
  const messages: TraceRecord[] = [];
  const tools: MergedToolRecord[] = [];
  const sessionEvents: TraceRecord[] = [];

  for (const item of turn.items) {
    if (isMergedTool(item)) {
      tools.push(item);
    } else if (item.eventType === "agent_thought") {
      thoughts.push(item);
    } else if (item.eventType === "agent_message") {
      messages.push(item);
    } else if (item.eventType === "session_start" || item.eventType === "session_end") {
      sessionEvents.push(item);
    }
  }

  // Session events render differently
  if (sessionEvents.length > 0 && messages.length === 0 && tools.length === 0) {
    return (
      <div className="flex items-center gap-2 py-2">
        {sessionEvents.map((evt) => (
          <span
            key={evt.id}
            className={`text-[10px] font-semibold uppercase tracking-wide ${
              evt.eventType === "session_start"
                ? "text-green-600 dark:text-green-400"
                : "text-red-500 dark:text-red-400"
            }`}
          >
            {evt.eventType === "session_start" ? "▶ Session Started" : "■ Session Ended"}
            <span className="ml-2 font-normal text-gray-400">{formatTime(evt.timestamp)}</span>
          </span>
        ))}
      </div>
    );
  }

  // Get model info from first agent message
  const model = messages[0]?.contributor?.model || thoughts[0]?.contributor?.model;

  // Build interleaved content for proper flow
  // Sort all items by timestamp and render in order
  const sortedItems = [...turn.items].sort(
    (a, b) =>
      new Date(isMergedTool(a) ? a.toolCall.timestamp : a.timestamp).getTime() -
      new Date(isMergedTool(b) ? b.toolCall.timestamp : b.timestamp).getTime()
  );

  // Merge consecutive agent_message content
  const mergedContent: Array<{
    type: "thought" | "message" | "tool";
    content?: string;
    trace?: TraceRecord;
    merged?: MergedToolRecord;
  }> = [];

  for (const item of sortedItems) {
    if (isMergedTool(item)) {
      mergedContent.push({ type: "tool", merged: item });
    } else if (item.eventType === "agent_thought") {
      mergedContent.push({ type: "thought", trace: item });
    } else if (item.eventType === "agent_message") {
      const content = item.conversation?.fullContent || item.conversation?.contentPreview || "";
      // Try to merge with previous message
      const last = mergedContent[mergedContent.length - 1];
      if (last && last.type === "message" && last.content !== undefined) {
        last.content += content;
      } else {
        mergedContent.push({ type: "message", content });
      }
    }
  }

  return (
    <div className="flex items-start gap-3 group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
        <span className="text-sm">🤖</span>
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Agent</span>
          {model && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">{model}</span>
          )}
          <span className="text-[10px] text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {formatTime(turn.startTime)}
            {turn.startTime !== turn.endTime && ` → ${formatTime(turn.endTime)}`}
          </span>
        </div>

        {/* Thoughts toggle (if any) */}
        {thoughts.length > 0 && (
          <button
            onClick={() => setThoughtsExpanded(!thoughtsExpanded)}
            className="flex items-center gap-1.5 mb-2 text-[10px] text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
          >
            <svg
              className={`w-3 h-3 transition-transform ${thoughtsExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            💭 {thoughts.length} thought{thoughts.length > 1 ? "s" : ""}
          </button>
        )}
        {thoughtsExpanded && thoughts.map((t) => <InlineThoughtView key={t.id} trace={t} />)}

        {/* Main content flow */}
        <div className="space-y-1">
          {mergedContent.map((item, idx) => {
            if (item.type === "thought" && !thoughtsExpanded) {
              // Thoughts handled above
              return null;
            }
            if (item.type === "thought" && thoughtsExpanded) {
              // Already rendered above
              return null;
            }
            if (item.type === "message") {
              return (
                <div key={idx} className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                  <MarkdownViewer content={item.content || ""} className="text-sm" />
                </div>
              );
            }
            if (item.type === "tool" && item.merged) {
              return (
                <InlineToolView
                  key={item.merged.toolCallId}
                  merged={item.merged}
                  formatTime={formatTime}
                />
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}

export function TracePanel({ sessionId }: TracePanelProps) {
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const [stats, setStats] = useState<{
    totalDays: number;
    totalFiles: number;
    totalRecords: number;
    uniqueSessions: number;
    eventTypes: Record<string, number>;
  } | null>(null);

  const fetchTraces = useCallback(async () => {
    if (!sessionId) {
      setTraces([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ sessionId });
      const res = await desktopAwareFetch(`/api/traces?${params}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Failed to fetch traces: ${res.statusText}`);
      }

      const data = await res.json();
      setTraces(data.traces || []);
    } catch (err) {
      console.error("[TracePanel] Failed to fetch traces:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await desktopAwareFetch("/api/traces/stats", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("[TracePanel] Failed to fetch stats:", err);
    }
  }, []);

  useEffect(() => {
    fetchTraces();
    fetchStats();
  }, [fetchTraces, fetchStats]);

  const exportTraces = useCallback(async () => {
    if (!sessionId) return;

    try {
      const params = new URLSearchParams({ sessionId });
      const res = await desktopAwareFetch(`/api/traces/export?${params}`, { cache: "no-store" });

      if (!res.ok) {
        throw new Error(`Failed to export traces: ${res.statusText}`);
      }

      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.export, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `traces-${sessionId}-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[TracePanel] Failed to export traces:", err);
    }
  }, [sessionId]);

  // Merge tool_call and tool_result by toolCallId
  const mergedRecords = useMemo(() => mergeToolTraces(traces), [traces]);

  // Filter records based on selected filter
  const filteredRecords = useMemo(() => {
    if (filter === "all") return mergedRecords;
    if (filter === "tools") {
      // Show only merged tool records
      return mergedRecords.filter((r) => isMergedTool(r));
    }
    // For tool_call or tool_result filters, show the merged view but only matching items
    if (filter === "tool_call" || filter === "tool_result") {
      return mergedRecords.filter((r) => {
        if (isMergedTool(r)) return true; // Show merged tools
        return r.eventType === filter;
      });
    }
    // For other filters, show non-merged items matching the filter
    return mergedRecords.filter((r) => {
      if (isMergedTool(r)) return false;
      return r.eventType === filter;
    });
  }, [mergedRecords, filter]);

  // Group into conversation turns for continuous flow
  const conversationTurns = useMemo(
    () => groupIntoConversationTurns(filteredRecords),
    [filteredRecords]
  );



  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-[#13151d]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <svg
            className="w-4 h-4 text-gray-500 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Agent Trace
          </span>
          {traces.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
              {traces.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTraces}
            disabled={loading}
            className="text-[11px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            {loading ? "..." : "Refresh"}
          </button>
          <button
            onClick={exportTraces}
            disabled={traces.length === 0}
            className="px-2 py-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Export
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 flex items-center gap-4 text-[10px] text-gray-500 dark:text-gray-400 shrink-0">
          <span>{stats.totalRecords} total records</span>
          <span>{stats.uniqueSessions} sessions</span>
          <span>{stats.totalDays} days</span>
        </div>
      )}

      {/* Filter bar */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center gap-1.5 shrink-0 overflow-x-auto">
        {(
          [
            { key: "all", label: "All", active: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
            { key: "user_message", label: "User", active: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
            { key: "agent_message", label: "Agent", active: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
            { key: "tools", label: "Tools", active: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" },
            { key: "agent_thought", label: "Thoughts", active: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" },
          ] as const
        ).map(({ key, label, active }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-2 py-1 text-[11px] font-medium rounded-md whitespace-nowrap transition-colors ${
              filter === key
                ? active
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredRecords.length === 0 && (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center">
            <svg
              className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {sessionId ? "No traces for this session yet" : "Select a session to view traces"}
            </p>
          </div>
        </div>
      )}

      {/* Trace content - continuous conversation flow */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {conversationTurns.map((turn, idx) => {
            if (turn.type === "user") {
              const trace = turn.items[0];
              if (!isMergedTool(trace)) {
                return (
                  <UserMessageBubble
                    key={trace.id}
                    trace={trace}
                    formatTime={formatTime}
                  />
                );
              }
            }
            return (
              <AgentResponseBlock
                key={`turn-${idx}`}
                turn={turn}
                formatTime={formatTime}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
