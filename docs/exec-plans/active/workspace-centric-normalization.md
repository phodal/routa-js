# Workspace-Centric Normalization Plan

## Goal

Finish the documentation migration for the historical workspace-centric redesign and use that migration to drive cleanup of the remaining transition logic.

## Why This Plan Exists

The repository already implements most of the workspace-first model, but the durable description of that model was trapped in `.kiro/specs/`. Meanwhile, some runtime paths still behave as if `default` is a normal long-term workspace instead of a bootstrap artifact.

This plan keeps the migration incremental and evidence-driven.

## Scope

In scope:
- canonicalize the workspace-centric redesign in `docs/design-docs/`
- identify remaining `default` fallback behavior
- convert broad historical tasks into bounded cleanup steps

Out of scope:
- rewriting all historical specs
- removing every default-workspace assumption in one PR
- re-documenting already stable product surface that is covered elsewhere

## Current Evidence

- Workspace pages, codebase routes, and workspace switcher UI are implemented.
- Transitional default fallbacks still exist in:
  - `src/app/api/tasks/route.ts`
  - `src/app/api/background-tasks/route.ts`
  - `src/app/api/acp/route.ts`
  - `crates/routa-server/src/lib.rs`
  - `crates/routa-cli/src/commands/prompt.rs`

## Planned Steps

1. Land canonical design doc and provenance links.
2. Enumerate all remaining steady-state `default` workspace fallbacks.
3. Split cleanup into implementation-sized issues or plans by subsystem:
   - Next.js API fallbacks
   - Rust server bootstrap/runtime separation
   - CLI and MCP default-scope assumptions
4. Add or extend regression coverage for explicit workspace requirements where cleanup lands.
5. Retire or downgrade the old `.kiro/specs/workspace-centric-redesign/*` files once the canonical docs cover the necessary architecture and active cleanup paths.

## Exit Criteria

- `docs/design-docs/workspace-centric-redesign.md` is the obvious entry point for this topic.
- Remaining `default` logic is tracked as explicit cleanup work instead of hidden inside legacy specs.
- New contributors no longer need to read `.kiro/specs/workspace-centric-redesign/*` first to understand the current architecture.
