---
title: "[GitHub #128] [Feedback] Sync GitHub issues to local docs/issues for duplicate detection by Agent"
date: "2026-03-12"
status: resolved
severity: medium
area: "devops"
tags: ["github", "github-sync", "gh-128", "enhancement", "area-devops", "complexity-small"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/128"]
github_issue: 128
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/128"
---

# [GitHub #128] [Feedback] Sync GitHub issues to local docs/issues for duplicate detection by Agent

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #128
- URL: https://github.com/phodal/routa/issues/128
- State: closed
- Author: phodal
- Created At: 2026-03-12T10:36:51Z
- Updated At: 2026-03-13T14:04:40Z

## Labels

- `enhancement`
- `area:devops`
- `complexity:small`

## Original GitHub Body

# Problem

Currently, the project has two separate issue tracking systems that don't sync with each other:

1. **GitHub Issues** — Hosted on GitHub, managed via the `issue-enricher` workflow and `gh` CLI
2. **Local Issues** — Stored as markdown files in `docs/issues/` with YAML frontmatter

The issue scanner (`scripts/issue-scanner.py`) performs duplicate detection on local issues only, but cannot check against GitHub issues. When creating new issues, the Agent may accidentally create duplicates of existing GitHub issues.

## Context

- Current behavior: The `issue-enricher` workflow analyzes GitHub issues when they are created, but doesn't sync them to `docs/issues/`. The local issue scanner only finds duplicates within `docs/issues/`.
- Desired behavior: GitHub issues should be synced to `docs/issues/` so the Agent can detect duplicates across both systems before creating new issues.

### Relevant Files

- `scripts/issue-scanner.py` — Python scanner that performs duplicate detection on local issues
- `scripts/issue-enricher.ts` — GitHub workflow that analyzes newly created GitHub issues
- `scripts/issue-gc.ts` — Garbage collector that cleans up stale local issues
- `src/core/kanban/github-issues.ts` — TypeScript module for creating/updating GitHub issues
- `docs/issues/_template.md` — Template for local issue markdown files
- `.github/workflows/issue-enricher.yml` — Workflow triggered on issue creation

### Current Architecture

```
┌─────────────────┐     create      ┌──────────────────┐
│  GitHub Issues  │ ◄──────────────► │ issue-enricher  │
│  (gh CLI/API)   │                 │  (workflow)      │
└─────────────────┘                 └──────────────────┘
                                              ↓
                                         analyze & label
                                              ↓
                                         (stops here)

┌─────────────────┐     scan/dedupe ┌──────────────────┐
│ docs/issues/    │ ◄──────────────► │ issue-scanner.py│
│  (local .md)    │                 │                  │
└─────────────────┘                 └──────────────────┘
```

**Gap**: No sync between GitHub issues and `docs/issues/`

## Proposed Approaches

### Approach 1: GitHub Action Sync on Issue Creation

**Implementation**: Modify `.github/workflows/issue-enricher.yml` to sync newly created/updated issues to `docs/issues/` after analysis.

**Flow**:
1. Issue is created on GitHub
2. `issue-enricher` workflow runs analysis
3. After analysis, create a corresponding markdown file in `docs/issues/`
4. Commit the file back to the repo via GitHub API

**Pros**:
- Automatic — no manual intervention required
- Leverages existing `issue-enricher` workflow
- Keeps local issues in sync with GitHub

**Cons**:
- Requires `GITHUB_TOKEN` with write permissions for repo commits
- May create commit noise (each issue creates a commit)
- Race condition risk if multiple issues created simultaneously

**Estimated effort**: Medium

### Approach 2: CLI Sync Command (Manual/Periodic)

**Implementation**: Add a new CLI command `scripts/sync-github-issues.ts` that fetches open GitHub issues and syncs them to `docs/issues/`.

**Flow**:
1. Run `npx tsx scripts/sync-github-issues.ts` manually or via scheduled cron
2. Fetch all open issues via `gh issue list --json number,title,body,labels`
3. For each issue, create/update corresponding markdown file in `docs/issues/`
4. Use GitHub issue number in filename (e.g., `2026-03-12-gh-128-sync-issues.md`)

**Pros**:
- Simple to implement
- No commit noise (can run locally before committing)
- Flexible — can run on-demand or schedule

**Cons**:
- Not automatic — requires manual execution or cron job
- May get stale if not run frequently
- Requires local environment setup

**Estimated effort**: Small

### Approach 3: Dual-Write in issue-enricher

**Implementation**: Extend `scripts/issue-enricher.ts` to create both the GitHub issue comment AND the local markdown file in a single run.

**Flow**:
1. Issue enriched via `issue-enricher.ts`
2. Script creates markdown file in `docs/issues/` with GitHub issue reference
3. File is added to git and committed as part of the workflow

**Pros**:
- Single source of truth for enrichment
- Both GitHub and local issues enriched simultaneously
- Minimal code changes

**Cons**:
- Still requires commit permissions in workflow
- Commits will be made by bot user
- Needs careful handling to avoid duplicate local files

**Estimated effort**: Small

## Recommendation

**Start with Approach 2 (CLI Sync Command)** because:
1. **Lowest risk** — doesn't modify existing workflows
2. **Easy to test** — can run locally before automating
3. **No commit noise** — developer can review before committing
4. **Fast to implement** — leverages existing `gh` CLI

After validating with Approach 2, consider automating via Approach 1 or scheduled GitHub Action.

## Out of Scope

- Syncing from local to GitHub (local issues are for different purpose)
- Bidirectional sync (too complex for initial version)
- Historical issues (only sync open/recent issues)

## Proposed Implementation (Approach 2)

```typescript
// scripts/sync-github-issues.ts
// Fetches open GitHub issues and creates markdown files in docs/issues/

interface SyncOptions {
  state?: 'open' | 'closed' | 'all';
  since?: string; // ISO date string
  limit?: number;
}

async function syncGitHubIssues(options: SyncOptions = {}): Promise<void> {
  // 1. Fetch issues via gh CLI
  const output = execSync(`gh issue list --json number,title,body,labels,state,createdAt,url`);
  
  // 2. For each issue, create/update markdown file
  // Filename format: YYYY-MM-DD-gh-{number}-{slug}.md
  
  // 3. Skip if already exists and unchanged
  
  // 4. Add to related_issues if file already exists locally
}
```

## Labels

`enhancement`, `area:devops`, `complexity:small`
