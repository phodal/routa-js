---
title: "opencode-bridge 缺失 terminal 相关 agent 请求的需求分析"
issue: 73
date: "2026-03-07"
status: open
severity: high
area: acp, docker
tags: [terminal, opencode-bridge, acp-protocol]
reported_by: "QoderAI"
related_issues:
  - https://github.com/phodal/routa/issues/73
---

# opencode-bridge 缺失 terminal 相关 agent 请求

## 需求概述

`docker/opencode-bridge/server.js` 作为 Docker 容器内 opencode agent 与 Routa 主系统之间的 HTTP+SSE 桥接层，当前仅实现了部分 ACP 协议中的 agent-to-client 请求。具体来说，`terminal/create` 虽然已实现，但使用的是 `execFile` 一次性执行模式，不支持长时间运行的终端会话，且缺少 `terminal/output`、`terminal/wait_for_exit`、`terminal/kill`、`terminal/release` 四个配套操作。

这导致当 opencode agent 在 Docker 容器内执行需要长时间运行的 bash 命令时，无法正常获取终端输出、等待命令完成或终止命令，bridge 会对未知请求返回空结果 `{}`，可能引起 agent 行为异常。

### 缺失的请求方法

| 方法 | 用途 | 当前状态 |
|------|------|----------|
| `terminal/create` | 创建终端进程 | 已实现（但为一次性执行模式） |
| `terminal/output` | 获取终端累积输出 | 缺失 |
| `terminal/wait_for_exit` | 等待终端进程退出 | 缺失 |
| `terminal/kill` | 终止终端进程 | 缺失 |
| `terminal/release` | 释放终端资源 | 缺失 |

## 涉及的模块/文件

### 需要修改的文件

- **`docker/opencode-bridge/server.js`** — 核心修改目标。`_handleAgentRequest` 方法（第 302-387 行）需要：
  1. 重构 `terminal/create`：从 `execFile` 一次性执行改为 `spawn` 长期运行模式
  2. 新增终端状态管理（Map 存储运行中的终端）
  3. 新增 `terminal/output`、`terminal/wait_for_exit`、`terminal/kill`、`terminal/release` 四个 case

### 参考实现（主系统中的对应逻辑）

- **`src/core/acp/terminal-manager.ts`** — 主系统的终端管理器，实现了完整的终端生命周期管理（create/output/waitForExit/kill/release），是 bridge 实现的**主要参考模板**。它使用 `spawn` 创建子进程，维护输出缓冲区、退出码和 Promise，并通过 `session/update` 通知推送终端事件。

- **`src/core/acp/acp-process.ts`**（第 538-618 行）— 主系统中 `handleAgentRequest` 的 terminal 分支实现，展示了如何将 agent 的 terminal 请求转发给 `TerminalManager`，并通过 JSON-RPC 返回结果。

### 相关上下文文件

- **`docker/Dockerfile.opencode-agent`** — Docker 镜像定义，了解容器内可用工具链（node:22-bookworm-slim）
- **`src/core/acp/docker/docker-opencode-adapter.ts`** — Routa 主系统侧的 Docker 适配器，通过 HTTP 与 bridge 通信，当前不涉及 terminal 请求中转（terminal 请求由 bridge 在容器内部直接处理）
- **`src/core/acp/docker/process-manager.ts`** — Docker 容器的生命周期管理，包括容器复用机制
- **`src/core/acp/processer.ts`** — `JsonRpcMessage` 和 `NotificationHandler` 类型定义

## 技术方案建议

### 方案：在 bridge 内实现轻量级 TerminalManager

由于 bridge 运行在 Docker 容器内（Node.js 环境），可以直接使用 `child_process.spawn` 实现终端管理，无需依赖主系统的 platform bridge 抽象层。

#### 1. 新增终端状态管理

在 `OpenCodeSession` 类中添加一个 `Map<string, ManagedTerminal>` 用于跟踪活跃终端：

```javascript
// 在 OpenCodeSession 类中新增
this.terminals = new Map() // terminalId → ManagedTerminal
this.terminalCounter = 0

// ManagedTerminal 结构
// {
//   terminalId: string,
//   process: ChildProcess,     // spawn 返回的子进程
//   output: string,            // 累积输出缓冲区
//   exitCode: number | null,
//   exited: boolean,
//   exitPromise: Promise<number>,
//   exitResolve: (code) => void,
// }
```

#### 2. 重构 `terminal/create`

将当前的 `execFile` 一次性执行改为 `spawn` 长期运行模式：

```javascript
case 'terminal/create': {
  const p = params || {}
  const command = p.command || '/bin/sh'
  const args = p.args || []
  const cwd = p.cwd || this.cwd
  const terminalId = `term-${++this.terminalCounter}-${Date.now()}`

  const proc = spawn(command, args, {
    cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' },
  })

  // 设置 exitPromise、output 累积、退出处理...
  // 存入 this.terminals Map
  // 通过 SSE 广播 terminal_output 和 terminal_exited 事件

  this._write({ jsonrpc: '2.0', id, result: { terminalId } })
  break
}
```

#### 3. 新增四个终端操作

- **`terminal/output`**: 从 `terminals` Map 中获取对应终端的累积输出
- **`terminal/wait_for_exit`**: 若已退出则直接返回 exitCode，否则 await exitPromise
- **`terminal/kill`**: 向子进程发送 SIGTERM，3 秒后 SIGKILL
- **`terminal/release`**: 先 kill（如果还在运行），然后从 Map 中移除

#### 4. 终端输出实时推送

通过现有的 `_broadcastSSE` 机制推送终端事件通知，格式参考 `terminal-manager.ts`：

```javascript
// terminal_output 事件
{
  jsonrpc: '2.0',
  method: 'session/update',
  params: {
    sessionId: this.opencodeSessionId,
    update: {
      sessionUpdate: 'terminal_output',
      terminalId,
      data: chunk.toString('utf-8'),
    },
  },
}

// terminal_exited 事件
{
  jsonrpc: '2.0',
  method: 'session/update',
  params: {
    sessionId: this.opencodeSessionId,
    update: {
      sessionUpdate: 'terminal_exited',
      terminalId,
      exitCode,
    },
  },
}
```

#### 5. Session 清理

在 `kill()` 方法中遍历并清理所有关联的终端进程，防止孤儿进程。

## 风险点

### R1: 终端超时与资源泄漏（高风险）

当前 `execFile` 有 30 秒超时机制。改为 `spawn` 后，终端进程可以长期运行。如果 agent 创建了终端但没有调用 `release`（例如 agent 崩溃或会话异常终止），会导致容器内出现孤儿进程。

**缓解措施**: 
- 在 `OpenCodeSession.kill()` 中清理所有终端
- 为每个终端设置最大生存时间（例如 5 分钟）
- 在 `proc.on('exit')` 回调中清理 Map 条目

### R2: 输出缓冲区内存压力（中风险）

`terminal/output` 需要保存终端的全部输出。如果命令产生大量输出（如 `cat` 大文件或持续日志流），内存可能快速增长。

**缓解措施**: 
- 限制缓冲区大小（例如最大 1MB），超过后截断旧内容
- 或仅保留最近 N 行输出

### R3: 并发终端数量（低风险）

Docker 容器有 `--pids-limit 100` 的限制。如果 agent 频繁创建终端而不释放，可能触发 PID 上限。

**缓解措施**: 
- 限制每个 Session 最大终端数量（例如 10 个）
- 创建新终端时检查并清理已退出的终端

### R4: 协议兼容性（中风险）

需要确保 bridge 返回的响应格式与 `@agentclientprotocol/sdk@0.14.1` 定义的类型完全一致。特别是 `terminal/create` 返回的字段名和 `terminal/wait_for_exit` 返回的字段名需要与 SDK 类型定义对齐。

**缓解措施**: 
- 参考 SDK 类型定义 (`dist/schema/types.gen.d.ts`) 验证响应格式
- 编写集成测试验证请求/响应流程

### R5: ExtRequest 可扩展请求（低风险）

ACP 协议中还定义了 `ExtRequest` 类型用于扩展请求。当前 bridge 的 default case 返回空结果 `{}`，对于未知的扩展请求这可能不是最佳处理方式。

**缓解措施**: 
- 可暂时保持当前行为，但记录 warn 日志
- 未来考虑返回标准的 JSON-RPC `-32601 Method not found` 错误

## 实施步骤

### 步骤 1: 在 OpenCodeSession 中添加终端状态管理

- 在 `constructor` 中初始化 `this.terminals = new Map()` 和 `this.terminalCounter = 0`
- 定义 `ManagedTerminal` 结构（对象字面量即可，不需要 class）
- 在 `kill()` 方法中添加终端清理逻辑

### 步骤 2: 重构 `terminal/create` 实现

- 将 `execFile` 替换为 `spawn`，使用 `{ shell: true }` 选项
- 设置 stdout/stderr 数据监听器，累积输出到缓冲区
- 通过 `_broadcastSSE` 推送 `terminal_output` 和 `terminal_exited` 通知
- 创建 exitPromise 用于 `wait_for_exit` 操作
- 将 ManagedTerminal 存入 `this.terminals` Map

### 步骤 3: 实现 `terminal/output`

- 从 `params.terminalId` 查找对应的终端
- 返回 `{ output: terminal.output }` 或空输出（终端不存在时）

### 步骤 4: 实现 `terminal/wait_for_exit`

- 从 `params.terminalId` 查找对应的终端
- 如果已退出，直接返回 `{ exitCode }`
- 否则 await `terminal.exitPromise` 后返回

### 步骤 5: 实现 `terminal/kill`

- 从 `params.terminalId` 查找对应的终端
- 如果终端还在运行，发送 SIGTERM
- 设置 3 秒后 SIGKILL 的超时机制
- 返回 `{}`

### 步骤 6: 实现 `terminal/release`

- 从 `params.terminalId` 查找对应的终端
- 如果终端还在运行，先 kill
- 从 `this.terminals` Map 中删除
- 返回 `{}`

### 步骤 7: 测试与验证

- 手动测试：启动 Docker 容器，通过 bridge API 发送 terminal 相关请求
- 验证终端创建、输出流式推送、等待退出、kill、release 全流程
- 验证 Session 清理时终端进程是否正确清理
- 验证内存不会因大量输出而无限增长
- 考虑添加 e2e 测试覆盖 Docker bridge 的 terminal 流程
