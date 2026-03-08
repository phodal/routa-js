# Routa.js — Multi-agent coordination platform with dual-backend architecture (Next.js + Rust/Axum).

## Project Overview

- **Next.js Backend** (TypeScript) — Web deployment on Vercel with Postgres/SQLite
- **Rust Backend** (Axum) — Desktop app with embedded server and SQLite (`crates/routa-server`)
- Both backends implement **identical REST APIs** for seamless frontend compatibility with `api-contract.yaml`
- Product feature tree can be found in `docs/product-specs/FEATURE_TREE.md`

## Coding Standards

- Limit file size to **1000 lines** as much as possible.
- Unless explicitly asked, do not write additional documentation for your work.
- **Linter**: ESLint 9 flat config (`eslint.config.mjs`) — TypeScript-ESLint + React Hooks + Next.js plugin. Run with `npm run lint`. Rust side uses `cargo clippy`. Fix all warnings before committing; do not disable rules inline without justification.

## Testing & Debugging

- Use **Playwright MCP tool** to test the web UI directly.
- Use **Playwright e2e** tests for automated coverage.
- Test Tauri UI: `npm run tauri dev`, then use Playwright against `http://127.0.0.1:3210/`.
- When changes span many files, do a full manual walkthrough in the browser:
  - Home page → select claude code → enter a requirement → auto-redirect to detail page → trigger ACP session
  - Visit a workspace detail page → click a session → switch to Trace UI to check history
  - Open browser DevTools to inspect network requests
- When debugging frontend bugs, use `console.log` and read output via Playwright.
- After fixing, **always clean up** all debug `console.log` statements.

## After generating or modifying code

After generating or modifying **source code** (not docs, configs, or workflows), agents must run the following checks automatically. All must pass before committing:

1. **Type Check** — `npx tsc --noEmit` (or `cargo check` for Rust)
2. **Lint** — `npm run lint` (or `cargo clippy`)
3. **Unit Tests** — `npm run test` (or `cargo test`)
4. **API Contract** — `npm run api:check`
5. If UI changes are involved, run a **Playwright MCP** smoke test.

> If any step fails, fix and re-validate. Never skip.
>
> **Skip checks** for changes that only touch: `*.md`, `*.yml`, `*.yaml`, `.github/`, `docs/`, or other non-code files.

## Git Discipline

### Commit Without Asking Permission

- Always include a `Co-authored-by:` line in the commit message.
- Ensure tests pass before pushing.

### Baby-Step Commits (Enforced)

- Each commit does **one thing**: one feature, one bug fix, or one refactor.
- No "kitchen sink" commits. If changes span multiple concerns, split into multiple commits.
- Always include the related **GitHub issue ID** when applicable.
- All tests + API contract check must pass before pushing (enforced by pre-push hook).

### Git Worktree Isolation

- When working on multiple features/fixes in parallel, use `git worktree` for physical isolation:
  ```bash
  git worktree add ../routa-feature-xxx feature/xxx
  ```
- Each worktree has its own working directory — no branch-switching pollution.
- Clean up when done: `git worktree remove ../routa-feature-xxx`

### Co-Author Format

- If you want to add `closed issue` in commit message, should view issue against the main branch with `gh issue view <issue-id>` 
- Append a co-author line in the following format: (YourName, like Copilot,Augment,Claude etc.) (Your model name) <YourEmail, like, <claude@anthropic.com>, <auggie@augmentcode.com>)
  for example:

```
Co-authored-by: Kiro AI (Claude Opus 4.6) <kiro@kiro.dev>
Co-authored-by: GitHub Copilot Agent (GPT 5.4) <198982749+copilot@users.noreply.github.com>
Co-authored-by: QoderAI (Qwen 3.5 Max) <qoder_ai@qoder.com>
Co-authored-by: gemini-cli (...) <218195315+gemini-cli@users.noreply.github.com>
```

## AI Collaboration Protocol

When multiple agents collaborate, follow these handoff disciplines:

- **Context Handoff**: Pass context between agents via structured Markdown files in `docs/issues/` — no implicit assumptions.
- **Responsibility Boundaries**: Each agent only modifies files within its assigned scope. Do not touch files another agent is actively working on.
- **Conflict Prevention**: Use Git Worktree to physically isolate each agent's working directory, eliminating merge conflicts at the source.
- **Status Sync**: When a task is completed or blocked, immediately update the corresponding issue file (`status: done` / `status: blocked`) so the next agent or human can pick up.
- **Search First, Act Second**: Before starting work, search `docs/issues/` and existing code to avoid duplicate effort.

## Pull Request

- PR body must include **Playwright screenshots**.
- Attach e2e test screenshots or recordings when available.

## Issue Management — Feedback-Driven Loop

Building agents is complex — failures happen. Use a feedback-driven loop:

### 1. Capture Feedback
- Immediately log failures in `docs/issues/YYYY-MM-DD-short-description.md` (YAML front-matter).
- Document **WHAT** happened and **WHY** — not HOW to fix it.
- These files serve as context handoff between agents and humans.

### 2. Search Before Creating
- Always search `docs/issues/` first — someone may have already documented the same problem.

### 3. Escalate to GitHub
```bash
gh issue create --label "Agent" --body "Agent: YourName\n\n[issue details]"
```
- Link the local issue file in the GitHub issue body.

### 4. Close the Loop
- Resolved? Update the local issue file with resolution notes and close the GitHub issue.

### 5. Garbage Collection
- Periodically run `issue-garbage-collector` skill to clean up duplicates.
- See: `.claude/skills/issue-garbage-collector/SKILL.md`

### 6. Feature Tree
- Run `python3 scripts/feature-tree-generator.py` to view current features (auto-scans routes + API)
- Run with `--save` to update `docs/product-specs/FEATURE_TREE.md`
- Use `claude -p --allowedTools "Edit,Read"` to optimize the generated document
