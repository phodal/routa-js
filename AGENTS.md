# Routa.js Architecture Guide

Building an agent is not trivial. During API calls or web interactions, unexpected issues often occur.
Keep structured issue files in `issues/` to document errors, observations, and troubleshooting notes.

## Issue Management

Local issues live in `issues/` as Markdown files with YAML front-matter. They serve as
context handoff between agents (and humans) — focus on **WHAT** and **WHY**, not HOW to resolve.

### File Naming

```
issues/YYYY-MM-DD-short-description.md
```

Examples:
- `issues/2026-03-02-background-task-stuck-running.md`
- `issues/2026-03-02-polling-misses-new-events.md`

### Format

Use `issues/_template.md` as the base. Key rules:

- **front-matter** is required: `title`, `date`, `status`, `severity`, `area`, `reported_by`
- **What Happened**: objective facts only — error messages, observed behavior, deviation from expected
- **Why This Might Happen**: possible causes, use hedging language ("可能", "疑似"), never prescribe solutions
- **Relevant Files**: list file paths that a reader should look at, no need to explain why
- **Do NOT include solutions or fix instructions** — the person picking this up should form their own judgment with the context provided

### Status Lifecycle

`open` → `investigating` → `resolved` / `wontfix`

### When to Create an Issue

- Encountered an unexpected error during a task
- Observed behavior that deviates from the API contract or expected flow
- Found a potential bug but it's not blocking your current work
- Need to hand off an investigation to another agent or human

## Project Overview

**Routa.js** is a multi-agent coordination platform with a **dual-backend architecture**:
- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop application with embedded server and SQLite
- `crates/routa-server` — the same logic of Next.js backend, but implemented in Rust

Both backends implement **identical REST APIs** for seamless frontend compatibility.

## Testing

- Use playwright tool (mcp) to test the web UI by youself if possible
- Use playwright testing e2e
- Test Tauri UI with `npm run tauri dev`, then use playwright to test the UI too.

## Commit

- Follow the Baby-Step Commit principle — keep commits small, but not excessively granular.
- Always include the related GitHub issue ID when applicable.
- Make sure tests pass before pushing.
- Append a co-author line in the following format: (YourName, like Copilot,Augment,Claude, etc.) <YourEmail, like, <claude@anthropic.com>, <auggie@augmentcode.com>)
  for example:
  ```
  Co-authored-by: GitHub Copilot Agent <198982749+copilot@users.noreply.github.com>
  Co-authored-by: Kiro <kiro@assistant.ai>
  ```
