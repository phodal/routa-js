#!/usr/bin/env npx tsx
/**
 * Issue Enricher CLI
 *
 * Analyzes GitHub issues using Claude Code and adds detailed analysis comments.
 * Designed for GitHub Actions triggered on issue creation.
 *
 * Usage:
 *   npx tsx scripts/issue-enricher.ts --issue 123
 *   npx tsx scripts/issue-enricher.ts --issue 123 --dry-run
 *   npx tsx scripts/issue-enricher.ts --issue 123 --assign-copilot
 *   npx tsx scripts/issue-enricher.ts --issue 123 --reopen
 *
 * Environment:
 *   ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN   # Required
 *   ANTHROPIC_BASE_URL                          # Optional, custom API endpoint
 *   ANTHROPIC_MODEL                             # Optional, default: claude-sonnet-4-20250514
 *   GH_TOKEN                                    # Required for gh CLI operations
 */

import { execSync } from "child_process";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ─── Configuration ─────────────────────────────────────────────────────────

const SKILL_PATH = ".claude/skills/issue-enricher/SKILL.md";

interface IssueData {
  number: number;
  title: string;
  body: string;
  labels: string[];
  author: string;
}

// ─── Label Taxonomy ────────────────────────────────────────────────────────

const LABEL_TAXONOMY = {
  type: [
    { name: "bug", color: "d73a4a", description: "Something isn't working" },
    { name: "enhancement", color: "a2eeef", description: "New feature or request" },
    { name: "documentation", color: "0075ca", description: "Improvements or additions to documentation" },
    { name: "question", color: "d876e3", description: "Further information is requested" },
    { name: "feature", color: "7057ff", description: "New feature request" },
  ],
  area: [
    { name: "area:frontend", color: "fbca04", description: "Related to the frontend/UI" },
    { name: "area:backend", color: "e4e669", description: "Related to the backend server" },
    { name: "area:api", color: "bfd4f2", description: "Related to the API layer" },
    { name: "area:database", color: "c5def5", description: "Related to database/storage" },
    { name: "area:devops", color: "fef2c0", description: "Related to CI/CD, deployment, or infrastructure" },
  ],
  complexity: [
    { name: "complexity:small", color: "0e8a16", description: "Small scope, straightforward change" },
    { name: "complexity:medium", color: "e4a907", description: "Moderate scope, requires some design work" },
    { name: "complexity:large", color: "b60205", description: "Large scope, significant effort required" },
  ],
};

// ─── Ensure Labels Exist ────────────────────────────────────────────────────

function ensureLabelsExist(): void {
  const allLabels = [
    ...LABEL_TAXONOMY.type,
    ...LABEL_TAXONOMY.area,
    ...LABEL_TAXONOMY.complexity,
  ];

  for (const label of allLabels) {
    try {
      // --force updates the label if it already exists, or creates it if not
      execSync(
        `gh label create "${label.name}" --color "${label.color}" --description "${label.description}" --force`,
        { encoding: "utf-8", cwd: process.cwd(), stdio: "pipe" }
      );
    } catch {
      // Non-fatal: log but continue if a label operation fails (e.g., auth or network issue)
    }
  }
}

// ─── Fetch Issue Data ──────────────────────────────────────────────────────

function fetchIssue(issueNumber: number): IssueData | null {
  try {
    const output = execSync(
      `gh issue view ${issueNumber} --json number,title,body,labels,author`,
      { encoding: "utf-8", cwd: process.cwd() }
    );
    const data = JSON.parse(output);
    return {
      number: data.number,
      title: data.title,
      body: data.body || "",
      labels: data.labels?.map((l: { name: string }) => l.name) || [],
      author: data.author?.login || "unknown",
    };
  } catch (error) {
    console.error("❌ Failed to fetch issue:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ─── Run Claude Analysis ───────────────────────────────────────────────────

async function analyzeIssue(issue: IssueData, dryRun: boolean): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;

  if (!apiKey && !dryRun) {
    console.error("❌ No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set");
    process.exit(1);
  }

  console.log(`\n🤖 Analyzing issue #${issue.number}: ${issue.title}\n`);

  // Load skill content
  const skillContent = existsSync(SKILL_PATH) ? readFileSync(SKILL_PATH, "utf-8") : "";

  const typeLabels = LABEL_TAXONOMY.type.map((l) => `\`${l.name}\``).join(", ");
  const areaLabels = LABEL_TAXONOMY.area.map((l) => `\`${l.name}\``).join(", ");
  const complexityLabels = LABEL_TAXONOMY.complexity.map((l) => `\`${l.name}\``).join(", ");

  const prompt = `Analyze GitHub issue #${issue.number} and provide a detailed analysis.

## Issue Title
${issue.title}

## Issue Body
${issue.body}

## Current Labels
${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}

## Instructions
1. Analyze the codebase to understand the context and find relevant files
2. Research potential solution approaches (2-3 approaches with trade-offs)
3. ${dryRun ? "Output what you would comment (do NOT actually run gh commands)" : `Add a comment to the issue using: gh issue comment ${issue.number} --body "..."`}
4. The comment should include:
   - Problem analysis
   - Relevant files in the codebase
   - 2-3 proposed approaches with trade-offs
   - Recommended approach
   - Effort estimate (Small/Medium/Large)
5. Automatically apply labels based on your analysis using these categories:
   - **Type** (pick ONE): ${typeLabels}
   - **Area** (pick ONE or MORE that apply): ${areaLabels}
   - **Complexity** (pick ONE): ${complexityLabels}
   ${dryRun
     ? "Output the labels you would apply and why, but do NOT run any gh commands."
     : `Apply the labels with: gh issue edit ${issue.number} --add-label "bug,area:frontend,complexity:small" (replace with the labels you chose)
   Use only labels from the taxonomy above. Do NOT invent new label names.`}

Do NOT create a new issue - only analyze and comment on issue #${issue.number}.`;

  if (dryRun) {
    console.log("   [DRY RUN] Would analyze with prompt:\n");
    console.log(prompt);
    return;
  }

  try {
    const { query } = await import("@anthropic-ai/claude-agent-sdk");
    const cliPath = join(process.cwd(), "node_modules/@anthropic-ai/claude-agent-sdk/cli.js");

    console.log("   Starting Claude Code agent...\n");
    console.log("─".repeat(80));

    const stream = query({
      prompt,
      options: {
        cwd: process.cwd(),
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        maxTurns: 30,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: cliPath,
        settingSources: ["project"],
        allowedTools: ["Read", "Bash", "Glob", "Grep"],
        systemPrompt: skillContent
          ? { type: "preset", preset: "claude_code", append: skillContent }
          : undefined,
      },
    });

    for await (const msg of stream) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            process.stdout.write(block.text);
          }
        }
      } else if (msg.type === "result") {
        if (msg.subtype === "success" && msg.result) {
          console.log("\n\n" + msg.result);
        }
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log("\n✅ Analysis complete\n");
  } catch (error) {
    console.error("❌ Analysis failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// ─── Reopen Issue ──────────────────────────────────────────────────────────

function reopenIssue(issueNumber: number): boolean {
  try {
    console.log(`\n🔄 Reopening issue #${issueNumber}...`);
    execSync(`gh issue reopen ${issueNumber}`, { encoding: "utf-8", cwd: process.cwd() });
    console.log(`   ✅ Issue #${issueNumber} reopened`);
    return true;
  } catch (error) {
    console.error("❌ Failed to reopen issue:", error instanceof Error ? error.message : error);
    return false;
  }
}

// ─── Assign Copilot ────────────────────────────────────────────────────────

function assignCopilot(issueNumber: number): boolean {
  try {
    console.log(`\n🤖 Assigning Copilot to issue #${issueNumber}...`);
    execSync(`gh issue edit ${issueNumber} --add-assignee "@copilot"`, {
      encoding: "utf-8",
      cwd: process.cwd(),
    });
    console.log(`   ✅ Copilot assigned to issue #${issueNumber}`);
    return true;
  } catch (error) {
    console.error("❌ Failed to assign Copilot:", error instanceof Error ? error.message : error);
    return false;
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const shouldReopen = args.includes("--reopen");
  const shouldAssignCopilot = args.includes("--assign-copilot");

  // Parse --issue argument
  const issueIndex = args.indexOf("--issue");
  if (issueIndex === -1 || !args[issueIndex + 1]) {
    console.error("Usage: npx tsx scripts/issue-enricher.ts --issue <number> [--dry-run] [--reopen] [--assign-copilot]");
    process.exit(1);
  }
  const issueNumber = parseInt(args[issueIndex + 1], 10);

  console.log("═".repeat(80));
  console.log("🔍 Issue Enricher");
  console.log("═".repeat(80));

  // Reopen issue if requested
  if (shouldReopen) {
    reopenIssue(issueNumber);
  }

  const issue = fetchIssue(issueNumber);
  if (!issue) {
    process.exit(1);
  }

  console.log(`   Issue: #${issue.number}`);
  console.log(`   Title: ${issue.title}`);
  console.log(`   Author: ${issue.author}`);
  console.log(`   Labels: ${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}`);

  // Ensure standard labels exist before Claude tries to apply them
  if (!dryRun) {
    console.log("\n🏷️  Ensuring label taxonomy exists...");
    ensureLabelsExist();
  }

  await analyzeIssue(issue, dryRun);

  // Assign Copilot if requested (after analysis)
  if (shouldAssignCopilot && !dryRun) {
    assignCopilot(issueNumber);
  } else if (shouldAssignCopilot && dryRun) {
    console.log(`\n   [DRY RUN] Would assign Copilot to issue #${issueNumber}`);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

