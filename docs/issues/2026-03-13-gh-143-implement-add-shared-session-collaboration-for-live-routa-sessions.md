---
title: "[GitHub #143] Implement: Add shared session collaboration for live Routa sessions"
date: "2026-03-13"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-143", "feature", "area-backend", "area-api", "complexity-large"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/143"]
github_issue: 143
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/143"
---

# [GitHub #143] Implement: Add shared session collaboration for live Routa sessions

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #143
- URL: https://github.com/phodal/routa/issues/143
- State: closed
- Author: phodal
- Created At: 2026-03-13T09:24:52Z
- Updated At: 2026-03-13T10:00:00Z

## Labels

- `feature`
- `area:backend`
- `area:api`
- `complexity:large`

## Original GitHub Body

## Summary

Add a shared-session collaboration capability to Routa so a second user can attach to an active coordination/chat session, observe the live event stream, and optionally participate by sending prompts or comments under host-controlled permissions.

This should bring the collaboration model of tools like `claude-duet` into Routa, but adapted to Routa's architecture: shared **agent/orchestration sessions**, not shared terminal control.

## Problem

Today Routa has strong primitives for:

- ACP session lifecycle
- orchestration across multiple agents
- session updates via broadcast/SSE
- RPC routing
- web/server APIs
- CLI interactive chat

But it does not appear to support a first-class way for another human collaborator to join an active session and participate in real time.

That leaves a gap for workflows like:

- pair-debugging an agent task with a teammate
- letting a reviewer observe an active orchestration session
- temporarily inviting another developer into a live task/session to suggest prompts
- collaborative supervision of long-running agent work

## Design Goal

Introduce a **shared session** abstraction that allows multiple human participants to attach to one active Routa session while preserving a single execution authority and explicit host control.

The key principle is:

> In Routa, we should share a live orchestration/session context, not a raw terminal.

## Non-Goals

For the first iteration, this should **not** try to solve:

- peer-to-peer transport / WebRTC
- terminal mirroring
- collaborative shell access
- fine-grained CRDT-style co-editing
- fully symmetric multi-host control

The first version should be **server-mediated**, built on top of existing RPC/SSE/event infrastructure.

## High-Level Model

### Core idea

A host creates a shareable attachment point for an existing session.

A guest joins that shared session and can:

- observe live updates
- send comments/messages
- optionally send prompts into the same session

The host remains the source of execution authority.

### Why this fits Routa better than copying `claude-duet`

`claude-duet` shares a single Claude Code runtime. Routa is different:

- it already has sessions, orchestrators, agents, and event streams
- it already has server-side APIs and transport abstractions
- its core asset is structured coordination state, not a terminal UI

So the correct adaptation is to share a **Routa session boundary**.

## Proposed Top-Level Architecture

### 1. Shared Session Domain Model

Add a new first-class concept instead of overloading ACP session records.

Suggested entities:

- `SharedSession`
- `SharedSessionParticipant`
- `SharedSessionInvite` or `SharedSessionToken`
- `SharedSessionPermission`
- `SharedSessionApproval`

Suggested fields for `SharedSession`:

- `id`
- `workspace_id`
- `host_user_id` or `host_agent_id`
- `host_session_id`
- `host_transport` or session type metadata
- `mode`
- `approval_required`
- `created_at`
- `expires_at`
- `status`

Suggested participant roles:

- `host`
- `collaborator`
- `viewer`

Suggested session modes:

- `view_only`
- `comment_only`
- `prompt_with_approval`
- `prompt_direct`

### 2. Shared Session Service Layer

Add a service in `routa-core` that owns:

- creation and teardown of shared sessions
- participant join/leave
- permission checks
- invite/token validation
- approval workflow for guest prompts
- fan-out of session updates to participants
- forwarding approved guest prompts into the host session runtime

This layer should sit above raw ACP session management.

### 3. Event Fan-Out

Routa already has event-driven primitives and broadcast/SSE behavior. Reuse that.

The shared-session layer should subscribe to the host session's update stream and republish those updates to all attached collaborators.

Conceptually:

- existing session emits `session/update`
- shared-session service attaches to that stream
- shared-session service forwards updates to all joined human participants

This avoids inventing a second execution pipeline.

### 4. Input Routing

Guest-originated input should not directly mutate the underlying session without passing through policy.

Recommended routing:

- guest sends `message` or `prompt`
- shared-session service validates membership and permissions
- if mode is `comment_only`, persist/broadcast only
- if mode is `prompt_direct`, forward to host session runtime
- if mode is `prompt_with_approval`, enqueue approval request for host
- host approves/rejects
- approved prompt is forwarded to existing ACP/orchestrator pipeline

This keeps a single execution authority while still enabling collaboration.

### 5. Approval Workflow

Approval should be a top-level concept, not an ad hoc flag.

Suggested approval flow:

- guest submits prompt
- service creates `PendingSharedPrompt`
- host receives approval event
- host accepts/rejects
- service broadcasts approval status
- accepted prompt is written into the underlying session

Important property: approval should apply to **guest-originated execution actions**, not to passive viewing or comments.

### 6. CLI and Server Integration

#### CLI

Instead of building a separate collaboration client, extend the existing interactive chat/session UX.

Possible commands:

- `routa chat share <session-id>`
- `routa chat join <token>`
- `routa chat participants <session-id>`
- `routa chat approve <shared-prompt-id>`

This keeps collaboration close to the existing session UX.

#### Server/API

Expose shared-session APIs over the existing server stack.

Possible routes or RPC methods:

- `sharedSessions.create`
- `sharedSessions.get`
- `sharedSessions.join`
- `sharedSessions.leave`
- `sharedSessions.listParticipants`
- `sharedSessions.sendMessage`
- `sharedSessions.sendPrompt`
- `sharedSessions.respondApproval`
- `sharedSessions.subscribe`

For HTTP, a minimal shape could be:

- `POST /api/shared-sessions`
- `POST /api/shared-sessions/:id/join`
- `GET /api/shared-sessions/:id/stream`
- `POST /api/shared-sessions/:id/messages`
- `POST /api/shared-sessions/:id/prompts`
- `POST /api/shared-sessions/:id/approvals/:approvalId`

### 7. Storage Boundaries

Do not mix shared-session metadata directly into low-level ACP process state.

Recommended separation:

- ACP session store remains responsible for runtime session/process bookkeeping
- shared-session store owns collaborator state, invites, approvals, and policy
- conversation store can continue to persist message history if appropriate

This keeps the collaboration model transport-agnostic and avoids coupling it to a single runtime.

## Security Model

The host should remain in control.

### Security requirements

- joining requires an invite/token or authenticated membership
- tokens should be scoped and time-limited
- permissions should be explicit and revocable
- guest prompts must never bypass approval mode when it is enabled
- audit trail should record who sent which prompt and who approved it

### Recommended principle

A shared session should be treated as delegated authority into an existing live execution context.

That means the default should be conservative:

- default mode: `view_only` or `prompt_with_approval`
- host can escalate trust explicitly

## UI/UX Direction

### CLI

The CLI should display:

- participant join/leave notices
- current collaboration mode
- host approval prompts for guest actions
- source attribution for all guest messages/prompts

### Web/Desktop

The same shared-session abstraction should be consumable by the web and desktop frontends.

That means the backend contract should be transport-neutral:

- stream events
- send participant actions
- receive approval events

Do not make the first version CLI-specific in the domain layer.

## Suggested Implementation Phases

### Phase 1: View-only attach

Deliverables:

- create shared session for an existing session
- guest can join with token
- guest receives live event stream
- participant presence is visible

This validates the domain model and event fan-out.

### Phase 2: Guest comments and prompts with approval

Deliverables:

- guest can send comments/messages
- guest can submit prompts
- host can approve/reject
- approved prompts are routed into the host session

This delivers the main collaborative value safely.

### Phase 3: Permission refinement and UI polish

Deliverables:

- richer role/mode system
- revocation and expiration
- session history and audit visibility
- stronger web/desktop integration

### Phase 4: Advanced transport options (optional)

Only after the server-mediated model is proven should we consider:

- direct transport options
- end-to-end encryption overlays
- cross-instance federation

## Recommended Code Areas to Extend

Likely integration points:

- `crates/routa-core/src/state.rs`
- `crates/routa-core/src/rpc/router.rs`
- `crates/routa-core/src/acp/*`
- `crates/routa-core/src/orchestration/*`
- `crates/routa-server/src/api/*`
- `crates/routa-cli/src/commands/chat.rs`
- storage/store modules for new shared-session records

## Open Questions

- Should sharing target only ACP-backed sessions, or any Routa session abstraction?
- Should the host be a user, an agent, or both at the domain level?
- How should shared-session events be persisted in conversation history?
- Should approvals be synchronous only, or support async approval later?
- Should viewers be allowed to branch/fork a shared session into a new independent session?

## Recommendation

Start with a **server-mediated shared session design** layered on top of existing Routa session/event infrastructure.

That is the smallest design that:

- fits Routa's architecture
- avoids unnecessary transport complexity
- preserves host control
- leaves room for CLI, web, and desktop clients to share the same collaboration model

If this direction makes sense, the next issue can break it into concrete tasks for:

1. domain model and storage
2. RPC/API surface
3. event fan-out service
4. CLI integration
5. approval workflow
