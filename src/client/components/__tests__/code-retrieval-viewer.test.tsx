/**
 * Unit tests for CodeRetrievalViewer component
 *
 * Tests the parsing and rendering of codebase-retrieval tool outputs.
 */

import { describe, it, expect } from "vitest";
import { parseCodeRetrievalOutput } from "../code-retrieval-viewer";



// Sample codebase-retrieval output formats
// Note: Using JSON.parse/stringify to ensure proper escaping of special characters
const SAMPLE_OUTPUTS = {
  // Standard format with tab-separated line numbers
  standard: JSON.stringify([
    {
      type: "text",
      text: "The following code sections were retrieved:\nPath: src/example.ts\n     1\timport { useState } from \"react\";\n     2\tfunction Example() {\n     3\t  const [count, setCount] = useState(0);\n     4\t  return <div>{count}</div>;\n     5\t}\n\nPath: utils/helper.py\n     1\tdef calculate_sum(a, b):\n     2\t    return a + b\n     3\t\n     4\tclass Helper:\n     5\t    pass"
    }
  ]),

  // Single section
  singleSection: JSON.stringify([
    {
      type: "text",
      text: "The following code sections were retrieved:\nPath: config.json\n     1\t{\n     2\t  \"name\": \"test\",\n     3\t  \"version\": \"1.0.0\"\n     4\t}"
    }
  ]),

  // Empty result
  empty: JSON.stringify([
    {
      type: "text",
      text: "No code sections found."
    }
  ]),

  // Real trace data from issue - should parse exactly 6 sections
  realTraceData: JSON.stringify([
    {
      type: "text",
      text: "The following code sections were retrieved:\nPath: src/app/[workspaceId]/page.tsx\n...\n    16\t\n    17\timport { useCallback, useState, useEffect } from \"react\";\n    18\timport { useRouter, useParams } from \"next/navigation\";\n\nPath: src/app/[workspaceId]/[sessionId]/page.tsx\n...\n    15\t\n    16\timport {useCallback, useEffect, useRef, useState} from \"react\";\n\nPath: .kiro/specs/workspace-centric-redesign/design.md\n...\n   207\t```\n   208\t\n   209\t**行为**：\n   210\t- 显示在聊天输入区域附近\n\nPath: src/client/hooks/use-skills.ts\n...\n    63\t  installFromCatalog: (skills: Array<{ name: string; source: string }>) => Promise<CatalogInstallResult | null>;\n\nPath: src/client/hooks/use-acp.ts\n...\n    73\t\n    74\texport function useAcp(baseUrl: string = \"\"): UseAcpState & UseAcpActions {\n\nPath: src/client/components/codebase-picker.tsx\n     1\t\"use client\";\n     2\t\n     3\timport type { CodebaseData } from \"../hooks/use-workspaces\";"
    }
  ]),

  // Edge case: "Path:" appearing in code content (should not be counted)
  pathInContent: JSON.stringify([
    {
      type: "text",
      text: "The following code sections were retrieved:\nPath: src/router.ts\n     1\t// This is a router that handles Path: parameters\n     2\tconst route = \"Path: /api/users\";\n     3\tfunction handlePath() {\n     4\t  console.log(\"Path: is in the string\");\n     5\t}"
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

  it("should parse real trace data with exactly 6 sections", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.realTraceData);

    // This is the key test - should be 6, not 8
    expect(sections).toHaveLength(6);

    // Verify the paths
    expect(sections[0].path).toBe("src/app/[workspaceId]/page.tsx");
    expect(sections[1].path).toBe("src/app/[workspaceId]/[sessionId]/page.tsx");
    expect(sections[2].path).toBe(".kiro/specs/workspace-centric-redesign/design.md");
    expect(sections[3].path).toBe("src/client/hooks/use-skills.ts");
    expect(sections[4].path).toBe("src/client/hooks/use-acp.ts");
    expect(sections[5].path).toBe("src/client/components/codebase-picker.tsx");
  });

  it("should not count 'Path:' appearing in code content as a section", () => {
    const sections = parseCodeRetrievalOutput(SAMPLE_OUTPUTS.pathInContent);

    // Should only find 1 section (the actual file), not the "Path:" strings in the code
    expect(sections).toHaveLength(1);
    expect(sections[0].path).toBe("src/router.ts");
    expect(sections[0].code).toContain('// This is a router that handles Path: parameters');
  });

  it("should detect correct language from file extension", () => {
    const testCases: Array<[string, string]> = [
      ["file.ts", "typescript"],
      ["file.tsx", "tsx"],
      ["file.js", "javascript"],
      ["file.jsx", "jsx"],
      ["file.py", "python"],
      ["file.rs", "rust"],
      ["file.json", "json"],
      ["file.md", "markdown"],
      ["file.yaml", "yaml"],
      ["file.yml", "yaml"],
      ["file.sh", "bash"],
      ["file.go", "go"],
      ["file.java", "java"],
      ["file.cpp", "cpp"],
      ["file.c", "c"],
      ["file.unknown", "text"],
    ];

    testCases.forEach(([filename, expectedLang]) => {
      const output = JSON.stringify([
        {
          type: "text",
          text: `The following code sections were retrieved:\nPath: ${filename}\n     1\tcode content`
        }
      ]);

      const sections = parseCodeRetrievalOutput(output);
      expect(sections[0].language).toBe(expectedLang);
    });
  });

  it("should handle plain text format (non-JSON)", () => {
    const plainText = "The following code sections were retrieved:\nPath: src/test.ts\n     1\tconst x = 1;\n     2\tconst y = 2;";

    const sections = parseCodeRetrievalOutput(plainText);

    expect(sections).toHaveLength(1);
    expect(sections[0].path).toBe("src/test.ts");
    expect(sections[0].code).toContain("const x = 1;");
  });

  it("should handle object format with 'output' field", () => {
    const objectFormat = JSON.stringify({
      output: "The following code sections were retrieved:\nPath: src/test.ts\n     1\tconst x = 1;"
    });

    const sections = parseCodeRetrievalOutput(objectFormat);

    expect(sections).toHaveLength(1);
    expect(sections[0].path).toBe("src/test.ts");
  });

  it("should extract correct start line number", () => {
    const output = JSON.stringify([
      {
        type: "text",
        text: "The following code sections were retrieved:\nPath: src/test.ts\n    42\tfunction test() {\n    43\t  return true;\n    44\t}"
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);

    expect(sections).toHaveLength(1);
    expect(sections[0].startLine).toBe(42);
  });

  it("should handle multiple sections with different start lines", () => {
    const output = JSON.stringify([
      {
        type: "text",
        text: "The following code sections were retrieved:\nPath: src/file1.ts\n    10\tconst a = 1;\n\nPath: src/file2.ts\n   100\tconst b = 2;"
      }
    ]);

    const sections = parseCodeRetrievalOutput(output);

    expect(sections).toHaveLength(2);
    expect(sections[0].startLine).toBe(10);
    expect(sections[1].startLine).toBe(100);
  });
});


