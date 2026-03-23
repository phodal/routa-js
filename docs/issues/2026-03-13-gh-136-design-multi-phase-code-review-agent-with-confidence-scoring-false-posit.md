---
title: "[GitHub #136] Design: Multi-Phase Code Review Agent with Confidence Scoring & False Positive Filtering"
date: "2026-03-13"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-136", "enhancement", "area-backend", "complexity-medium"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/136"]
github_issue: 136
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/136"
---

# [GitHub #136] Design: Multi-Phase Code Review Agent with Confidence Scoring & False Positive Filtering

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #136
- URL: https://github.com/phodal/routa/issues/136
- State: closed
- Author: phodal
- Created At: 2026-03-13T02:39:30Z
- Updated At: 2026-03-13T02:50:24Z

## Labels

- `enhancement`
- `area:backend`
- `complexity:medium`

## Original GitHub Body

## Problem Statement

Our current PR review specialists (`pr-reviewer.md`, `pr-analyzer.md`) provide basic code review capabilities, but lack the structured quality assurance mechanisms needed to produce high-signal, low-noise reviews at scale. In practice, AI code reviews tend to generate too many theoretical or low-confidence findings, which erodes developer trust.

## Context

- **Current behavior:** `pr-reviewer` does a single-pass review with CRITICAL/WARNING/SUGGESTION categories. `pr-analyzer` checks merge readiness. Neither has confidence scoring, false positive filtering, or multi-phase analysis.
- **Desired behavior:** A review system that produces fewer but higher-quality findings, with explicit confidence levels and structured false positive suppression — similar to how Claude Code's `/security-review` operates.
- **Related files:**
  - `resources/specialists/pr-reviewer.md`
  - `resources/specialists/pr-analyzer.md`
  - `resources/specialists/gate.md`
  - `src/core/orchestration/`

## Inspiration: Claude Code's Review Architecture

Claude Code's `/security-review` plugin demonstrates several patterns worth adopting:

1. **Three-Phase Analysis** — Context research → Comparative analysis → Assessment (not a single-pass review)
2. **Confidence Scoring** — Each finding gets a 0-1 confidence score; only >0.8 gets reported
3. **Hard Exclusion Rules** — A curated list of known false positive patterns to auto-suppress
4. **Precedent Rules** — Framework-specific knowledge (e.g., "React is safe against XSS unless using dangerouslySetInnerHTML")
5. **Multi-Agent Verification** — One agent identifies issues, then parallel sub-agents independently verify each finding to filter false positives
6. **Read-Only Tool Restriction** — Review agents cannot modify code, only read

## Proposed Design

### 1. Review Phases (enhance `pr-reviewer.md`)

```
Phase 1: Context Gathering
  - Understand project patterns, conventions, existing abstractions
  - Identify the tech stack and framework-specific rules

Phase 2: Diff Analysis
  - Review changes against project patterns (not just generic best practices)
  - Focus on what's NEW in this PR, not pre-existing issues

Phase 3: Finding Validation
  - For each finding, assess confidence (1-10)
  - Apply exclusion rules and precedents
  - Drop findings below threshold
```

### 2. Confidence Scoring System

Each finding should carry:
- **Confidence** (1-10): How certain is this a real issue?
- **Severity**: CRITICAL / WARNING / SUGGESTION
- **Category**: `logic_error`, `security`, `performance`, `style`, `testing`, etc.

Reporting threshold: only include findings with confidence ≥ 7.

### 3. False Positive Filtering (new: `review-rules.md` or embedded in specialist)

A curated set of exclusion rules, e.g.:
- Don't flag missing error handling in test files
- Don't flag style issues that the project's linter already covers
- Don't flag "missing types" in JavaScript projects that don't use TypeScript
- Framework-specific: React/Angular XSS is handled by default, Next.js API routes have built-in body parsing, etc.
- Don't flag TODO comments as issues (they're intentional)

These rules should be configurable per-project (e.g., via `.routa/review-rules.md`).

### 4. Multi-Agent Verification via GATE

Leverage Routa's existing multi-agent orchestration:

```
ROUTA (coordinator)
  │
  ├─→ CRAFTER-as-Reviewer: Identify findings (broad pass)
  │
  ├─→ GATE (parallel, one per finding): Verify each finding independently
  │     ├─ Finding 1: Is this real? Confidence?
  │     ├─ Finding 2: Is this real? Confidence?
  │     └─ Finding N: Is this real? Confidence?
  │
  └─→ Aggregate: Filter by confidence threshold → Final report
```

This maps naturally to Routa's existing ROUTA → CRAFTER → GATE flow, just applied to the review domain.

### 5. Structured Output Format

```markdown
## Code Review: PR #123

### Findings (3 issues, filtered from 11 candidates)

#### CRITICAL: SQL injection in `src/api/users.ts:42`
- **Confidence:** 9/10
- **Category:** security
- **Description:** User input from `req.query.name` is interpolated directly into SQL query
- **Suggestion:** Use parameterized query: `db.query('SELECT * FROM users WHERE name = $1', [name])`

#### WARNING: Missing error boundary in `src/components/Dashboard.tsx:15`
- **Confidence:** 8/10
- **Category:** reliability
- **Description:** New async data fetching without error boundary; unhandled rejection crashes the component tree
- **Suggestion:** Wrap with `<ErrorBoundary>` or add try/catch in the useEffect

### Filtered Out (not reported)
- 8 findings below confidence threshold (< 7)
- Breakdown: 4 style (covered by ESLint), 2 theoretical perf, 1 test-only, 1 framework-handled
```

### 6. GitHub Actions Integration

Add a `pr-review.yml` workflow:

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - # Run Routa's review agent against the PR
      - # Post findings as PR review comments
```

## Prompt Examples

### Phase 1 Specialist Prompt (Context Gathering)

```markdown
You are a senior code reviewer preparing context for a thorough PR review.

OBJECTIVE:
Gather project context BEFORE reviewing any code changes. Do NOT review code yet.

STEPS:
1. Identify the project's tech stack, frameworks, and key libraries
2. Find the project's linting/formatting config (ESLint, Prettier, Biome, etc.)
3. Look for existing patterns: error handling conventions, naming conventions, test patterns
4. Check for project-specific review rules (`.routa/review-rules.md` if exists)

OUTPUT (structured context for Phase 2):
- Tech stack: [frameworks, languages, key libraries]
- Linter covers: [what the linter already enforces — don't duplicate these in review]
- Project patterns: [error handling, naming, file structure conventions]
- Custom rules: [any project-specific exclusions or focus areas]
```

### Phase 2 Specialist Prompt (Diff Analysis)

```markdown
You are a senior code reviewer analyzing a pull request.

PROJECT CONTEXT (from Phase 1):
${phase1_output}

DIFF:
${pr_diff}

CRITICAL INSTRUCTIONS:
1. ONLY review changes introduced by this PR — ignore pre-existing issues
2. Compare new code against the project's established patterns (from context above)
3. Do NOT flag issues the project's linter already covers
4. For each finding, assign a raw confidence score (1-10)

CATEGORIES TO EXAMINE:
- Logic errors, off-by-one, null/undefined risks
- Security: injection, auth bypass, data exposure (only if concrete)
- Performance: O(n²) in hot paths, missing pagination, unbounded queries
- API contract: breaking changes, missing validation at system boundaries
- Testing: missing coverage for new branches/error paths

OUTPUT: List of raw findings (will be filtered in Phase 3):
For each finding:
- file:line
- category
- severity (CRITICAL/WARNING/SUGGESTION)
- raw_confidence (1-10)
- description
- suggestion
```

### Phase 3 Specialist Prompt (Finding Validation / False Positive Filter)

```markdown
You are a false-positive filter for automated code review findings.

FINDING TO VALIDATE:
- File: ${finding.file}:${finding.line}
- Category: ${finding.category}
- Description: ${finding.description}

RELEVANT SOURCE CODE:
${surrounding_code}

PROJECT CONTEXT:
${phase1_output}

HARD EXCLUSIONS — Automatically reject if:
1. The issue is in a test file and is about missing error handling or input validation
2. The issue is a style/formatting concern covered by the project's linter
3. The issue is about missing TypeScript types in a JavaScript-only project
4. Framework-handled: React/Angular default XSS protection, Next.js built-in body parsing
5. The issue is theoretical with no concrete exploit or failure path
6. The issue is about TODO/FIXME/HACK comments (these are intentional markers)
7. The issue is about missing logging or audit trails
8. The issue is about variable naming preferences (subjective)

PRECEDENTS:
1. React components are safe against XSS unless using dangerouslySetInnerHTML or similar
2. Next.js API routes automatically parse request bodies — don't flag "missing body parsing"
3. Environment variables and CLI flags are trusted values
4. UUIDs are unguessable — don't flag "missing UUID validation"
5. Client-side code doesn't need auth checks — that's the server's job

TASK:
1. Does this finding match any HARD EXCLUSION? If yes → REJECT
2. Is the finding concrete and actionable? Or theoretical/speculative?
3. Assign a validated confidence score (1-10)
4. Verdict: KEEP (confidence ≥ 7) or REJECT (confidence < 7 or matches exclusion)

OUTPUT:
- verdict: KEEP or REJECT
- validated_confidence: 1-10
- reasoning: one sentence explaining why
```

### Orchestration Prompt (ROUTA coordinator)

```markdown
You are coordinating a multi-phase code review for PR #${pr_number}.

WORKFLOW:
1. Delegate Phase 1 (Context Gathering) to a CRAFTER agent
   - Wait for structured project context output
2. Delegate Phase 2 (Diff Analysis) to a CRAFTER agent
   - Pass Phase 1 context + PR diff
   - Collect raw findings list
3. For EACH raw finding, delegate to a GATE agent (run in parallel)
   - Pass the finding + relevant source code + project context
   - Collect verdict (KEEP/REJECT) and validated confidence
4. Aggregate: Keep only findings with verdict=KEEP and confidence ≥ 7
5. Format final review report and post as PR comment

QUALITY RULES:
- Better to miss theoretical issues than flood with false positives
- Each reported finding must be something a senior developer would agree with
- If zero findings survive filtering, report "No significant issues found" (this is a good outcome)
```

## Out of Scope

- Auto-fixing issues (review is read-only)
- Security-specific deep analysis (can be a separate specialist later, following Claude Code's `/security-review` pattern)
- Integration with external SAST/DAST tools

## Open Questions

1. Should the false positive rules live in the specialist prompt, or in a separate configurable file (`.routa/review-rules.md`)?
2. Should the multi-agent verification step be optional (for cost/speed reasons)?
3. How should findings be posted — as a single review comment, or as inline PR comments on specific lines?
