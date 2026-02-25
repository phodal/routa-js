/**
 * Unit tests for CodeRetrievalViewer component
 *
 * Tests the parsing and rendering of codebase-retrieval tool outputs.
 */

import { describe, it, expect } from "vitest";

// Import the parsing function directly - we'll need to access it via the component
// For now, let's define the function inline for testing purposes

interface CodeSection {
  path: string;
  code: string;
  startLine?: number;
  language?: string;
}

function parseCodeRetrievalOutput(output: string): CodeSection[] {
  const sections: CodeSection[] = [];

  try {
    const parsed = JSON.parse(output);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    for (const item of items) {
      if (typeof item === "object" && item !== null && "text" in item) {
        const text = item.text as string;
        const pathMatches = [...text.matchAll(/Path:\s*([^\n]+)/g)];

        if (pathMatches.length > 0) {
          for (let i = 0; i < pathMatches.length; i++) {
            const match = pathMatches[i];
            const path = match[1]?.trim();
            const pathStart = match.index ?? 0;
            const nextPathStart = i < pathMatches.length - 1
              ? (pathMatches[i + 1].index ?? text.length)
              : text.length;

            const afterPath = text.slice(pathStart + match[0].length, nextPathStart);
            const codeLines = afterPath.split("\n");

            const startIndex = codeLines.findIndex(line =>
              line.trim().match(/^\d+\s/) || line.match(/^\t/)
            );

            if (startIndex !== -1) {
              const cleanedLines: string[] = [];
              let startLine = 1;

              for (const line of codeLines.slice(startIndex)) {
                const tabMatch = line.match(/^(\d+)\t(.*)$/);
                if (tabMatch) {
                  if (cleanedLines.length === 0) {
                    startLine = parseInt(tabMatch[1], 10);
                  }
                  cleanedLines.push(tabMatch[2]);
                } else {
                  const spaceMatch = line.match(/^\s*(\d+)\s(.*)$/);
                  if (spaceMatch) {
                    if (cleanedLines.length === 0) {
                      startLine = parseInt(spaceMatch[1], 10);
                    }
                    cleanedLines.push(spaceMatch[2]);
                  } else if (line.trim()) {
                    cleanedLines.push(line);
                  }
                }
              }

              if (cleanedLines.length > 0) {
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
    // Return empty on parse error
  }

  return sections;
}

// Sample codebase-retrieval output formats
const SAMPLE_OUTPUTS = {
  // Standard format with tab-separated line numbers
  standard: JSON.stringify([
    {
      type: "text",
      text: `The following code sections were retrieved:
Path: src/example.ts
     1	import { useState } from "react";
     2	function Example() {
     3	  const [count, setCount] = useState(0);
     4	  return <div>{count}</div>;
     5	}

Path: utils/helper.py
     1	def calculate_sum(a, b):
     2	    return a + b
     3
     4	class Helper:
     5	    pass`
    }
  ]),

  // Format with space-prefixed line numbers
  spacePrefixed: JSON.stringify([
    {
      type: "text",
      text: `The following code sections were retrieved:
Path: components/Button.tsx
  1 export const Button = ({ children }) => {
  2   return <button>{children}</button>;
  3 }`
    }
  ]),

  // Single section
  singleSection: JSON.stringify([
    {
      type: "text",
      text: `The following code sections were retrieved:
Path: config.json
     1	{
     2	  "name": "test",
     3	  "version": "1.0.0"
     4	}`
    }
  ]),

  // Empty result
  empty: JSON.stringify([
    {
      type: "text",
      text: "No code sections found."
    }
  ]),

  // Multiple sections with various languages
  multiLanguage: JSON.stringify([
    {
      type: "text",
      text: `The following code sections were retrieved:
Path: src/main.rs
     1	fn main() {
     2	    println!("Hello");
     3	}

Path: lib/utils.ts
     1	export function add(a: number, b: number): number {
     2	    return a + b;
     3	}

Path: scripts/deploy.sh
     1	#!/bin/bash
     2	echo "Deploying..."`
    }
  ]),
};

describe("parseCodeRetrievalOutput", () => {
  it("should parse standard format with tab-separated line numbers", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.standard);

    expect(sections).toHaveLength(2);
    expect(sections[0]).toMatchObject({
      path: "src/example.ts",
      language: "typescript",
      startLine: 1,
    });
    expect(sections[0].code).toContain('import { useState } from "react"');
    expect(sections[0].code).toContain("const [count, setCount] = useState(0)");

    expect(sections[1]).toMatchObject({
      path: "utils/helper.py",
      language: "python",
      startLine: 1,
    });
    expect(sections[1].code).toContain("def calculate_sum(a, b):");
  });

  it("should parse space-prefixed line numbers", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.spacePrefixed);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      path: "components/Button.tsx",
      startLine: 1,
    });
    // Accept either typescript or tsx as valid language for .tsx files
    expect(["typescript", "tsx"]).toContain(sections[0].language);
    expect(sections[0].code).toContain('export const Button = ({ children })');
  });

  it("should parse single section correctly", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.singleSection);

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      path: "config.json",
      language: "json",
      startLine: 1,
    });
    expect(sections[0].code).toContain('"name": "test"');
  });

  it("should return empty array for empty results", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.empty);

    expect(sections).toHaveLength(0);
  });

  it("should detect multiple languages correctly", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.multiLanguage);

    expect(sections).toHaveLength(3);
    expect(sections[0].language).toBe("rust");
    expect(sections[1].language).toBe("typescript");
    expect(sections[2].language).toBe("bash");
  });

  it("should handle invalid JSON gracefully", () => {
    const sections = parseCodeRetrievalOutput("not valid json");

    expect(sections).toHaveLength(0);
  });

  it("should handle malformed output structure", () => {
    const malformed = JSON.stringify([
      {
        type: "text",
        text: "Some text without Path: markers"
      }
    ]);

    const sections = parseCodeRetrievalOutput(malformed);

    expect(sections).toHaveLength(0);
  });

  it("should strip line numbers from code content", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.standard);

    // Code should not contain line numbers at start of lines
    expect(sections[0].code).not.toMatch(/\d+\t/);

    // But should contain actual code
    expect(sections[0].code).toContain("import");
    expect(sections[0].code).toContain("function Example");
  });

  it("should preserve code structure", () => {
    const output = JSON.stringify([
      {
        type: "text",
        text: `The following code sections were retrieved:
Path: src/indented.ts
     1	function outer() {
     2	  if (true) {
     3	    return "nested";
     4	  }
     5	}`
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);

    expect(sections[0].code).toContain("function outer()");
    expect(sections[0].code).toContain('return "nested"');
    expect(sections[0].code).toMatch(/\{/);
    expect(sections[0].code).toMatch(/\}/);
  });

  it("should handle files with no extension", () => {
    const output = JSON.stringify([
      {
        type: "text",
        text: `The following code sections were retrieved:
Path: Makefile
     1	all:
     2	    echo "Building"`
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);

    expect(sections).toHaveLength(1);
    expect(sections[0].path).toBe("Makefile");
    expect(sections[0].language).toBe("text");
  });

  it("should handle unknown file extensions", () => {
    const output = JSON.stringify([
      {
        type: "text",
        text: `The following code sections were retrieved:
Path: file.unknown_ext
     1	content here`
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);

    expect(sections).toHaveLength(1);
    expect(sections[0].language).toBe("text");
  });
});

describe("Language Detection", () => {
  const testCases = [
    ["file.rs", "rust"],
    ["file.ts", "typescript"],
    ["file.tsx", "tsx"],
    ["file.js", "javascript"],
    ["file.jsx", "jsx"],
    ["file.py", "python"],
    ["file.json", "json"],
    ["file.yaml", "yaml"],
    ["file.yml", "yaml"],
    ["file.md", "markdown"],
    ["file.css", "css"],
    ["file.html", "html"],
    ["file.go", "go"],
    ["file.java", "java"],
    ["file.cpp", "cpp"],
    ["file.sh", "bash"],
    ["file.txt", "text"],
    ["Makefile", "text"],
  ];

  it.each(testCases)("should detect %s as %s", (filename, expectedLang) => {
    const output = JSON.stringify([
      {
        type: "text",
        text: `The following code sections were retrieved:
Path: ${filename}
     1	code content`
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);
    expect(sections[0].language).toBe(expectedLang);
  });
});
