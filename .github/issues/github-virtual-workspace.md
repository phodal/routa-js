# GitHub Virtual Workspace — Zipball-based Repo Browsing

## Problem

Currently, codebases in Routa require a local `repoPath` on disk. The `/api/clone` route
uses `git clone` which:

1. Fails on serverless (Vercel) — read-only filesystem, no `git` binary
2. Is slow for read-only review scenarios (full clone with history)
3. Requires disk space proportional to repo size

The skills catalog already downloads GitHub zips for skill installation, but this pattern
isn't available for general codebase/workspace browsing.

## Proposed Solution

Add a **GitHub Virtual Workspace** capability that downloads a repo's zipball from
`https://api.github.com/repos/{owner}/{repo}/zipball/{ref}` and provides an in-memory
or `/tmp`-backed virtual filesystem for browsing and code review.

### Architecture

```
┌─────────────────────────────────────────────────┐
│  POST /api/github/import                        │
│  { owner, repo, ref? }                          │
│                                                  │
│  1. Download zipball from GitHub API             │
│  2. Extract to /tmp/routa-gh/{owner}--{repo}/    │
│  3. Build file index (VirtualFileTree)           │
│  4. Store index in memory/DB for fast lookup     │
│  5. Return workspace-compatible codebase entry   │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  GET /api/github/tree?owner=X&repo=Y&ref=Z      │
│  → { tree: VirtualFileEntry[] }                  │
│                                                  │
│  GET /api/github/file?owner=X&repo=Y&path=Z      │
│  → { content: string, path: string }             │
│                                                  │
│  GET /api/github/search?owner=X&repo=Y&q=Z       │
│  → { files: FileMatch[] }                        │
└─────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Dual storage strategy**: Extract to `/tmp` on serverless, `.routa/repos/` on desktop.
   Falls back to in-memory `Map<path, Buffer>` if `/tmp` writes fail.

2. **Codebase model extension**: Add optional `sourceType` field (`"local" | "github"`)
   and `sourceUrl` to `Codebase` model. `repoPath` becomes the extracted temp path for
   GitHub sources.

3. **Reuse existing patterns**: Follow the same zip download + AdmZip extraction pattern
   already proven in `skills/catalog/route.ts`.

4. **File index for performance**: Build a `VirtualFileTree` on import so subsequent
   tree/search/read operations don't re-scan the filesystem.

5. **TTL-based cleanup**: GitHub workspace extractions in `/tmp` get a TTL (default 1h).
   A cleanup function runs on access to evict stale entries.

### Changes Required

- `src/core/github/github-workspace.ts` — Core logic: download, extract, index
- `src/app/api/github/import/route.ts` — Import endpoint
- `src/app/api/github/tree/route.ts` — File tree endpoint
- `src/app/api/github/file/route.ts` — File content endpoint
- `src/app/api/github/search/route.ts` — File search endpoint
- `src/core/models/codebase.ts` — Add `sourceType` / `sourceUrl` fields
- Schema migration for `codebases` table (both Pg and SQLite)

### Non-Goals (v1)

- Writing back to GitHub (PRs, commits)
- Branch switching after import (re-import with different ref)
- Incremental updates (always full re-download)
- Private repo support without token (GITHUB_TOKEN env var required)

## Labels

`enhancement`, `serverless`, `github-integration`
