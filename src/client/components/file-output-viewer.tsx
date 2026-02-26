"use client";

/**
 * FileOutputViewer - Component for displaying file-based tool outputs
 *
 * Handles two formats:
 * 1. "search" tool output - "Found N matches\n/path/file.ts:\n  Line 18: code..."
 * 2. "read" tool output - "<path>/file.ts</path>\n<type>file</type>\n<content>1: code..."
 *
 * Displays file paths with line numbers and syntax-highlighted code.
 */

import { useState, useMemo } from "react";
import { CodeBlock } from "./code-block";

// ─── Type Definitions ────────────────────────────────────────────────────────

export interface SearchMatch {
  path: string;
  lines: { lineNumber: number; content: string }[];
}

export interface ReadOutput {
  path: string;
  type: "file" | "directory";
  content: string;
  startLine: number;
  language?: string;
}

export interface ParsedFileOutput {
  kind: "search" | "read" | "unknown";
  searchMatches?: SearchMatch[];
  readOutput?: ReadOutput;
  matchCount?: number;
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

/**
 * Parse search tool output format:
 * "Found 2 matches\n/Users/path/file.tsx:\n  Line 18: import {...};\n  Line 1052: <Component"
 */
export function parseSearchOutput(output: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const lines = output.split("\n");

  let currentPath: string | null = null;
  let currentLines: { lineNumber: number; content: string }[] = [];

  for (const line of lines) {
    // Skip "Found X matches" header
    if (line.startsWith("Found ") && line.includes(" match")) {
      continue;
    }

    // File path line ends with ":"
    const pathMatch = line.match(/^(\/[^:]+):$/);
    if (pathMatch) {
      // Save previous file if any
      if (currentPath && currentLines.length > 0) {
        matches.push({ path: currentPath, lines: currentLines });
      }
      currentPath = pathMatch[1];
      currentLines = [];
      continue;
    }

    // Line match format: "  Line 18: code here"
    const lineMatch = line.match(/^\s+Line\s+(\d+):\s*(.*)$/);
    if (lineMatch && currentPath) {
      currentLines.push({
        lineNumber: parseInt(lineMatch[1], 10),
        content: lineMatch[2],
      });
      continue;
    }

    // Empty line between files
    if (line.trim() === "" && currentPath && currentLines.length > 0) {
      matches.push({ path: currentPath, lines: currentLines });
      currentPath = null;
      currentLines = [];
    }
  }

  // Push last file if any
  if (currentPath && currentLines.length > 0) {
    matches.push({ path: currentPath, lines: currentLines });
  }

  return matches;
}

/**
 * Parse read tool output format:
 * "<path>/Users/path/file.ts</path>\n<type>file</type>\n<content>1: code\n2: code...</content>"
 */
export function parseReadOutput(output: string): ReadOutput | null {
  const pathMatch = output.match(/<path>([^<]+)<\/path>/);
  const typeMatch = output.match(/<type>([^<]+)<\/type>/);
  const contentMatch = output.match(/<content>([\s\S]*?)<\/content>/);

  if (!pathMatch) {
    return null;
  }

  const path = pathMatch[1];
  const type = (typeMatch?.[1] === "directory" ? "directory" : "file") as "file" | "directory";
  const rawContent = contentMatch?.[1] ?? "";

  // Parse line-numbered content: "1: code\n2: code"
  const contentLines = rawContent.split("\n");
  const cleanedLines: string[] = [];
  let startLine = 1;
  let foundFirstLine = false;

  for (const line of contentLines) {
    const lineMatch = line.match(/^(\d+):\s?(.*)$/);
    if (lineMatch) {
      if (!foundFirstLine) {
        startLine = parseInt(lineMatch[1], 10);
        foundFirstLine = true;
      }
      cleanedLines.push(lineMatch[2]);
    } else if (foundFirstLine) {
      // Continuation of content without line number
      cleanedLines.push(line);
    }
  }

  // Detect language from file extension
  const ext = path.split(".").pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    rs: "rust", ts: "typescript", js: "javascript", jsx: "jsx", tsx: "tsx",
    py: "python", json: "json", yaml: "yaml", yml: "yaml", md: "markdown",
    css: "css", html: "html", sql: "sql", go: "go", java: "java",
    cpp: "cpp", c: "c", h: "c", cs: "csharp", php: "php", rb: "ruby", sh: "bash",
  };

  return {
    path,
    type,
    content: cleanedLines.join("\n"),
    startLine,
    language: ext && langMap[ext] ? langMap[ext] : "text",
  };
}

/**
 * Detect and parse file output from search or read tools
 */
export function parseFileOutput(output: string, toolName?: string): ParsedFileOutput {
  // Check if it's a read output (XML format)
  if (output.includes("<path>") && output.includes("</path>")) {
    const readOutput = parseReadOutput(output);
    if (readOutput) {
      return { kind: "read", readOutput };
    }
  }

  // Check if it's a search output
  if (output.startsWith("Found ") && output.includes(" match")) {
    const matchCountMatch = output.match(/Found (\d+) match/);
    const matchCount = matchCountMatch ? parseInt(matchCountMatch[1], 10) : 0;
    const searchMatches = parseSearchOutput(output);
    return { kind: "search", searchMatches, matchCount };
  }

  // Fallback based on tool name
  if (toolName === "search") {
    const searchMatches = parseSearchOutput(output);
    if (searchMatches.length > 0) {
      return { kind: "search", searchMatches };
    }
  }

  if (toolName === "read") {
    const readOutput = parseReadOutput(output);
    if (readOutput) {
      return { kind: "read", readOutput };
    }
  }

  return { kind: "unknown" };
}

// ─── React Components ────────────────────────────────────────────────────────

interface FileOutputViewerProps {
  output: string;
  toolName?: string;
  initiallyExpanded?: boolean;
}

export function FileOutputViewer({
  output,
  toolName,
  initiallyExpanded = true,
}: FileOutputViewerProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const parsed = useMemo(() => parseFileOutput(output, toolName), [output, toolName]);

  if (parsed.kind === "unknown") {
    return null; // Let caller handle fallback
  }

  if (parsed.kind === "search" && parsed.searchMatches) {
    return (
      <SearchOutputViewer
        matches={parsed.searchMatches}
        matchCount={parsed.matchCount}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
      />
    );
  }

  if (parsed.kind === "read" && parsed.readOutput) {
    return (
      <ReadOutputViewer
        readOutput={parsed.readOutput}
        expanded={expanded}
        onToggle={() => setExpanded((e) => !e)}
      />
    );
  }

  return null;
}

// ─── Search Output Viewer ────────────────────────────────────────────────────

interface SearchOutputViewerProps {
  matches: SearchMatch[];
  matchCount?: number;
  expanded: boolean;
  onToggle: () => void;
}

function SearchOutputViewer({ matches, matchCount, expanded, onToggle }: SearchOutputViewerProps) {
  const [selectedFile, setSelectedFile] = useState<number | null>(null);

  return (
    <div className="file-output-viewer">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {matchCount ?? matches.reduce((sum, m) => sum + m.lines.length, 0)} {(matchCount ?? matches.length) === 1 ? "match" : "matches"} in {matches.length} {matches.length === 1 ? "file" : "files"}
        </span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 px-2 pb-2">
          {matches.map((match, idx) => (
            <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setSelectedFile(selectedFile === idx ? null : idx)}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                    {match.path.split("/").slice(-2).join("/")}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                    {match.lines.length} {match.lines.length === 1 ? "line" : "lines"}
                  </span>
                </div>
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${selectedFile === idx ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {selectedFile === idx && (
                <div className="px-3 py-2 bg-white dark:bg-gray-900/40 text-xs font-mono">
                  {match.lines.map((line, lineIdx) => (
                    <div key={lineIdx} className="flex gap-2 py-0.5">
                      <span className="text-gray-400 dark:text-gray-500 select-none shrink-0 w-8 text-right">
                        {line.lineNumber}
                      </span>
                      <span className="text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-all">
                        {line.content}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Read Output Viewer ──────────────────────────────────────────────────────

interface ReadOutputViewerProps {
  readOutput: ReadOutput;
  expanded: boolean;
  onToggle: () => void;
}

function ReadOutputViewer({ readOutput, expanded, onToggle }: ReadOutputViewerProps) {
  const filename = readOutput.path.split("/").pop() || readOutput.path;
  const lineCount = readOutput.content.split("\n").length;

  return (
    <div className="file-output-viewer">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
          {filename}
        </span>
        {readOutput.startLine > 1 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
            Ln {readOutput.startLine}
          </span>
        )}
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
          {lineCount} lines
        </span>
      </button>

      {expanded && (
        <div className="p-0">
          <CodeBlock
            code={readOutput.content}
            language={readOutput.language}
            filename={filename}
            variant="simple"
            wordWrap={true}
            className="!border-0 !rounded-t-none"
          />
        </div>
      )}
    </div>
  );
}

export default FileOutputViewer;
