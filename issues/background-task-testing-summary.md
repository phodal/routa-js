# Background Task System - Testing & Implementation Summary

## 概述

本文档记录了 Routa.js 的 BackgroundTask 系统的完整实现、测试流程和关键发现。

## 系统架构

### 核心组件

1. **BackgroundTask** - 持久化的异步任务模型
   - 状态：`PENDING` → `RUNNING` → `COMPLETED/FAILED`
   - 触发源：`webhook` 或 `polling`
   - 关联：`agentId` (specialist), `resultSessionId` (ACP session)

2. **BackgroundTaskWorker** - 任务调度器
   - 定时轮询 PENDING 任务（每分钟通过 cron）
   - 并发控制：`MAX_CONCURRENT_TASKS = 2`
   - 三种恢复策略：
     - Strategy 1: 检查 ACP session 完成状态
     - Strategy 2: 从数据库恢复 RUNNING 任务（HMR 恢复）
     - Strategy 3: 检测孤儿任务（RUNNING 但无 session）

3. **GitHub Polling Adapter** - 轮询 GitHub Events API
   - 替代 webhook 用于本地开发
   - 使用 `lastEventIds` 去重
   - 转换 GitHub Events 为 webhook payload 格式

4. **Specialist** - Agent 配置文件
   - 格式：`.md` 文件（YAML frontmatter + Markdown）
   - 位置：`resources/specialists/*.md`
   - 示例：`issue-enricher.md`, `pr-reviewer.md`

### 进度追踪字段

```typescript
interface BackgroundTask {
  // ... 基础字段
  
  // 进度追踪（新增）
  lastActivity?: Date;          // 最近活动时间
  currentActivity?: string;     // 当前活动描述
  toolCallCount?: number;       // 工具调用次数
  inputTokens?: number;         // 输入 token 数
  outputTokens?: number;        // 输出 token 数
}
```

## 测试流程

### 1. 准备工作

```bash
# 启动开发服务器
pnpm run dev

# 确保数据库 schema 最新
pnpm run db:push
```

### 2. 创建测试 Issue

```bash
# 在测试仓库创建 issue
cd /path/to/test-repo
gh issue create \
  --title "测试标题" \
  --body "测试内容" \
  --label "enricher"  # 可选：触发特定 specialist
```

### 3. 触发轮询检查

```bash
# 手动触发轮询
curl -X POST "http://localhost:3000/api/polling/check" \
  -H "Content-Type: application/json"

# 响应示例
{
  "ok": true,
  "checkedAt": "2026-03-01T15:32:36.956Z",
  "summary": {
    "reposChecked": 3,
    "totalEventsFound": 78,
    "totalEventsProcessed": 26,
    "totalEventsSkipped": 49
  }
}
```

### 4. 检查任务状态

```bash
# 查看任务统计
curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
  jq '{
    total: (.tasks | length),
    pending: ([.tasks[] | select(.status == "PENDING")] | length),
    running: ([.tasks[] | select(.status == "RUNNING")] | length),
    completed: ([.tasks[] | select(.status == "COMPLETED")] | length),
    failed: ([.tasks[] | select(.status == "FAILED")] | length)
  }'

# 查看运行中任务的进度
curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
  jq '[.tasks[] | select(.status == "RUNNING")] | .[] | {
    id: .id[0:12],
    title: .title[0:50],
    toolCallCount,
    currentActivity,
    lastActivity
  }'

# 查看特定仓库的任务
curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
  jq '[.tasks[] | select(.title | contains("data-mesh-spike"))] | 
      sort_by(.createdAt) | reverse | .[0:5]'
```

### 5. 手动触发任务处理

```bash
# 触发 worker 处理 PENDING 任务
curl -X POST "http://localhost:3000/api/background-tasks/process" \
  -H "Content-Type: application/json"

# 响应
{"ok": true, "dispatched": true}
```

## 关键 API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/polling/check` | POST | 手动触发轮询检查 |
| `/api/polling/check` | GET | 查看轮询状态 |
| `/api/background-tasks` | GET | 查询任务列表 |
| `/api/background-tasks/process` | POST | 手动触发任务处理 |
| `/api/schedules/tick` | POST | 触发定时任务（自动调用） |

## 已解决的问题

### 问题 1: 任务卡在 RUNNING 状态（HMR 导致）

**根因：**
- `checkCompletions()` 依赖内存 Map `sessionToTask`
- Next.js HMR 重置内存状态
- 任务无法被标记为完成

**解决方案：**
- 添加 `listRunning()` 方法到 BackgroundTaskStore
- `checkCompletions()` 同时查询数据库和内存 Map
- 数据库查询作为 HMR 后的恢复机制

**相关 Commit:** `13cc317`

### 问题 2: 孤儿任务检测

**根因：**
- `dispatchTask()` 乐观更新状态为 RUNNING
- 如果 `createAndSendPrompt()` 失败，任务卡在 RUNNING 但无 `resultSessionId`
- 这些任务既不被 `listRunning()` 计数（需要 sessionId），也不被 `listPending()` 计数（需要 PENDING 状态）

**解决方案：**
- 添加 `listOrphaned(thresholdMinutes)` 方法
- 检测条件：`status = RUNNING AND resultSessionId IS NULL AND startedAt > threshold`
- `checkCompletions()` Strategy 3 标记孤儿任务为 FAILED

**相关 Commit:** `034a946`

### 问题 3: 数据库 Schema 不匹配

**现象：**
- 新增字段（`lastActivity`, `currentActivity`, `toolCallCount` 等）在 Neon Postgres 中不存在
- 导致 SQL 错误

**解决方案：**
```bash
pnpm run db:push
```

## 实现的功能

### 1. 进度追踪

**实现位置：** `src/core/acp/http-session-store.ts`

```typescript
// 监听 ACP session 通知
pushNotification(sessionId: string, notification: NormalizedSessionUpdate) {
  // ... 推送到 SSE

  // 更新关联的 BackgroundTask
  const task = this.sessionToTask.get(sessionId);
  if (task) {
    if (notification.type === 'tool_call') {
      task.toolCallCount = (task.toolCallCount || 0) + 1;
      task.currentActivity = `Running: ${notification.toolName}`;
    } else if (notification.type === 'tool_call_update' && notification.status === 'completed') {
      task.currentActivity = `Completed: ${notification.toolName}`;
    }
    task.lastActivity = new Date();

    // 持久化到数据库
    await system.backgroundTaskStore.update(task.id, {
      lastActivity: task.lastActivity,
      currentActivity: task.currentActivity,
      toolCallCount: task.toolCallCount,
    });
  }
}
```

**效果：**
- 实时更新任务进度
- 用户可以看到 agent 正在做什么
- 便于判断任务是否真的在运行

### 2. 并发控制

**实现位置：** `src/core/background-worker/index.ts`

```typescript
const MAX_CONCURRENT_TASKS = 2;

async dispatchPending(): Promise<void> {
  const system = getRoutaSystem();

  // 检查当前运行中的任务数
  const running = await system.backgroundTaskStore.listRunning();
  if (running.length >= MAX_CONCURRENT_TASKS) {
    return; // 已达到并发上限
  }

  // 只 dispatch 允许的数量
  const slotsAvailable = MAX_CONCURRENT_TASKS - running.length;
  const pending = await system.backgroundTaskStore.listPending();

  for (const task of pending.slice(0, slotsAvailable)) {
    await this.dispatchTask(task);
  }
}
```

**效果：**
- 最多同时运行 2 个任务
- 避免 LLM API 资源竞争
- 其他任务在队列中等待

**相关 Commit:** `844ccb3`

## Specialist 配置示例

### Issue Enricher

**文件：** `resources/specialists/issue-enricher.md`

```yaml
---
id: "issue-enricher"
name: "Issue Enricher"
description: "Transforms rough requirements into well-structured GitHub issues"
role: "DEVELOPER"
model_tier: "smart"
---

## Issue Enricher

You transform rough requirements into well-structured GitHub issues by:
1. Analyzing the codebase context
2. Proposing 2-3 solution approaches with trade-offs
3. Recommending libraries/packages
4. Estimating effort for each approach

Use `gh issue comment` to add your analysis to the issue.
```

### PR Reviewer

**文件：** `resources/specialists/pr-reviewer.md`

- 自动 review PR 代码
- 检查代码质量、测试覆盖率
- 提供改进建议

## 完整测试案例

### 测试场景 1: Polling + Issue Enricher

**目标：** 验证轮询能检测到新 issue 并自动触发 enricher specialist

**步骤：**

1. **配置轮询**（已在 `.env.local` 配置）
   ```env
   GITHUB_POLLING_REPOS=phodal/data-mesh-spike,phodal/routa
   GITHUB_POLLING_INTERVAL_MINUTES=5
   ```

2. **创建测试 issue**
   ```bash
   cd /path/to/data-mesh-spike
   gh issue create \
     --title "测试：需要添加一个简单的缓存层" \
     --body "想在 API 调用的时候加个缓存，不知道该怎么做，帮我分析一下有哪些方案。"
   ```

3. **触发轮询**
   ```bash
   curl -X POST "http://localhost:3000/api/polling/check"
   ```

4. **验证任务创建**
   ```bash
   # 查看是否创建了 BackgroundTask
   curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
     jq '[.tasks[] | select(.title | contains("缓存层"))]'
   ```

5. **观察任务执行**
   ```bash
   # 查看进度
   curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
     jq '[.tasks[] | select(.status == "RUNNING")] | .[] | {
       title: .title[0:50],
       toolCallCount,
       currentActivity
     }'
   ```

6. **验证结果**
   - 检查 GitHub issue 是否有新评论
   - 评论应包含：方案分析、库推荐、工作量估算

**预期结果：**
- ✅ Polling 检测到新 issue
- ✅ 创建 BackgroundTask（agentId: "issue-enricher"）
- ✅ 任务状态：PENDING → RUNNING → COMPLETED
- ✅ 进度字段实时更新（toolCallCount, currentActivity）
- ✅ GitHub issue 收到 enricher 的分析评论

### 测试场景 2: 并发控制验证

**目标：** 验证最多只有 2 个任务同时运行

**步骤：**

1. **批量创建 issues**
   ```bash
   for i in {1..5}; do
     gh issue create \
       --title "测试并发 $i" \
       --body "测试内容 $i" \
       --repo phodal/data-mesh-spike
   done
   ```

2. **触发轮询**
   ```bash
   curl -X POST "http://localhost:3000/api/polling/check"
   ```

3. **立即检查运行状态**
   ```bash
   curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
     jq '{
       pending: ([.tasks[] | select(.status == "PENDING")] | length),
       running: ([.tasks[] | select(.status == "RUNNING")] | length)
     }'
   ```

**预期结果：**
- ✅ `running: 2` （最多 2 个）
- ✅ `pending: 3` （其他在队列中）
- ✅ 当一个任务完成后，自动从队列中取下一个

### 测试场景 3: 孤儿任务恢复

**目标：** 验证孤儿任务能被检测并标记为 FAILED

**模拟步骤：**

1. **手动创建孤儿任务**（仅用于测试）
   ```sql
   -- 在数据库中手动插入一个 RUNNING 但无 session 的任务
   INSERT INTO background_tasks (
     id, workspace_id, status, started_at, result_session_id
   ) VALUES (
     'test-orphan-123', 'default', 'RUNNING',
     NOW() - INTERVAL '10 minutes', NULL
   );
   ```

2. **等待 worker 检查**（每分钟自动运行）
   或手动触发：
   ```bash
   curl -X POST "http://localhost:3000/api/background-tasks/process"
   ```

3. **验证恢复**
   ```bash
   curl -s "http://localhost:3000/api/background-tasks?workspaceId=default" | \
     jq '[.tasks[] | select(.id == "test-orphan-123")]'
   ```

**预期结果：**
- ✅ 任务状态变为 `FAILED`
- ✅ `errorMessage: "Orphaned task: dispatch failed without creating a session"`
- ✅ 服务器日志：`[BGWorker] Task test-orphan-123 marked FAILED (orphaned, no session after 5 min).`

## 监控和调试

### 查看服务器日志

开发服务器会输出详细日志：

```
[PollingCheck] Manual check triggered
[GitHubPolling] Triggered task for issues on phodal/data-mesh-spike
[BGWorker] Task 01693fbe-674a → session 55a49b5a-4a06
[AcpProcess:OpenCode] Notification: session/update (tool_call)
[AcpProcess:OpenCode] Notification: session/update (tool_call_update)
```

### 关键日志标识

- `[PollingCheck]` - 轮询检查
- `[GitHubPolling]` - GitHub 事件处理
- `[BGWorker]` - 任务调度
- `[ACP Route]` - ACP session 创建
- `[AcpProcess:OpenCode]` - Agent 通知

### 常见问题排查

**问题：任务一直 PENDING**
- 检查：`curl -X POST http://localhost:3000/api/background-tasks/process`
- 原因：可能 cron 未启动或并发已满

**问题：任务卡在 RUNNING**
- 检查：`listRunning()` 是否返回该任务
- 检查：`resultSessionId` 是否为 null（孤儿任务）
- 等待：5 分钟后会自动标记为 FAILED

**问题：Polling 未检测到新 issue**
- 检查：`.env.local` 中 `GITHUB_POLLING_REPOS` 配置
- 检查：GitHub token 权限
- 手动触发：`POST /api/polling/check`

## 相关文件清单

### 核心实现

- `src/core/models/background-task.ts` - 任务模型定义
- `src/core/store/background-task-store.ts` - 存储接口
- `src/core/db/pg-background-task-store.ts` - Postgres 实现
- `src/core/db/sqlite-stores.ts` - SQLite 实现
- `src/core/background-worker/index.ts` - 任务调度器
- `src/core/acp/http-session-store.ts` - 进度追踪
- `src/core/polling/github-polling-adapter.ts` - GitHub 轮询

### API 路由

- `src/app/api/background-tasks/route.ts` - 任务查询
- `src/app/api/background-tasks/process/route.ts` - 手动触发
- `src/app/api/polling/check/route.ts` - 轮询触发
- `src/app/api/schedules/tick/route.ts` - Cron 调度

### Specialist 配置

- `resources/specialists/issue-enricher.md`
- `resources/specialists/pr-reviewer.md`
- `resources/specialists/developer.yaml`

### 数据库 Schema

- `src/core/db/schema.ts` - Postgres schema
- `src/core/db/sqlite-schema.ts` - SQLite schema

## 提交历史

- `13cc317` - checkCompletions 依赖内存 Map 导致 HMR 后任务无法标记完成
- `844ccb3` - 进度追踪和并发控制
- `034a946` - 孤儿任务检测

## 下一步改进建议

1. **UI 展示** - 在前端显示任务进度和 currentActivity
2. **重试机制** - FAILED 任务支持手动重试
3. **优先级队列** - 支持任务优先级
4. **通知系统** - 任务完成后发送通知（邮件/Slack）
5. **性能监控** - 记录任务执行时间、token 消耗
6. **测试覆盖** - 添加单元测试和集成测试

## 测试仓库

- `phodal/data-mesh-spike` - 主要测试仓库
- `phodal/routa` - 次要测试仓库
- `phodal/routa-js` - 本项目


