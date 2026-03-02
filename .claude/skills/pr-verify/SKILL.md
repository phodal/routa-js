---
name: pr-verify
description: Comprehensive PR verification skill. Analyzes PR body requirements, reviews comments, checks CI status, and performs E2E testing. Use when a PR is ready for final verification before merge.
license: MIT
---

## Verification Phases

### Phase 1: Requirements Analysis

Parse PR body to extract:
- **Acceptance Criteria**: Checkboxes, numbered lists, "should" statements
- **Linked Issues**: `#123`, `fixes #456`, `closes #789`
- **Screenshots/Videos**: Evidence of visual changes
- **Breaking Changes**: Migration notes, deprecation warnings

```bash
# Fetch PR details
gh pr view <PR_NUMBER> --json body,title,labels,linkedIssues
```

### Phase 2: Review Comments Analysis

Fetch and categorize comments:
```bash
# Get all review comments
gh api repos/{owner}/{repo}/pulls/{pr}/reviews
gh api repos/{owner}/{repo}/pulls/{pr}/comments
```

Classify by status:
- **Resolved**: Addressed in subsequent commits
- **Pending**: Still needs attention
- **Blocking**: Marked as REQUEST_CHANGES

### Phase 3: CI/Build Status Check

```bash
# Check all status checks
gh pr checks <PR_NUMBER> --json name,state,conclusion

# Get detailed check run logs if failed
gh api repos/{owner}/{repo}/check-runs/{check_run_id}
```

Required checks must pass:
- Build/compile
- Lint
- Type check
- Unit tests
- Integration tests (if applicable)

### Phase 4: E2E Verification

Start services and run E2E tests:

```bash
# 1. Install dependencies (if needed)
npm install

# 2. Start dev server in background
npm run dev &
DEV_PID=$!

# 3. Wait for server ready
npx wait-on http://localhost:3000 --timeout 60000

# 4. Run E2E tests
npm run test:e2e

# 5. Cleanup
kill $DEV_PID
```

For Tauri apps:
```bash
npm run tauri dev &
# Use Playwright to interact with desktop window
```

### Phase 5: Generate Report

Create verification summary:

```markdown
# PR Verification Report

## Requirements Checklist
- [x] Feature A implemented (evidence: screenshot in PR)
- [x] API endpoint returns correct response
- [ ] ⚠️ Missing: Mobile responsive test

## Review Comments Status
- ✅ 3 resolved
- ⚠️ 1 pending (non-blocking suggestion)
- 🚫 0 blocking

## CI Status
| Check | Status |
|-------|--------|
| build | ✅ Pass |
| lint  | ✅ Pass |
| test  | ✅ Pass |

## E2E Verification
- ✅ Home page loads correctly
- ✅ User flow: login → dashboard works
- ⚠️ Note: Slow response on /api/data (>2s)

## Verdict
🟢 **READY TO MERGE** — All requirements verified
```

## Decision Matrix

| Condition | Action |
|-----------|--------|
| All checks pass + requirements met | Approve and merge |
| Minor issues only | Approve with comments |
| Blocking comments unresolved | Request author action |
| CI failing | Do not proceed, report errors |
| E2E failures | Investigate and report |

## Tips

- **Parallelize**: Run E2E while waiting for CI
- **Cache evidence**: Save screenshots to PR comments
- **Early exit**: Stop on critical failures
- **Retry flaky tests**: Up to 2 retries for known flaky tests
- **Report promptly**: Post findings as PR comment for visibility

