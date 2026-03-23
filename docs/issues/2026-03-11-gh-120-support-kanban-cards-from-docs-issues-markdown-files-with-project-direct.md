---
title: "[GitHub #120] Support Kanban cards from docs/issues markdown files with project directory configuration"
date: "2026-03-11"
status: resolved
severity: medium
area: "frontend"
tags: ["github", "github-sync", "gh-120", "enhancement", "area-frontend", "complexity-medium"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/120"]
github_issue: 120
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/120"
---

# [GitHub #120] Support Kanban cards from docs/issues markdown files with project directory configuration

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #120
- URL: https://github.com/phodal/routa/issues/120
- State: closed
- Author: phodal
- Created At: 2026-03-11T12:46:56Z
- Updated At: 2026-03-11T12:48:56Z

## Labels

- `enhancement`
- `area:frontend`
- `complexity:medium`

## Original GitHub Body

# Problem

Currently, Routa has two separate systems:
1. **Kanban boards** - Task cards stored in database (Postgres/SQLite) with Task model
2. **docs/issues/** - Markdown files for issue tracking with frontmatter metadata

These systems are not integrated. Users cannot:
- Automatically create Kanban cards from docs/issues markdown files
- Sync changes between markdown files and Kanban cards
- Configure which directories should be monitored for Kanban integration

## Context

### Current State

**Kanban System** (`src/core/models/kanban.ts`, `src/core/tools/kanban-tools.ts`):
- Cards are Tasks with `boardId` and `columnId`
- Supports multi-board, multi-column workflows
- Column automation with transition events
- Managed via MCP tools (`create_card`, `move_card`, `update_card`, etc.)

**docs/issues System** (`docs/issues/_template.md`):
- Markdown files with YAML frontmatter
- Fields: `title`, `date`, `status`, `severity`, `area`, `tags`, `reported_by`, `related_issues`
- Structured sections: What Happened, Expected Behavior, Reproduction Context, etc.
- Managed by agents and humans

**Project Storage** (`src/core/storage/folder-slug.ts`):
- Local projects store data at `~/.routa/projects/{folder-slug}/`
- Sessions, traces stored per project
- No per-project Kanban configuration

### Relevant Files

- `src/core/models/kanban.ts` - Kanban board and column models
- `src/core/tools/kanban-tools.ts` - Kanban MCP tools implementation
- `docs/issues/_template.md` - Issue file template
- `src/core/storage/folder-slug.ts` - Project storage path handling
- `src/app/workspace/[workspaceId]/kanban/kanban-tab.tsx` - Kanban UI

## Proposed Approaches

### Approach 1: File-Based Kanban Card Synchronization

**Description**: Implement bidirectional sync between markdown files and Kanban cards

**Implementation**:
1. Create `FileBasedKanbanCardProvider` class
2. Scan configured directories (`spec/`, `docs/issues/`, custom paths)
3. Parse frontmatter from markdown files
4. Create/update Kanban cards matching file content
5. On card update, optionally write back to markdown file

**Configuration file** (`.routa/kanban.config.json`):
```json
{
  "monitoredPaths": [
    { "path": "docs/issues", "column": "backlog", "autoCreate": true },
    { "path": "docs/product-specs", "column": "todo", "autoCreate": false },
    { "path": ".routa/specs", "column": "backlog", "autoCreate": true }
  ],
  "syncMode": "bidirectional",  // or "read-only" or "write-only"
  "frontmatterMapping": {
    "title": "title",
    "status": "status",
    "priority": "severity",
    "labels": "tags"
  }
}
```

**Pros**:
- Keeps markdown as source of truth
- Supports git-based issue tracking workflow
- Agents can work with either files or cards
- Backward compatible with existing docs/issues

**Cons**:
- Complex sync logic (conflict resolution)
- Need to handle file deletions, renames
- Performance concerns with large file counts

**Estimated effort**: Large (2-3 weeks)

### Approach 2: Import/Export Tools Only

**Description**: Add MCP tools for manual import/export between files and cards

**Implementation**:
1. Add `import_cards_from_files` tool
2. Add `export_card_to_file` tool
3. Add `sync_card_with_file` tool
4. Minimal configuration (just list of directories)

**New MCP Tools**:
```typescript
import_cards_from_files: tool({
  inputSchema: z.object({
    boardId: z.string(),
    directory: z.string(),  // e.g., "docs/issues"
    columnId: z.string().optional(),
    pattern: z.string().default("**/*.md"),  // glob pattern
  }),
});

export_card_to_file: tool({
  inputSchema: z.object({
    cardId: z.string(),
    filePath: z.string(),
    template: z.string().optional(),  // path to template
  }),
});
```

**Pros**:
- Simpler implementation
- User has full control
- No sync complexity
- Can be implemented incrementally

**Cons**:
- Manual process (not automatic)
- Cards and files can diverge
- More user action required

**Estimated effort**: Medium (1-2 weeks)

### Approach 3: File-Linked Kanban Cards

**Description**: Kanban cards store reference to source file, auto-refresh on access

**Implementation**:
1. Add `sourceFile` field to Task model
2. Cards created from files store file path
3. On card view/load, read latest file content
4. On card update, write to file + update database
5. File watcher for external file changes

**Schema changes**:
```typescript
interface Task {
  // ... existing fields
  sourceFile?: {
    path: string;        // relative to project root
    lastSynced: Date;
    autoSync: boolean;
  }
}
```

**Configuration file** (`.routa/kanban.config.json`):
```json
{
  "fileLinks": [
    {
      "pattern": "docs/issues/**/*.md",
      "boardId": "default",
      "columnId": "backlog",
      "autoSync": true
    }
  ]
}
```

**Pros**:
- Cards always show latest file content
- Simple mental model (card = file view)
- Can handle files not under git
- Good for spec/workflow integration

**Cons**:
- Requires database schema change
- File system access complexity
- Need to handle missing files
- Still has sync complexity

**Estimated effort**: Medium-Large (2 weeks)

## Recommendation

**Start with Approach 2 (Import/Export Tools)** for quick value, then evolve to Approach 1 (File Sync) based on usage patterns.

**Phase 1** (Approach 2 - 1 week):
- Implement `import_cards_from_files` tool
- Implement `export_card_to_file` tool  
- Add basic `.routa/kanban.config.json` support
- Test with docs/issues directory

**Phase 2** (Approach 1 - 1-2 weeks):
- Add bidirectional sync mode
- Implement file watching for auto-sync
- Add conflict resolution
- Add sync status indicators in UI

**Phase 3** (Enhancements):
- Support for `spec/` directory
- Custom frontmatter mappings
- Bulk import/export UI

## Out of Scope

- GitHub Issues integration (separate feature)
- Jira/Linear/Trello external integrations
- Real-time collaborative editing of markdown files
- Version history/undo for card-file sync

## Labels

`enhancement`, `area:kanban`, `complexity:medium`

## References

- Related: Issue #100 (Kanban Agent Multi-task Creation)
- Kanban model: `src/core/models/kanban.ts`
- Kanban tools: `src/core/tools/kanban-tools.ts`
- Issue template: `docs/issues/_template.md`
