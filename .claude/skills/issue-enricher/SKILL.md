---
name: issue-enricher
description: Transforms rough requirements into well-structured GitHub issues. Use when the user provides a vague idea, feature request, or problem description and wants to create a GitHub issue. Analyzes codebase, explores solution approaches, researches relevant libraries, and generates actionable issues using `gh` CLI.
license: Complete terms in LICENSE.txt
---

## Process

### 1. Understand the Requirement

Extract from user input:
- **Core problem/goal**: What needs to be solved?
- **Mentioned constraints**: Tech stack, performance, compatibility
- **Referenced files/APIs**: `@file.yaml`, existing code paths
- **Related issues**: Links to parent or related issues

### 2. Codebase Analysis

Search the codebase to understand context:
```
- Existing patterns for similar features
- Related modules and their architecture
- Relevant configuration files
- Test patterns used in the project
```

### 3. Solution Exploration

For each potential approach, research:
- **Libraries/Tools**: Search npm, crates.io, PyPI for relevant packages
- **Trade-offs**: Performance, complexity, maintenance burden
- **Integration effort**: How it fits with existing architecture

Generate 2-3 distinct approaches when multiple solutions exist.

### 4. Create GitHub Issue

Use `gh issue create` with structured content:

```bash
gh issue create \
  --repo {owner}/{repo} \
  --title "Brief, action-oriented title" \
  --body "$(cat <<'EOF'
# Problem

[1-2 sentences describing the core problem]

## Context

- Current behavior: ...
- Desired behavior: ...
- Related: #issue-number (if applicable)

## Proposed Approaches

### Approach 1: [Name]

**Libraries**: `package-name` (v1.x) - [brief description]

**Pros**:
- ...

**Cons**:
- ...

**Estimated effort**: Small/Medium/Large

### Approach 2: [Name]

...

## Recommendation

[Which approach to start with and why]

## Out of Scope

- [Explicitly excluded items]

## Labels

`enhancement`, `area:...`
EOF
)"
```

## Issue Quality Checklist

- [ ] Title is specific and action-oriented
- [ ] Problem statement is clear without implementation details
- [ ] Each approach has concrete library/tool recommendations
- [ ] Trade-offs are honest (not just pros)
- [ ] Effort estimates are realistic
- [ ] Out of scope is defined to prevent scope creep
- [ ] Links to related issues/PRs included

## Tips

- **Don't over-specify**: Focus on the problem, not implementation steps
- **Research libraries**: Use web search to find current, maintained options
- **Reference existing code**: Point to patterns already in the codebase
- **Keep it scannable**: Use headers, bullets, and code blocks
- **Label thoughtfully**: Match project's existing label conventions

## Output

After creating the issue:
1. Confirm the issue URL
2. Summarize what was created
3. Note any assumptions made that user should verify

