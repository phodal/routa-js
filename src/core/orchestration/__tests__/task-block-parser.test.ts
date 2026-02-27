/**
 * Task Block Parser Tests
 *
 * Tests parsing of @@@task blocks in various formats:
 * - Bare @@@ blocks (backwards compatibility)
 * - @@@task blocks (singular)
 * - @@@tasks blocks (plural)
 */

import { describe, it, expect } from "vitest";
import {
  extractTaskBlocks,
  parseTaskBlockContent,
  hasTaskBlocks,
  type ParsedTask,
} from "../task-block-parser";

describe("task-block-parser", () => {
  describe("hasTaskBlocks", () => {
    it("should detect bare @@@ blocks", () => {
      const content = `
Some text
@@@
# Task Title
@@@
More text
`;
      expect(hasTaskBlocks(content)).toBe(true);
    });

    it("should detect @@@task blocks", () => {
      const content = `
@@@task
# Task Title
@@@
`;
      expect(hasTaskBlocks(content)).toBe(true);
    });

    it("should detect @@@tasks blocks", () => {
      const content = `
@@@tasks
# Task Title
@@@
`;
      expect(hasTaskBlocks(content)).toBe(true);
    });

    it("should return false when no task blocks present", () => {
      const content = "Just some regular markdown content";
      expect(hasTaskBlocks(content)).toBe(false);
    });
  });

  describe("parseTaskBlockContent", () => {
    it("should parse task with all sections", () => {
      const blockContent = `
# Task 1: Create TypeScript CLI Package Structure

Set up npm workspaces monorepo structure for the TypeScript CLI.

## Scope
- Create packages/core, packages/cli, packages/sdk directories
- Set up TypeScript configuration (ESM, Node ≥ 20)

## Inputs
- Issue #28 requirements
- Existing package.json

## Definition of Done
- npm workspaces configured
- TypeScript ESM setup working

## Verification
npm run build produces bundle in packages/cli/dist/
`;

      const result = parseTaskBlockContent(blockContent);
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Task 1: Create TypeScript CLI Package Structure");
      expect(result!.sections.scope).toContain("Create packages/core");
      expect(result!.sections.inputs).toContain("Issue #28 requirements");
      expect(result!.sections.definitionOfDone).toContain("npm workspaces configured");
      expect(result!.sections.verification).toContain("npm run build");
    });

    it("should return null for block without title", () => {
      const blockContent = `
Just some content without a title heading
`;
      const result = parseTaskBlockContent(blockContent);
      expect(result).toBeNull();
    });

    it("should handle task with objective section", () => {
      const blockContent = `
# Task Title

## Objective
Build a feature that does X

## Scope
- File A
- File B
`;
      const result = parseTaskBlockContent(blockContent);
      expect(result).not.toBeNull();
      expect(result!.sections.objective).toContain("Build a feature");
    });
  });

  describe("extractTaskBlocks - bare @@@ format", () => {
    it("should extract multiple bare @@@ blocks from Issue #28 format", () => {
      const content = `# Issue #28: TypeScript CLI with ACP Orchestration

## Goal
Build a TypeScript CLI for Routa that acts as an ACP orchestrator.

## Tasks

@@@
# Task 1: Create TypeScript CLI Package Structure

Set up npm workspaces monorepo structure for the TypeScript CLI.

## Scope
- Create packages/core, packages/cli, packages/sdk directories
- Set up TypeScript configuration (ESM, Node ≥ 20)
- Configure esbuild for bundling

## Inputs
- Issue #28 requirements
- Existing package.json

## Definition of Done
- npm workspaces configured
- TypeScript ESM setup working
- Basic build command produces bundle

## Verification
npm run build produces bundle in packages/cli/dist/
@@@

@@@
# Task 2: Implement packages/core - AcpClient and AcpPresets

Implement the core ACP client and presets.

## Scope
- packages/core/src/AcpClient.ts - wraps ACP JSON-RPC over stdio
- packages/core/src/AcpPresets.ts - ported from src/core/acp/acp-presets.ts

## Definition of Done
- AcpClient can initialize, create sessions, send prompts
- AcpPresets resolves agent binary + args per provider

## Verification
npm run test passes for core package
@@@

@@@
# Task 3: Implement packages/core - RoutaOrchestrator

Implement the orchestrator that manages the ROUTA→CRAFTER→GATE pipeline.

## Scope
- packages/core/src/RoutaOrchestrator.ts
- Session store for tracking active sessions

## Definition of Done
- Spawns ROUTA session, streams output
- Detects delegate_task → spawns CRAFTER

## Verification
npm run test passes for orchestrator
@@@
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(3);
      expect(result.validTaskCount).toBe(3);
      expect(result.invalidBlockCount).toBe(0);
      expect(result.tasks).toHaveLength(3);

      // Verify first task
      expect(result.tasks[0].title).toBe("Task 1: Create TypeScript CLI Package Structure");
      expect(result.tasks[0].sections.scope).toContain("Create packages/core");
      expect(result.tasks[0].sections.definitionOfDone).toContain("npm workspaces configured");
      expect(result.tasks[0].sections.verification).toContain("npm run build");

      // Verify second task
      expect(result.tasks[1].title).toBe("Task 2: Implement packages/core - AcpClient and AcpPresets");
      expect(result.tasks[1].sections.scope).toContain("AcpClient.ts");
      expect(result.tasks[1].sections.definitionOfDone).toContain("AcpClient can initialize");

      // Verify third task
      expect(result.tasks[2].title).toBe("Task 3: Implement packages/core - RoutaOrchestrator");
      expect(result.tasks[2].sections.scope).toContain("RoutaOrchestrator.ts");

      // Verify content cleanup - task blocks should be replaced with placeholders
      expect(result.contentWithoutBlocks).toContain("<!-- task-placeholder-0 -->");
      expect(result.contentWithoutBlocks).toContain("<!-- task-placeholder-1 -->");
      expect(result.contentWithoutBlocks).toContain("<!-- task-placeholder-2 -->");
      expect(result.contentWithoutBlocks).not.toContain("@@@");
    });

    it("should handle single bare @@@ block", () => {
      const content = `
Some intro text

@@@
# Single Task Title

## Objective
Do something important

## Scope
- File A
- File B

## Definition of Done
- Feature works
- Tests pass
@@@

Some outro text
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(1);
      expect(result.validTaskCount).toBe(1);
      expect(result.tasks[0].title).toBe("Single Task Title");
      expect(result.tasks[0].sections.objective).toContain("Do something important");
      expect(result.contentWithoutBlocks).toContain("Some intro text");
      expect(result.contentWithoutBlocks).toContain("Some outro text");
    });
  });

  describe("extractTaskBlocks - @@@task format", () => {
    it("should extract @@@task blocks", () => {
      const content = `
@@@task
# Task with explicit task marker

## Scope
- Implement feature X

## Definition of Done
- Feature X works
@@@
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(1);
      expect(result.validTaskCount).toBe(1);
      expect(result.tasks[0].title).toBe("Task with explicit task marker");
      expect(result.tasks[0].sections.scope).toContain("Implement feature X");
    });
  });

  describe("extractTaskBlocks - @@@tasks format", () => {
    it("should extract @@@tasks blocks", () => {
      const content = `
@@@tasks
# Task with plural tasks marker

## Scope
- Multiple related tasks

## Definition of Done
- All tasks complete
@@@
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(1);
      expect(result.validTaskCount).toBe(1);
      expect(result.tasks[0].title).toBe("Task with plural tasks marker");
    });
  });

  describe("extractTaskBlocks - mixed formats", () => {
    it("should handle mix of bare @@@, @@@task, and @@@tasks", () => {
      const content = `
@@@
# Task 1: Bare format
## Scope
- Feature A
@@@

@@@task
# Task 2: Singular format
## Scope
- Feature B
@@@

@@@tasks
# Task 3: Plural format
## Scope
- Feature C
@@@
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(3);
      expect(result.validTaskCount).toBe(3);
      expect(result.tasks[0].title).toBe("Task 1: Bare format");
      expect(result.tasks[1].title).toBe("Task 2: Singular format");
      expect(result.tasks[2].title).toBe("Task 3: Plural format");
    });
  });

  describe("extractTaskBlocks - invalid blocks", () => {
    it("should mark blocks without title as invalid", () => {
      const content = `
@@@
No title heading here, just content
@@@

@@@task
# Valid Task
## Scope
- Something
@@@
`;

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(2);
      expect(result.validTaskCount).toBe(1);
      expect(result.invalidBlockCount).toBe(1);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].title).toBe("Valid Task");
      expect(result.contentWithoutBlocks).toContain("<!-- invalid-task-block-removed -->");
    });
  });

  describe("extractTaskBlocks - edge cases", () => {
    it("should handle Windows line endings (CRLF)", () => {
      const content = "@@@\r\n# Task Title\r\n## Scope\r\n- Item\r\n@@@";

      const result = extractTaskBlocks(content);

      expect(result.validTaskCount).toBe(1);
      expect(result.tasks[0].title).toBe("Task Title");
    });

    it("should handle tabs and spaces after @@@", () => {
      const content = "@@@  \t  \n# Task Title\n@@@";

      const result = extractTaskBlocks(content);

      expect(result.validTaskCount).toBe(1);
      expect(result.tasks[0].title).toBe("Task Title");
    });

    it("should return empty result when no blocks present", () => {
      const content = "Just regular markdown content without any task blocks";

      const result = extractTaskBlocks(content);

      expect(result.blockCount).toBe(0);
      expect(result.validTaskCount).toBe(0);
      expect(result.tasks).toHaveLength(0);
      expect(result.contentWithoutBlocks).toBe(content);
    });
  });
});

