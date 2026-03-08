---
name: issue-garbage-collector
description: Two-phase cleanup of duplicate and outdated issue files in docs/issues/. Phase 1 (fast/cheap) uses pattern matching to identify suspects. Phase 2 (deep/expensive) uses claude -p for semantic analysis on suspects only.
when_to_use: When the issues directory becomes cluttered, after resolving multiple issues, or as periodic maintenance (weekly during active development, monthly otherwise).
version: 1.1.0
---

## Two-Phase Strategy (Cost Optimization)

**Problem**: Running deep AI analysis on every issue is expensive.

**Solution**: Two-phase approach:
1. **Phase 1 (Fast/Cheap)** — Pattern matching to identify "suspects"
2. **Phase 2 (Deep/Expensive)** — `claude -p` only on suspects

```
┌─────────────────────────────────────────────────────────┐
│  All Issues (N files)                                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Phase 1: Pattern Scan (You, the smart AI)         │  │
│  │ - Filename similarity                             │  │
│  │ - Same area tag                                   │  │
│  │ - Age-based staleness                             │  │
│  │ → Output: Suspect list (M files, M << N)          │  │
│  └───────────────────────────────────────────────────┘  │
│                         ↓                               │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Phase 2: Deep Analysis (claude -p, only M files)  │  │
│  │ - Content similarity                              │  │
│  │ - Semantic duplicate detection                    │  │
│  │ - Merge recommendations                           │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Phase 1: Pattern Scan (You Do This)

Scan `docs/issues/` and identify suspects using these rules:

### 1.1 Filename Similarity Detection

Look for issues with similar keywords in filename:

```
2026-03-02-drizzle-migrate-neon-connection-failure.md
2026-03-05-drizzle-neon-connection-timeout.md  ← SUSPECT: same keywords
```

**Matching rules**:
| Pattern | Example | Verdict |
|---------|---------|---------|
| Same keywords, different dates | `drizzle-error` vs `drizzle-error` | 🔴 SUSPECT |
| Overlapping keywords (>50%) | `api-timeout` vs `api-connection-timeout` | 🟡 SUSPECT |
| Same area prefix | `db-*` vs `db-*` | 🟡 Check area tag |
| Typo variants | `playwright` vs `playwrite` | 🔴 SUSPECT |

### 1.2 YAML Front-Matter Check

Parse front-matter and flag:

```yaml
# If two issues have:
area: database        # Same area
tags: [drizzle, neon] # Overlapping tags (>1 common)
# → Mark as SUSPECT pair
```

### 1.3 Age-Based Staleness

Flag based on filename date + status:

| Status | Age Threshold | Action |
|--------|---------------|--------|
| `open` | > 30 days | 🟡 STALE |
| `investigating` | > 14 days | 🟡 CHECK if still active |
| `resolved` | any | ✅ Keep (knowledge base) |
| `wontfix` | any | ✅ Keep (context) |

### 1.4 Output: Suspect List

After Phase 1, output a suspect list:

```markdown
## Phase 1 Scan Results

### Duplicate Suspects (need Phase 2)
| File A | File B | Reason |
|--------|--------|--------|
| 2026-03-02-drizzle-migrate.md | 2026-03-05-drizzle-timeout.md | Same keywords: drizzle, connection |
| 2026-03-01-api-error.md | 2026-03-03-api-timeout.md | Same area: api |

### Stale Issues (need review)
| File | Status | Age | Reason |
|------|--------|-----|--------|
| 2026-02-01-old-bug.md | open | 35 days | Exceeds 30-day threshold |

### Clean (no action needed)
- 15 issues with status: resolved (knowledge base)
- 3 issues with status: wontfix (context)
```

---

## Phase 2: Deep Analysis (claude -p)

Only run on suspects from Phase 1. This saves cost.

### 2.1 Duplicate Confirmation

```bash
claude -p "
Compare these two suspect duplicate issues:
- docs/issues/2026-03-02-drizzle-migrate.md
- docs/issues/2026-03-05-drizzle-timeout.md

Check:
1. Are the error messages the same or related?
2. Do they reference the same files in 'Relevant Files'?
3. Is the root cause the same?

Output:
- DUPLICATE: Same issue, recommend merge
- RELATED: Different aspects of same problem, add cross-reference
- DISTINCT: False positive, keep both
"
```

### 2.2 Stale Issue Triage

```bash
claude -p "
Review this stale issue:
- docs/issues/2026-02-01-old-bug.md

Check:
1. Does the referenced code still exist?
2. Has the issue been fixed in recent commits?
3. Is it still relevant to current codebase?

Output:
- CLOSE: Issue resolved, update status
- ESCALATE: Still relevant, create GitHub issue
- ARCHIVE: No longer applicable, move to archive
"
```

### 2.3 Interactive Merge

```bash
claude -p "
Merge these confirmed duplicate issues:
- docs/issues/2026-03-02-drizzle-connection-failure.md (older)
- docs/issues/2026-03-05-drizzle-timeout.md (newer)

Steps:
1. Read both files
2. Identify unique content in older file
3. Propose merged content for newer file
4. Show diff before changes
5. Wait for my approval before executing
"
```

---

## Decision Matrix

| Phase 1 Finding | Phase 2 Action | Final Action |
|-----------------|----------------|--------------|
| Same keywords in filename | Run duplicate check | Merge if confirmed |
| Same area + overlapping tags | Run duplicate check | Cross-reference if related |
| Status: open > 30 days | Run stale triage | Close/Escalate/Archive |
| Status: investigating > 14 days | Ask human | Continue or close |
| Status: resolved | Skip Phase 2 | Keep as knowledge |

---

## Safety Rules

1. **Never delete `_template.md`**
2. **Never delete issues with `status: investigating`** — active work
3. **Always ask for confirmation** before any deletion
4. **Show diff before merge** — let human verify
5. **Commit incrementally** — one logical change per commit
6. **Preserve knowledge** — resolved issues are valuable

---

## Execution Checklist

### Phase 1 (You)
- [ ] List all files in `docs/issues/` (excluding `_template.md`)
- [ ] Extract filename keywords and dates
- [ ] Parse YAML front-matter (status, area, tags)
- [ ] Apply filename similarity rules
- [ ] Apply age-based staleness rules
- [ ] Output suspect list

### Phase 2 (claude -p, only on suspects)
- [ ] For each duplicate suspect pair: run confirmation check
- [ ] For each stale issue: run triage check
- [ ] Collect recommendations

### Cleanup (You, with human approval)
- [ ] Merge confirmed duplicates
- [ ] Update stale issue statuses
- [ ] Generate final report
- [ ] Commit changes

---

## Periodic Maintenance Schedule

| Frequency | Phase 1 | Phase 2 |
|-----------|---------|---------|
| After adding issues | Filename scan only | Skip (too few suspects) |
| Weekly (active dev) | Full scan | On suspects only |
| Monthly (stable) | Full scan + stale check | On all suspects |

---

## Cost Comparison

| Approach | Issues Scanned | Deep Analysis | Relative Cost |
|----------|----------------|---------------|---------------|
| Naive (all deep) | 50 | 50 | 💰💰💰💰💰 |
| Two-phase (this) | 50 | ~5 suspects | 💰 |

**Savings**: ~90% cost reduction by filtering in Phase 1.

