---
name: issue-triage
description: Triages community-submitted GitHub issues. Adds appropriate labels, detects duplicates, and responds in the user's language. For feature requests, asks if they want to submit a PR. For bugs, provides analysis suggestions.
license: Complete terms in LICENSE.txt
---

## Core Principles

1. **Respond in the user's language** - Detect the language of the issue and reply in the same language
2. **Be welcoming and helpful** - This is often the user's first interaction with the project
3. **Add appropriate labels** - Categorize issues accurately to help maintainers
4. **Detect duplicates** - Search for similar existing issues before responding
5. **Encourage contributions** - For feature requests, invite users to submit PRs

## Process

### 1. Language Detection

Analyze the issue title and body to determine the user's language:
- If written in Chinese, respond in Chinese
- If written in Japanese, respond in Japanese
- If written in English or unclear, respond in English
- Match the user's language exactly

### 2. Duplicate Detection

Search `docs/issues/` and existing GitHub issues for:
- Similar problem descriptions
- Related feature requests
- Previously reported bugs with same symptoms

If duplicates found:
- Link to the existing issue(s)
- Explain the relationship
- Consider if this adds new information

### 3. Issue Classification

Determine the issue type:

**Bug Report**:
- User reports something not working
- Unexpected behavior described
- Error messages or stack traces included

**Feature Request / Enhancement**:
- User wants new functionality
- Improvement suggestions
- "Would be nice if..." patterns

**Question**:
- User asking how to do something
- Seeking clarification on behavior
- Documentation inquiry

### 4. Response Templates

#### For Bug Reports (respond in user's language):

```
感谢您报告这个问题！/ Thank you for reporting this issue!

**初步分析 / Initial Analysis:**
- [Brief analysis of the bug based on codebase search]
- [Relevant files that might be involved]

**建议的调试步骤 / Suggested debugging steps:**
1. [Step 1]
2. [Step 2]

**相关信息 / Related:**
- [Link to similar issues if any]
- [Link to relevant documentation if any]

我们会尽快查看这个问题。/ We'll look into this soon.
```

#### For Feature Requests (respond in user's language):

```
感谢您的建议！/ Thank you for this suggestion!

**分析 / Analysis:**
- [How this fits with current architecture]
- [Potential implementation approach]

**相关 / Related:**
- [Similar existing features]
- [Related issues]

您有兴趣提交 PR 来实现这个功能吗？我们很乐意提供指导！
Would you be interested in submitting a PR for this? We'd be happy to provide guidance!
```

### 5. Label Application

Apply labels from these categories:

**Type** (pick ONE):
- `bug` - Something isn't working
- `enhancement` - New feature or request  
- `documentation` - Documentation improvements
- `question` - Further information requested

**Area** (pick ONE or MORE):
- `area:frontend` - Related to UI
- `area:backend` - Related to server
- `area:api` - Related to API layer

**Complexity** (pick ONE if determinable):
- `complexity:small` - Straightforward change
- `complexity:medium` - Moderate effort
- `complexity:large` - Significant effort

## Output Format

Your response should:
1. Be in the user's language
2. Be friendly and welcoming
3. Include relevant analysis
4. Link to duplicates if found
5. For features: invite PR contribution
6. For bugs: provide debugging suggestions
7. Apply appropriate labels via `gh issue edit`

## Important Notes

- Do NOT close issues - only triage and label
- Do NOT assign issues - leave for maintainers
- Be concise but helpful
- When in doubt, ask clarifying questions
- Always thank the user for their contribution

