#!/usr/bin/env npx tsx
/**
 * Issue Triage CLI - Triages community-submitted GitHub issues using Claude Code.
 * Adds labels, detects duplicates, and responds in the user's language.
 *
 * Usage:
 *   npx tsx scripts/issue-triage.ts --issue 123 [--dry-run] [--skip-sync]
 */

import { ghExec } from "@/core/utils/safe-exec";
import { findExistingSyncedGitHubIssueFile, syncGitHubIssuesToDirectory } from "@/core/github/github-issue-sync";
import { fetchGitHubIssuesViaGh } from "@/core/github/github-issue-gh";
import { readFileSync, existsSync } from "fs";
import { join, relative } from "path";

const SKILL_PATH = ".claude/skills/issue-triage/SKILL.md";
const SYNCED_ISSUES_DIR = join(process.cwd(), "docs/issues");

interface IssueData { number: number; title: string; body: string; labels: string[]; author: string; }
interface SyncContext { syncedCount: number; currentIssueFile?: string; }

const LABEL_TAXONOMY = {
  type: [
    { name: "bug", color: "d73a4a", description: "Something isn't working" },
    { name: "enhancement", color: "a2eeef", description: "New feature or request" },
    { name: "documentation", color: "0075ca", description: "Improvements or additions to documentation" },
    { name: "question", color: "d876e3", description: "Further information is requested" },
  ],
  area: [
    { name: "area:frontend", color: "fbca04", description: "Related to the frontend/UI" },
    { name: "area:backend", color: "e4e669", description: "Related to the backend server" },
    { name: "area:api", color: "bfd4f2", description: "Related to the API layer" },
  ],
  complexity: [
    { name: "complexity:small", color: "0e8a16", description: "Small scope, straightforward change" },
    { name: "complexity:medium", color: "e4a907", description: "Moderate scope, requires some design work" },
    { name: "complexity:large", color: "b60205", description: "Large scope, significant effort required" },
  ],
  community: [
    { name: "good first issue", color: "7057ff", description: "Good for newcomers" },
    { name: "help wanted", color: "008672", description: "Extra attention is needed" },
    { name: "duplicate", color: "cfd3d7", description: "This issue or pull request already exists" },
  ],
};

function ensureLabelsExist(): void {
  const allLabels = [...LABEL_TAXONOMY.type, ...LABEL_TAXONOMY.area, ...LABEL_TAXONOMY.complexity, ...LABEL_TAXONOMY.community];
  for (const label of allLabels) {
    try {
      ghExec(["label", "create", label.name, "--color", label.color, "--description", label.description, "--force"], { cwd: process.cwd() });
    } catch { /* Non-fatal */ }
  }
}

function fetchIssue(issueNumber: number): IssueData | null {
  try {
    const output = ghExec(["issue", "view", issueNumber.toString(), "--json", "number,title,body,labels,author"], { cwd: process.cwd() });
    const data = JSON.parse(output);
    return { number: data.number, title: data.title, body: data.body || "", labels: data.labels?.map((l: { name: string }) => l.name) || [], author: data.author?.login || "unknown" };
  } catch (error) {
    console.error("❌ Failed to fetch issue:", error instanceof Error ? error.message : error);
    return null;
  }
}

function syncLocalIssueContext(issueNumber: number, dryRun: boolean): SyncContext {
  const syncLimit = process.env.ISSUE_SYNC_LIMIT ? parseInt(process.env.ISSUE_SYNC_LIMIT, 10) : undefined;
  try {
    console.log(`\n📚 Syncing GitHub issues into local docs/issues/...`);
    const issues = fetchGitHubIssuesViaGh({ state: "all", limit: syncLimit });
    const results = syncGitHubIssuesToDirectory(SYNCED_ISSUES_DIR, issues, { dryRun });
    const currentIssueResult = results.find((result) => result.issueNumber === issueNumber);
    const existingCurrentFile = findExistingSyncedGitHubIssueFile(SYNCED_ISSUES_DIR, issueNumber);
    const currentIssueFile = currentIssueResult?.relativePath ?? (existingCurrentFile ? relative(process.cwd(), existingCurrentFile) : undefined);
    console.log(`   Synced ${results.length} GitHub issues`);
    return { syncedCount: results.length, currentIssueFile };
  } catch (error) {
    console.log(`   ⚠️ Local issue sync skipped: ${error instanceof Error ? error.message : error}`);
    const existingCurrentFile = findExistingSyncedGitHubIssueFile(SYNCED_ISSUES_DIR, issueNumber);
    return { syncedCount: 0, currentIssueFile: existingCurrentFile ? relative(process.cwd(), existingCurrentFile) : undefined };
  }
}

function buildTriagePrompt(issue: IssueData, dryRun: boolean, syncContext: SyncContext): string {
  const typeLabels = LABEL_TAXONOMY.type.map((l) => `\`${l.name}\``).join(", ");
  const areaLabels = LABEL_TAXONOMY.area.map((l) => `\`${l.name}\``).join(", ");
  const complexityLabels = LABEL_TAXONOMY.complexity.map((l) => `\`${l.name}\``).join(", ");
  const communityLabels = LABEL_TAXONOMY.community.map((l) => `\`${l.name}\``).join(", ");
  const localIssueContext = syncContext.currentIssueFile
    ? `- Current issue mirror: \`${syncContext.currentIssueFile}\`\n- Synced GitHub issue mirrors available under \`docs/issues/\` (${syncContext.syncedCount} files)`
    : `- Synced GitHub issue mirrors available under \`docs/issues/\` (${syncContext.syncedCount} files)`;

  return `Triage community GitHub issue #${issue.number} and provide a helpful response.

## Issue Information
- **Title**: ${issue.title}
- **Author**: ${issue.author}
- **Body**: ${issue.body.trim() || "(empty)"}
- **Current Labels**: ${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}

## Local Issue Context
${localIssueContext}

## CRITICAL: Language Detection
Detect the language of the issue title and body. You MUST respond in the SAME language as the user:
- If the issue is in Chinese (中文), respond entirely in Chinese
- If the issue is in Japanese (日本語), respond entirely in Japanese
- If the issue is in English or unclear, respond in English

## Instructions

### 1. Search for Duplicates
Search \`docs/issues/\` and use \`gh issue list\` to find similar issues. If duplicates found, link to them and add \`duplicate\` label if appropriate.

### 2. Classify and Respond (in user's language!)
- **Bug Reports**: Thank them, provide brief analysis, suggest debugging steps
- **Feature Requests**: Thank them, analyze fit with architecture, **ask if they want to submit a PR**
- **Questions**: Provide helpful answer or point to documentation

### 3. Apply Labels
${dryRun ? "Output the labels you would apply:" : `Apply labels using: gh issue edit ${issue.number} --add-label "label1,label2"`}
- **Type** (ONE): ${typeLabels}
- **Area** (ONE+): ${areaLabels}
- **Complexity** (ONE): ${complexityLabels}
- **Community**: ${communityLabels}

### 4. Add Comment
${dryRun ? "Output the comment you would add." : `Add comment: gh issue comment ${issue.number} --body "YOUR_RESPONSE"`}

## Rules
- Do NOT close/assign/edit the issue title or body
- Be friendly and welcoming
- Always thank the user`;
}

async function triageIssue(issue: IssueData, dryRun: boolean, syncContext: SyncContext): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN;
  if (!apiKey && !dryRun) {
    console.error("❌ No ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN set");
    process.exit(1);
  }

  console.log(`\n🏷️ Triaging issue #${issue.number}: ${issue.title}\n`);
  const skillContent = existsSync(SKILL_PATH) ? readFileSync(SKILL_PATH, "utf-8") : "";
  const prompt = buildTriagePrompt(issue, dryRun, syncContext);

  if (dryRun) {
    console.log("   [DRY RUN] Would triage with prompt:\n");
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
        maxTurns: 20,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        pathToClaudeCodeExecutable: cliPath,
        settingSources: ["project"],
        allowedTools: ["Read", "Bash", "Glob", "Grep"],
        systemPrompt: skillContent ? { type: "preset", preset: "claude_code", append: skillContent } : undefined,
      },
    });

    for await (const msg of stream) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") process.stdout.write(block.text);
        }
      } else if (msg.type === "result" && msg.subtype === "success" && msg.result) {
        console.log("\n\n" + msg.result);
      }
    }

    console.log("\n" + "─".repeat(80));
    console.log("\n✅ Triage complete\n");
  } catch (error) {
    console.error("❌ Triage failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const shouldSkipSync = args.includes("--skip-sync");

  const issueIndex = args.indexOf("--issue");
  if (issueIndex === -1 || !args[issueIndex + 1]) {
    console.error("Usage: npx tsx scripts/issue-triage.ts --issue <number> [--dry-run] [--skip-sync]");
    process.exit(1);
  }
  const issueNumber = parseInt(args[issueIndex + 1], 10);

  console.log("═".repeat(80));
  console.log("🏷️ Issue Triage (Community Issues)");
  console.log("═".repeat(80));

  const issue = fetchIssue(issueNumber);
  if (!issue) process.exit(1);

  console.log(`   Issue: #${issue.number}`);
  console.log(`   Title: ${issue.title}`);
  console.log(`   Author: ${issue.author}`);
  console.log(`   Labels: ${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}`);

  if (!dryRun) {
    console.log("\n🏷️  Ensuring label taxonomy exists...");
    ensureLabelsExist();
  }

  const syncContext = shouldSkipSync
    ? { syncedCount: 0, currentIssueFile: (() => { const f = findExistingSyncedGitHubIssueFile(SYNCED_ISSUES_DIR, issueNumber); return f ? relative(process.cwd(), f) : undefined; })() }
    : syncLocalIssueContext(issueNumber, dryRun);

  await triageIssue(issue, dryRun, syncContext);
}

main().catch((error) => { console.error("Fatal error:", error); process.exit(1); });

