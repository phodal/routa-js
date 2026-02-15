/**
 * Task Block Parser
 *
 * Parses @@@task blocks from coordinator output into structured task definitions.
 * Ported from Intent's task-block-parser.js with TypeScript types.
 *
 * Example:
 *   @@@task
 *   # Authentication System
 *   ## Objective
 *   Build JWT-based auth for the API layer.
 *   ## Scope
 *   - src/auth/
 *   ## Definition of Done
 *   - Login/logout endpoints work
 *   ## Verification
 *   - npm test
 *   @@@
 */

export interface ParsedTask {
  title: string;
  content: string;
  /** Extracted sections from the task body */
  sections: {
    objective?: string;
    scope?: string;
    inputs?: string;
    definitionOfDone?: string;
    verification?: string;
    outputRequired?: string;
  };
}

export interface ParseResult {
  tasks: ParsedTask[];
  contentWithoutBlocks: string;
  blockCount: number;
  validTaskCount: number;
  invalidBlockCount: number;
}

// ─── Regex patterns ──────────────────────────────────────────────────────

const AT_TASK_BLOCK_REGEX = /@@@tasks?[ \t]*\r?\n([\s\S]*?)@@@/;
const AT_TASK_BLOCK_REGEX_GLOBAL = /@@@tasks?[ \t]*\r?\n([\s\S]*?)@@@/g;

/**
 * Normalize line endings to \n
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Extract section content from task body by ## heading name.
 */
function extractSection(content: string, headingName: string): string | undefined {
  const regex = new RegExp(
    `^##\\s+${headingName}\\s*\\n([\\s\\S]*?)(?=^##\\s|$)`,
    "mi"
  );
  const match = content.match(regex);
  if (!match) return undefined;
  return match[1].trim() || undefined;
}

/**
 * Parse a single task block content into a ParsedTask.
 * The first # heading is the title, everything after is the body.
 */
export function parseTaskBlockContent(blockContent: string): ParsedTask | null {
  const normalized = normalizeLineEndings(blockContent);
  const lines = normalized.split("\n");
  let title: string | null = null;
  let contentStartIndex = 0;

  // Find the first # heading - that's the title
  for (let i = 0; i < lines.length; i++) {
    const h1Match = lines[i].match(/^#\s+(.+)$/);
    if (h1Match) {
      const extractedTitle = h1Match[1].trim();
      if (extractedTitle.length > 0) {
        title = extractedTitle;
        contentStartIndex = i + 1;
        break;
      }
    }
  }

  if (!title) {
    return null;
  }

  const content = lines.slice(contentStartIndex).join("\n").trim();

  // Extract known sections
  const sections: ParsedTask["sections"] = {
    objective: extractSection(content, "Objective"),
    scope: extractSection(content, "Scope"),
    inputs: extractSection(content, "Inputs"),
    definitionOfDone:
      extractSection(content, "Definition of Done") ??
      extractSection(content, "Definition Of Done"),
    verification: extractSection(content, "Verification"),
    outputRequired:
      extractSection(content, "Output required") ??
      extractSection(content, "Output Required"),
  };

  return { title, content, sections };
}

/**
 * Extract all @@@task blocks from content.
 * Each block is replaced with a placeholder in the cleaned content.
 */
export function extractTaskBlocks(content: string): ParseResult {
  const allTasks: ParsedTask[] = [];
  const blockResults: Array<{ task: ParsedTask | null; fullMatch: string }> = [];
  let blockCount = 0;
  let invalidBlockCount = 0;

  const atMatches = content.matchAll(AT_TASK_BLOCK_REGEX_GLOBAL);
  for (const match of atMatches) {
    blockCount++;
    const blockContent = match[1];
    const task = parseTaskBlockContent(blockContent);
    blockResults.push({ task, fullMatch: match[0] });
    if (task) {
      allTasks.push(task);
    } else {
      invalidBlockCount++;
    }
  }

  // Replace each task block with an indexed placeholder
  let contentWithoutBlocks = content;
  let taskIndex = 0;
  for (const result of blockResults) {
    if (result.task) {
      contentWithoutBlocks = contentWithoutBlocks.replace(
        result.fullMatch,
        `<!-- task-placeholder-${taskIndex} -->`
      );
      taskIndex++;
    } else {
      contentWithoutBlocks = contentWithoutBlocks.replace(
        result.fullMatch,
        "<!-- invalid-task-block-removed -->"
      );
    }
  }

  return {
    tasks: allTasks,
    contentWithoutBlocks,
    blockCount,
    validTaskCount: allTasks.length,
    invalidBlockCount,
  };
}

/**
 * Check if content contains any @@@task blocks.
 */
export function hasTaskBlocks(content: string): boolean {
  return AT_TASK_BLOCK_REGEX.test(content);
}
