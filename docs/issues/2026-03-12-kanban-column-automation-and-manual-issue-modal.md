---
title: "Kanban column automation does not start agent sessions and manual issue modal crashes on open"
date: "2026-03-12"
status: resolved
severity: high
area: "kanban"
tags: [kanban, automation, tiptap, acp, ui]
reported_by: "Codex"
related_issues: ["docs/issues/2026-03-09-issue-100-implementation-analysis.md"]
---

# Kanban column automation does not start agent sessions and manual issue modal crashes on open

## What Happened

While validating the local Kanban workflow, two separate failures appeared:

1. Opening the `Manual issue` modal crashed the page with a TipTap SSR runtime error before any issue could be created.
2. After enabling column automation on the `Todo` column and moving a card into it, no ACP session was created and no visible automation state appeared in the UI.

The `Dev` column auto-start path still worked when the task was explicitly assigned a provider and moved into `dev`, which shows the failure is specific to column automation rather than all task-triggered session creation.

## Expected Behavior

- Opening `Manual issue` should render the editor normally and allow issue creation.
- Moving a card into an automation-enabled column should start the configured agent session, persist the session ID on the task, and surface that state in the UI.

## Reproduction Context

- Environment: web
- Trigger: validating the Kanban end-to-end workflow on local Next.js dev server (`http://127.0.0.1:3000`)

Steps observed:

1. Open a workspace Kanban page.
2. Click `Manual`.
3. Observe TipTap SSR runtime error instead of the issue form.
4. After fixing the modal locally, configure `Todo` column automation.
5. Create a card and move it into `Todo`.
6. Observe the card moves, but no session starts and no failure feedback is shown.

## Why This Might Happen

- The TipTap editor in the modal may be initializing with SSR-sensitive defaults, unlike the main chat/editor components.
- The workflow orchestrator may be listening for column transitions but not be wired with a session creation callback, so automation state is tracked without actually launching an agent session.
- The UI may assume automation is asynchronous but does not render pending or failed automation feedback when no session is produced.

## Relevant Files

- `src/app/workspace/[workspaceId]/kanban-create-modal.tsx`
- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx`
- `src/app/api/tasks/[taskId]/route.ts`
- `src/core/kanban/workflow-orchestrator-singleton.ts`
- `src/core/kanban/workflow-orchestrator.ts`
- `src/core/kanban/agent-trigger.ts`

## Observations

- TipTap error message: `Tiptap Error: SSR has been detected, please set immediatelyRender explicitly to false to avoid hydration mismatches.`
- `PATCH /api/tasks/[taskId]` into `todo` succeeded and updated `columnId`, but did not return `triggerSessionId`.
- `PATCH /api/tasks/[taskId]` into `dev` with `assignedProvider` and `assignedRole` did return `triggerSessionId` and `worktreeId`.
- Screenshot evidence is available in `dogfood-output/2026-03-12/screenshots/kanban-drag-result.png` and related captures from the same folder.

## References

- `dogfood-output/2026-03-12/screenshots/kanban-drag-result.png`
- `dogfood-output/2026-03-12/screenshots/kanban-modal-closed.png`

## Resolution Notes

- Re-verified on March 12, 2026 against the current local worktree and running app.
- `npm run test:run -- src/core/kanban/__tests__/todo-column-automation.test.ts` passes.
- `npx playwright test e2e/kanban-column-automation.spec.ts` passes in both `chromium` and `chromium-headed`.
- Current behavior: creating a manual issue succeeds, moving the card into an automation-enabled `todo` column creates an ACP session, persists `triggerSessionId`, and exposes the session in the Kanban UI.
