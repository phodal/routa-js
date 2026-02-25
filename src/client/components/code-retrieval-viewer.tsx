"use client";

/**
 * CodeRetrievalViewer - Component for displaying codebase-retrieval tool results
 *
 * The codebase-retrieval tool returns a JSON array with entries containing:
 * {
 *   "type": "text",
 *   "text": "The following code sections were retrieved:\nPath: file1.js\n     1\tcode here\n\nPath: file2.py\n     1\tcode here..."
 * }
 *
 * This component parses and displays the code sections with syntax highlighting.
 */

import { useState, useMemo } from "react";
import { CodeBlock } from "./code-block";

interface CodeSection {
  path: string;
  code: string;
  startLine?: number;
  language?: string;
}

function parseCodeRetrievalOutput(output: string): CodeSection[] {
  const sections: CodeSection[] = [];

  try {
    // Parse the JSON output
    const parsed = JSON.parse(output);

    // Handle array format
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (typeof item === "object" && item !== null && "text" in item) {
        const text = item.text as string;

        // Split by "Path:" to find each code section
        // The format is: "Path: <filepath>\n     1\tcode\n     2\tcode..."
        const pathMatches = [...text.matchAll(/Path:\s*([^\n]+)/g)];

        if (pathMatches.length > 0) {
          let lastIndex = 0;

          for (let i = 0; i < pathMatches.length; i++) {
            const match = pathMatches[i];
            const path = match[1]?.trim();
            const pathStart = match.index ?? 0;

            // Get content from after this path to the next path (or end)
            const nextPathStart = i < pathMatches.length - 1
              ? (pathMatches[i + 1].index ?? text.length)
              : text.length;

            // Extract the code section (starts after the path line)
            const afterPath = text.slice(pathStart + match[0].length, nextPathStart);
            const codeLines = afterPath.split("\n");

            // Remove leading/trailing empty lines and the intro text
            const startIndex = codeLines.findIndex(line =>
              line.trim().match(/^\d+\s/) || line.match(/^\t/)
            );

            if (startIndex !== -1) {
              // Parse line numbers and remove them from code
              const cleanedLines: string[] = [];
              let startLine = 1;

              for (const line of codeLines.slice(startIndex)) {
                // Match tab-prefixed format: "     1\tcode" or "1\tcode"
                const tabMatch = line.match(/^(\d+)\t(.*)$/);
                if (tabMatch) {
                  if (cleanedLines.length === 0) {
                    startLine = parseInt(tabMatch[1], 10);
                  }
                  cleanedLines.push(tabMatch[2]);
                } else {
                  // Match space-prefixed format: "     1 code"
                  const spaceMatch = line.match(/^\s*(\d+)\s(.*)$/);
                  if (spaceMatch) {
                    if (cleanedLines.length === 0) {
                      startLine = parseInt(spaceMatch[1], 10);
                    }
                    cleanedLines.push(spaceMatch[2]);
                  } else if (line.trim()) {
                    // Line without number, just add as-is
                    cleanedLines.push(line);
                  }
                }
              }

              if (cleanedLines.length > 0) {
                // Detect language from file extension
                const ext = path.split(".").pop()?.toLowerCase();
                const langMap: Record<string, string> = {
                  rs: "rust",
                  ts: "typescript",
                  js: "javascript",
                  jsx: "jsx",
                  tsx: "tsx",
                  py: "python",
                  json: "json",
                  yaml: "yaml",
                  yml: "yaml",
                  md: "markdown",
                  css: "css",
                  html: "html",
                  htm: "html",
                  sql: "sql",
                  go: "go",
                  java: "java",
                  cpp: "cpp",
                  c: "c",
                  h: "c",
                  cs: "csharp",
                  php: "php",
                  rb: "ruby",
                  sh: "bash",
                };

                sections.push({
                  path,
                  code: cleanedLines.join("\n"),
                  startLine,
                  language: ext && langMap[ext] ? langMap[ext] : "text",
                });
              }
            }
          }
        }
      }
    }
  } catch (e) {
    // If JSON parsing fails, try to parse as plain text with Path: markers
    const pathMatches = [...output.matchAll(/Path:\s*([^\n]+)/g)];
    // ... fallback parsing logic
  }

  return sections;
}

interface CodeRetrievalViewerProps {
  output: string;
  initiallyExpanded?: boolean;
}

export function CodeRetrievalViewer({
  output,
  initiallyExpanded = false,
}: CodeRetrievalViewerProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [selectedSection, setSelectedSection] = useState<number | null>(null);

  const sections = useMemo(() => parseCodeRetrievalOutput(output), [output]);

  if (sections.length === 0) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 italic">
        No code sections found in output
      </div>
    );
  }

  return (
    <div className="code-retrieval-viewer">
      {/* Summary header */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
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
          {sections.length} {sections.length === 1 ? "code section" : "code sections"} retrieved
        </span>
      </button>

      {/* Code sections */}
      {expanded && (
        <div className="mt-2 space-y-3">
          {sections.map((section, index) => (
            <div
              key={`${section.path}-${index}`}
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
            >
              {/* Section header */}
              <button
                type="button"
                onClick={() => setSelectedSection(selectedSection === index ? null : index)}
                className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 shrink-0"
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
                  <span className="text-xs font-mono text-gray-700 dark:text-gray-300 truncate">
                    {section.path}
                  </span>
                  {section.startLine !== undefined && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
                      Ln {section.startLine}
                    </span>
                  )}
                </div>
                <svg
                  className={`w-3 h-3 text-gray-400 transition-transform duration-150 ${
                    selectedSection === index ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Code content */}
              {selectedSection === index && (
                <div className="p-0">
                  <CodeBlock
                    code={section.code}
                    language={section.language}
                    filename={section.path.split("/").pop()}
                    variant="simple"
                    className="!border-0 !rounded-t-none"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CodeRetrievalViewer;
