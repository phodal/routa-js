---
title: "Kanban session history still lacks durable lane metadata"
date: "2026-03-15"
status: "open"
area: kanban
labels: ["Agent", "Kanban", "UX"]
---

## What Happened

Card detail can show historical session IDs again, but the underlying task data still stores session history as a flat `sessionIds` array.

That means the UI can show chronological runs, but it cannot always reconstruct the exact lane, specialist, or transition reason for each historical session in more complex flows such as:
- cards bouncing between `dev` and `review`
- cards entering `blocked` and later resuming
- manual reruns inside the same lane

## Why It Happened

The current task model tracks:
- `triggerSessionId` for the current active run
- `sessionIds` for the ordered history of associated sessions

It does **not** persist richer per-run metadata such as:
- lane / column at trigger time
- provider / specialist snapshot
- run timestamp independent of ACP session fetch success
- transition cause (entry automation, rerun, manual move, recovery from blocked)

As a result, the UI has to infer lane history from the current board order, which works for the happy path but is not authoritative for non-linear workflows.
