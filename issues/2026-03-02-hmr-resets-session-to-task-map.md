---
title: "HMR 导致 sessionToTask 内存 Map 丢失，任务卡在 RUNNING"
date: "2026-03-02"
status: resolved
severity: high
area: background-worker
tags: [hmr, memory-state, task-lifecycle]
reported_by: "human"
related_issues:
  - "background-task-testing-summary.md"
---

# HMR 导致 sessionToTask 内存 Map 丢失，任务卡在 RUNNING

## What Happened

开发环境下，BackgroundTask 状态变为 RUNNING 后不再更新为 COMPLETED。
`checkCompletions()` 无法找到对应的 session-task 映射关系，任务永远停留在 RUNNING 状态。

服务器日志中没有错误输出，但也没有 `[BGWorker] Task ... completed` 的日志。

## Expected Behavior

当 ACP session 完成后，`checkCompletions()` 应该检测到并将任务标记为 COMPLETED。

## Reproduction Context

- Environment: web (localhost dev server)
- Trigger: 修改任意 TypeScript 文件触发 Next.js HMR 热重载

在任务 RUNNING 期间，编辑代码文件触发 HMR，之后该任务再也不会被标记完成。

## Why This Might Happen

- `checkCompletions()` 依赖内存中的 `sessionToTask` Map 来关联 session 和 task
- Next.js HMR 会重新加载模块，可能导致内存中的 Map 被重置为空
- 重置后，即使 ACP session 实际已完成，也无法找到对应的 task 来更新状态
- 疑似 Node.js 模块热替换时，单例模式的状态没有被持久化到模块作用域之外

## Relevant Files

- `src/core/background-worker/index.ts`
- `src/core/acp/http-session-store.ts`
- `src/core/store/background-task-store.ts`
- `src/core/db/pg-background-task-store.ts`

## Observations

commit `13cc317` 添加了 `listRunning()` 方法，让 `checkCompletions()` 同时查询数据库作为 HMR 后的恢复机制。

## References

- commit: `13cc317`
