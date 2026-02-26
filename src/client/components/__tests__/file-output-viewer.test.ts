/**
 * Unit tests for FileOutputViewer component
 *
 * Tests the parsing of search and read tool outputs.
 */

import { describe, it, expect } from "vitest";
import {
  parseSearchOutput,
  parseReadOutput,
  parseFileOutput,
  type SearchMatch,
  type ReadOutput,
} from "../file-output-viewer";

// ─── Sample Search Outputs ───────────────────────────────────────────────────

const SEARCH_OUTPUTS = {
  // Standard search output with multiple files
  multiFile: `Found 4 matches
/Users/phodal/ai/routa-js/src/app/page.tsx:
  Line 18: import {CollaborativeTaskEditor} from "@/client/components/collaborative-task-editor";
  Line 1052:               <CollaborativeTaskEditor

/Users/phodal/ai/routa-js/src/client/hooks/use-notes.ts:
  Line 64: export function useNotes(workspaceId: string): UseNotesReturn {
  Line 79:   const notesHook = useNotes(activeWorkspaceId ?? "");`,

  // Single file match
  singleFile: `Found 1 matches
/Users/phodal/ai/routa-js/src/core/tools/agent-tools.ts:
  Line 109:   async listAgents(workspaceId: string): Promise<ToolResult> {`,

  // File list without line numbers (file search)
  fileList: `/Users/phodal/ai/routa-js/src/client/components/agent-panel.tsx
/Users/phodal/ai/routa-js/e2e/install-agents-check.spec.ts
/Users/phodal/ai/routa-js/src/core/tools/agent-tools.ts`,

  // Empty result
  noMatches: `Found 0 matches`,
};

// ─── Sample Read Outputs ─────────────────────────────────────────────────────

const READ_OUTPUTS = {
  // Standard file content
  standard: `<path>/Users/phodal/ai/routa-js/src/core/tools/agent-tools.ts</path>
<type>file</type>
<content>1: /**
2:  * AgentTools - port of routa-core AgentTools.kt
3:  */
4: 
5: import { v4 as uuidv4 } from "uuid";</content>`,

  // Directory type
  directory: `<path>/Users/phodal/ai/routa-js/src/core</path>
<type>directory</type>
<content>agent-tools.ts
models/
utils/</content>`,

  // Partial file with offset
  partial: `<path>/Users/phodal/ai/routa-js/src/app/page.tsx</path>
<type>file</type>
<content>100: function HomePage() {
101:   return <div>Hello</div>;
102: }
103: 
104: export default HomePage;</content>`,
};

// ─── parseSearchOutput Tests ─────────────────────────────────────────────────

describe("parseSearchOutput", () => {
  it("should parse multi-file search results", () => {
    const matches = parseSearchOutput(SEARCH_OUTPUTS.multiFile);

    expect(matches).toHaveLength(2);

    // First file
    expect(matches[0].path).toBe("/Users/phodal/ai/routa-js/src/app/page.tsx");
    expect(matches[0].lines).toHaveLength(2);
    expect(matches[0].lines[0].lineNumber).toBe(18);
    expect(matches[0].lines[0].content).toContain("CollaborativeTaskEditor");
    expect(matches[0].lines[1].lineNumber).toBe(1052);

    // Second file
    expect(matches[1].path).toBe("/Users/phodal/ai/routa-js/src/client/hooks/use-notes.ts");
    expect(matches[1].lines).toHaveLength(2);
  });

  it("should parse single file match", () => {
    const matches = parseSearchOutput(SEARCH_OUTPUTS.singleFile);

    expect(matches).toHaveLength(1);
    expect(matches[0].path).toBe("/Users/phodal/ai/routa-js/src/core/tools/agent-tools.ts");
    expect(matches[0].lines).toHaveLength(1);
    expect(matches[0].lines[0].lineNumber).toBe(109);
    expect(matches[0].lines[0].content).toContain("listAgents");
  });

  it("should return empty for no matches", () => {
    const matches = parseSearchOutput(SEARCH_OUTPUTS.noMatches);

    expect(matches).toHaveLength(0);
  });

  it("should handle file list without line numbers", () => {
    // File list format is different - paths only without line numbers
    const matches = parseSearchOutput(SEARCH_OUTPUTS.fileList);
    // This format doesn't match our line-based parsing, so it returns empty
    expect(matches).toHaveLength(0);
  });
});

// ─── parseReadOutput Tests ───────────────────────────────────────────────────

describe("parseReadOutput", () => {
  it("should parse standard file content", () => {
    const result = parseReadOutput(READ_OUTPUTS.standard);

    expect(result).not.toBeNull();
    expect(result!.path).toBe("/Users/phodal/ai/routa-js/src/core/tools/agent-tools.ts");
    expect(result!.type).toBe("file");
    expect(result!.startLine).toBe(1);
    expect(result!.content).toContain("AgentTools");
    expect(result!.content).toContain("uuidv4");
    expect(result!.language).toBe("typescript");
  });

  it("should parse directory type", () => {
    const result = parseReadOutput(READ_OUTPUTS.directory);

    expect(result).not.toBeNull();
    expect(result!.path).toBe("/Users/phodal/ai/routa-js/src/core");
    expect(result!.type).toBe("directory");
  });

  it("should detect correct start line for partial files", () => {
    const result = parseReadOutput(READ_OUTPUTS.partial);

    expect(result).not.toBeNull();
    expect(result!.startLine).toBe(100);
    expect(result!.content).toContain("HomePage");
    expect(result!.language).toBe("tsx");
  });

  it("should return null for invalid format", () => {
    const result = parseReadOutput("not a valid read output");

    expect(result).toBeNull();
  });

  it("should detect language from file extension", () => {
    const output = `<path>/test/file.py</path>
<type>file</type>
<content>1: def main():
2:     pass</content>`;

    const result = parseReadOutput(output);

    expect(result).not.toBeNull();
    expect(result!.language).toBe("python");
  });
});

// ─── parseFileOutput Tests ───────────────────────────────────────────────────

describe("parseFileOutput", () => {
  it("should detect search output by format", () => {
    const result = parseFileOutput(SEARCH_OUTPUTS.multiFile);

    expect(result.kind).toBe("search");
    expect(result.searchMatches).toHaveLength(2);
  });

  it("should detect read output by format", () => {
    const result = parseFileOutput(READ_OUTPUTS.standard);

    expect(result.kind).toBe("read");
    expect(result.readOutput).toBeDefined();
    expect(result.readOutput!.path).toContain("agent-tools.ts");
  });

  it("should use toolName hint for search", () => {
    // Even without "Found X matches" prefix, should work with toolName hint
    const output = `/path/file.ts:
  Line 10: some code`;

    const result = parseFileOutput(output, "search");

    expect(result.kind).toBe("search");
  });

  it("should use toolName hint for read", () => {
    const result = parseFileOutput(READ_OUTPUTS.standard, "read");

    expect(result.kind).toBe("read");
  });

  it("should return unknown for unrecognized format", () => {
    const result = parseFileOutput("random text that is not search or read output");

    expect(result.kind).toBe("unknown");
  });

  it("should extract match count from search output", () => {
    const result = parseFileOutput(SEARCH_OUTPUTS.multiFile);

    expect(result.matchCount).toBe(4);
  });
});

