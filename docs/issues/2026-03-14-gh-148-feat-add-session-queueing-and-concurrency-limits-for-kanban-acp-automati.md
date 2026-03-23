---
title: "[GitHub #148] feat: Add session queueing and concurrency limits for Kanban ACP automation"
date: "2026-03-14"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-148", "feature", "agent", "area-backend", "area-database", "complexity-medium"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/148"]
github_issue: 148
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/148"
---

# [GitHub #148] feat: Add session queueing and concurrency limits for Kanban ACP automation

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #148
- URL: https://github.com/phodal/routa/issues/148
- State: closed
- Author: phodal
- Created At: 2026-03-14T00:38:11Z
- Updated At: 2026-03-14T00:39:52Z

## Labels

- `feature`
- `Agent`
- `area:backend`
- `area:database`
- `complexity:medium`

## Original GitHub Body

Agent: OpenAI Codex

Kanban automation can currently start ACP coding sessions immediately without any board-level concurrency control. When multiple cards are created or auto-advanced close together, Routa may attempt to launch more ACP sessions than the configured provider capacity can handle.

Expected behavior:
- Kanban exposes a configurable queueing mechanism and session concurrency limit
- Only a bounded number of ACP sessions run at once
- Additional cards remain queued and start later
- The board can show queued/running state for cards

Local issue: docs/issues/2026-03-14-kanban-session-concurrency-queue.md
