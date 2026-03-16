---
date: 2026-03-16
title: Kanban Workspace Events Refresh Gap
status: open
labels: [bug, kanban, realtime, sse, architecture]
---

# Kanban Workspace Events Refresh Gap

## Problem

On `http://localhost:3000/workspace/default/kanban`, card state does not refresh reliably after an ACP provider or agent calls Kanban tools such as `move_card`.

The current page only refreshes in two ways:

1. Initial page fetch or explicit `onRefresh()`
2. A short burst timer after the Kanban agent input launches a session

This leaves a gap when the card mutation happens later, from a different session, or after the user has closed the detail/session panel. The board can remain stale until a manual reload even though the store has already been updated.

## Why It Happens

- The Kanban UI fetches boards/tasks/sessions via REST and stores them in local React state.
- ACP session updates are scoped to a single session SSE stream, not to workspace-level Kanban state.
- The backend already has an `EventBus`, and Kanban automation emits domain events such as `COLUMN_TRANSITION`, but the browser Kanban page is not subscribed to a workspace-scoped event stream.
- This breaks the architecture described in `README.md` and `docs/ARCHITECTURE.md`, where `Store + EventBus -> UI Update (SSE)` is the preferred real-time path.

## Desired Architecture

Use a workspace-scoped Kanban SSE channel that mirrors the Notes real-time pattern:

1. Backend mutations and Kanban workflow events publish a lightweight Kanban UI event
2. A broadcaster fans that event out to all browser subscribers for the workspace
3. The Kanban page subscribes once at workspace scope and triggers a short refresh burst

This keeps the UI aligned with the existing Routa architecture:

`Store + EventBus -> UI Update (SSE)`

## Proposed Scope

- Add a `KanbanEventBroadcaster` singleton in core
- Add `GET /api/kanban/events?workspaceId=...` SSE endpoint
- Broadcast Kanban workspace change events from:
  - Kanban tool mutations (`create_card`, `move_card`, `update_card`, `delete_card`, board/column mutations)
  - REST task/board mutations that bypass Kanban tools
- Add a client-side Kanban events hook that subscribes once per workspace
- On each event, trigger a bounded refresh burst so async queue/session side effects are also observed

## Non-Goals

- Do not stream full board state over SSE
- Do not bind Kanban page freshness to one ACP session stream
- Do not add background polling as the primary fix

## Expected Outcome

- Kanban page updates shortly after agent tool calls even if the related ACP panel is closed
- Multiple browser tabs in the same workspace stay in sync
- Real-time behavior follows the same architectural style already used by Notes
