# Agent Team 实践与架构设计：在约束下构建可演进的一个人开发团队

尽管我们可以用最好的模型完成所有的事情，但是约束才是我决定写这篇文章的一个出发点：约束越多，问题就越好玩。

构建多 Agent 系统时，我们面临三大核心约束：

1. **Token 是硬约束** — 上下文窗口有限，每个 Agent 必须精确控制输入。
2. **流程需可复用** — 临时 Prompt 不够，需要升级为结构化的 Specialist。
3. **工具选择需灵活** — Claude Code、OpenCode、Codex 各有优势，需要根据任务动态选择。

结合最近正在构建的 Routa（ https://github.com/phodal/routa ），分享我的一些新想法，以及现有一些实践，诸如于如何通过 **Specialist 角色化**、**状态外置** 和 **MCP
跨 Agent 通信**，将 “多 Agent 协作” 打造成可演进的工程系统，而非一次性 Prompt 的堆叠。

## 引子 1：Token 与成本约束下的 Agent Team

在设计 Routa 多 Agent 系统作为软件开发平台的时候，我一直想解决一个成本的问题 + 协同的问题：

> 事实上，我并不想为任何的 token 付钱 —— 作为一个开发者，用自己的钱去支持一个淘汰自己工具的公司，是愚蠢的。如果是用于工作的工具，
> 公司应该为我付钱；如果是用于生活的话，我只想休息。

在这种场景下，我的 Coding Agent 工具就比较杂乱了：

- 已经无了的 Thoughtworks global（前司）购买的 message-base + 额外付费的 的 Cursor
- 自己写的 AutoDev Agent，需要自己接入模型（好在，好几家模型厂商会付钱给我评测，可以用好几年）
- 现在的公司（Inspire，原 Thoughtworks 中国业务）购买的、难用的、带有非常便宜的 Opus 4.6 的 AWS Kiro
- GitHub 赞助开源作者的 Copilot Pro 版本（message-base 非常划算，特别适合个人买单）
- Augment Code 赞助开源作者的 Augment Enterprise 版本
- 其它国产模型：GLM、Minimax、有人赞助的 DeepSeek、没有赞助我的 Kimi

在没有公司完全买单的 Cursor 之后，我需要一种更好的方式，能在一个月非常好地利用、编排工具，这样的话 Kiro + Copilot 提供的 Opus/Sonnet，就能发挥最大价值
—— 当然要我说最好用的还是 Augment Code，但是只是 backup，Claude Code 虽然强，但是上下文的**时间成本太高了**。怀念 Cursor 的前端能力。

但是我觉得这个问题对于大部分人来说是相似的，诸如于：

> 在节省最好的编码模型 token 的同时，利用好高性价比的国产模型作为 background agent 来做更多的事情。

## 引子 2：Agent Team 的技术基石与原则

基于此作为出发点 Routa 与其它多 Agent 系统有着非常大的区别。整个 Routa 的架构有点类似于现在的人类团队的构成。Routa
本身是没有 Coding Agent，它有：

- 一个“伟大”的团队领袖。用于编排 Agent 的 Workspace Agent。
- 不同出身的团队成员。
  - 工具：Claude Code、OpenCode、Codex 等工具的 AI Agent
  - 模型：高价值产出的 Opus 模型、又快又好的 Sonnet 模型，高性价比的 GLM 等模型

在这种模式下，我们要解决一个问题：

> 即使单个组件不可靠，也能搭建出高度可靠的系统 —— Leslie Lamport

通俗也来说：

> 如何把不同能力的 Agent 组合起来，让强模型做规划，弱模型做执行，在节省成本的同时保证质量？

因此，Routa 的核心原则可以总结为：

- 跨 Agent 协议 ACP 与 Routa EventBridge，实现标准化通信。
- 跨 Agent 上下文工程：一个 Agent 的分析可被另一 Agent 高效利用。
- 角色化 Agent 与角色驱动的 Prompt 工程落地。
- AI Agent 的协作与通讯体系化。
- 流程 Skill 化，规范以 Spec 为核心。

## 演进优先：可替换原则 — ACP Provider 可插拔

作为一个 AI 时代身处在没落的**咨询行业**的技术专家，我一直相信，可演进性才是我的竞争力，也是构建系统的核心 —— 尽管，供应商绑定（Vendor Lock-in）
也是一个非常“不错”的商业模式，但是那可是屎山。

既然，我们不想被某个商业、闭源的工具绑定，诸如于 Claude Code，那么我们就需要设计成可演进的系统，ACP 协议是我们根据业内的趋势发现最好的一种
方式（没有之一），通过 ACP 我们可以灵活地替换 AI 编程工具。按能力与场景灵活选择：

* **Claude Code**：复杂推理、架构设计
* **OpenCode**：快速实现、代码生成
* **Codex**：简单修复、重复任务
* **Gemini**：多模态任务

基于此模式，只需要设计一个更好的协作方式协同就行了。诸如 Routa 采用的 MCP 方式：

> 所有 Provider 都通过统一 MCP 配置接入 Routa 协调服务器，无需修改 Agent 逻辑即可切换。

```json
{
  "name": "routa-coordination",
  "type": "http",
  "url": "http://localhost:3000/api/mcp",
  "env": {
    "ROUTA_WORKSPACE_ID": "ws-123"
  }
}
```

其核心设计要点：

1. Agent 只关注角色，不感知底层 Provider
2. Provider 可在运行时切换
3. 动态 Registry + 内置 Presets 双层机制确保兼容性与可演进性

动态发现与内置 Presets：

Routa 支持 **动态发现 Agent**，通过 ACP Registry 获取最新版本和配置，实现无缝扩展。同时，Routa 提供 **内置 Presets** 定义标准
Agent 的启动方式：

* **Preset 来源优先级**：Registry（动态） > Bundled（内置） > User（自定义）
* 动态发现保证系统始终支持最新 Agent
* 内置 Presets 保证基础兼容性
* 用户可按需扩展 Presets

核心设计要点：

1. Agent 只关注角色，不感知底层 Provider
2. Provider 可在运行时切换
3. 动态 Registry + 内置 Presets 双层机制确保兼容性与可演进性

## 可组合原则 — Specialist 按需组合

> 职责清晰，角色独立；组合灵活，系统可扩展。

在复杂系统中，单一角色无法覆盖所有场景。Routa 将 Specialist 设计为可组合、可扩展的核心单元，每个 Specialist 专注职责，按需组合。如下是
在上个阶段（上周）中，Routa 参考 Augment Code 的 Intent 内置的 Specialist：

| 角色                        | 核心职责           | Model Tier | 工具权限      |
|---------------------------|----------------|------------|-----------|
| **ROUTA (Coordinator)**   | 规划任务、委派子 Agent | SMART      | 无文件编辑，仅委派 |
| **CRAFTER (Implementor)** | 编写实现、落地代码      | FAST       | 完整文件编辑权限  |
| **GATE (Verifier)**       | 审核、标准检查        | SMART      | 只读 + 消息通信 |
| **DEVELOPER (Solo)**      | 独立规划与实现        | SMART      | 完整权限，不委派  |

随着，我们添加了 Event/Hook driven 的功能，我们添加了自定义 Specialist，如：issue-enricher，当新创建了 issue 之后，可以自动调用 Agent
来分析代码：

```bash
GitHub Webhook (issues.opened)
    ↓
handleGitHubWebhook() — 匹配 trigger rules
    ↓
WorkflowExecutor.trigger() — 创建 WorkflowRun
    ↓
BackgroundTask (每个 workflow step 一个)
    ↓
ACP Process — 使用 specialist 配置
```

而在我们的实现里，当你使用了 Claude Code 之后，Specialist 也是一个 Skill。在我们的设计里，Specialist 和 Skill 使用相同的
Markdown + YAML frontmatter，可以互相转换。

## 状态外置与上下文隔离

基于 ACP 协议与我们的事件驱动架构，以及未来 trace 方案，我们参考 Agent Trace 标准，遵循 **可重放、可回滚、可审计** 的原则，
将关键状态外置到持久化介质，而非完全依赖内存。

### File-Based 状态管理

因此，在存储上分为：

1. **Database Stores** — 存储结构化数据：Agent、Task、Note、Workspace 等
2. **File-Based Traces** — 持久化追踪记录，按日期分文件：`.routa/traces/{day}/traces-{datetime}.jsonl`

这里的 Trace 是协作事实来源，而非调试日志：

* 谁（provider/model/contributor）
* 什么时候（timestamp）
* 哪个会话/工作区（sessionId/workspaceId）
* 做了什么（eventType + tool）
* 影响哪些文件
* VCS 上下文（branch/revision）

由于我们是 Tauri + Next.js 双架构，所以还需要：

> 状态外置保证跨环境一致性，可在本地文件或 Serverless 数据库之间无缝切换。

对于 issue 等其它方式也是相似的，基于 Agents.md 与代码库中的 issues/ 目录，记录 Agent 遇到的问题，方便未来排查。 而在 Agent 协同上，
我们需要的东西更多，诸如 explore agent 生成的 context 可以先存储在临时目录，或者当前项目中等。

### 上下文隔离原则 — 按角色裁剪

每个 Agent 只接收必要上下文：

* **ROUTA**：完整 Spec、任务列表、Agent 状态。
* **CRAFTER**：任务 Note、Acceptance Criteria、验证指令、相关文件。
* **GATE**：只读 Spec、任务 Note、Agent 对话、验证计划。

**要点：** 避免浪费 Token，精确控制信息。

## 流程代码化 — Prompt → Skill → Specialist 绑定

> 流程不是一次性指令，而是可复用能力的组合与角色化绑定。

大部分 Specialist 本质上类似于 SKILL.md，是一个可复用的能力单元。但是，Specialist 是一个角色，它是一个有状态的、可交互的、有权限的
Agent。它可以调用不同的 Skill，也可以不调用 Skill。也因此，Routa 的流程复用遵循三层绑定关系：

| 层级             | 定义           | 载体                               | 生命周期  |
|----------------|--------------|----------------------------------|-------|
| **Prompt**     | 一次性指令文本      | 用户输入或代码字符串                       | 单次使用  |
| **Skill**      | 可复用的能力单元     | `SKILL.md` 或 `~/.claude/skills/` | 跨项目复用 |
| **Specialist** | 角色 + 权限 + 工具 | Database / YAML / 硬编码            | 系统级绑定 |

其核心绑定流程如下：

1. **定义 Skill**：Skill 是独立的能力单元，可跨项目复用。
2. **绑定 Specialist**：将 Skill 赋予角色，并配置权限、模型与执行边界。
3. **运行时注入**：系统根据 Specialist 配置，将 Skill 注入到 Agent 执行流程中。

#### Specialist 的特性

* **角色边界** — 通过 `roleReminder` 强制行为约束
* **工具权限控制** — 不同 Specialist 有不同操作权限（如 ROUTA 仅委派，GATE 只读）
* **标准化流程** — 每个 Specialist 有明确执行步骤，保证流程可靠
* **Skill 可复用** — 多个 Specialist 可以共享同一 Skill，降低维护成本

## 事件驱动：把流程变成可组合的故事

> 我们过去习惯写线性脚本，一条条指令顺序执行。但现实里，流程总是充满不确定——任务会延迟、结果会变化、不同角色需要协作。于是，我开始思考：
> 如果把流程当作事件流，会怎样？

在日常开发中：我们推送代码到 GitHub，触发了 CI/CD 流程、代码扫描、自动部署，甚至还有通知机器人。每一次推送都是一个事件，
每个服务响应事件的方式都不同，但整体流程依然可靠。事件驱动，就是在软件开发中把这种自然触发机制抽象出来，让每一步可组合、可观察。

所以，让每个步骤都有独立的 Agent 去实现，问题就变得非常简单了。

### EventBus — 流程的神经网络

在这个架构里，EventBus 就像系统的神经网络，每个 Agent 都是独立的节点。事件在网络里流动，有的只触发一次，有的需要优先响应，
有的要等一组任务完成——它们的订阅方式灵活多样：

* **One-shot**：一次触发，任务完成即注销
* **Priority**：重要事件优先响应
* **Wait-group**：等待一组 Agent 都完成
* **Pre-subscribe**：先订阅再触发，避免竞态

> 想法很简单：**让事件推动流程，而不是让人盯着轮询。**

### EventBridge — 不同系统的桥梁

不同系统、不同 Provider 事件格式不一样。EventBridge 就像一座桥，把各种事件统一成标准格式，让我们可以用同一套逻辑去处理：

* 调用工具、更新计划、发送消息都变得统一
* 跨系统可观测，任何事件都能追踪
* 流程透明，出问题也容易回溯

### Workflow — 事件背后的秩序

事件本身是无序的，但任务依赖必须被尊重。Workflow 就是把事件背后的秩序梳理清楚：

* 每个步骤是一个 `BackgroundTask`
* 用 `dependsOnTaskIds` 明确依赖
* BackgroundWorker 自动调度，依赖满足就执行
* 支持 `parallel_group` 并行，提高效率

> 小技巧：**顺序和并行可以共存，事件流让协作不再堵塞。**

### 控制复杂度 — 自由与边界

即便是事件驱动，也不能完全放开。无限嵌套的任务会把系统拖垮，太多并行会让调度爆炸。于是我们加了几个边界：

```typescript
export const MAX_DELEGATION_DEPTH = 2;    // 防止无限递归
export const MAX_PARALLEL_TASKS = 10;     // 控制任务图规模
export const DEFAULT_TASK_TIMEOUT = 300;  // 超时保护
```

> 核心思想：**事件驱动让系统灵活，但边界保证长期可控。**

## 分层资源管理原则 — 任务驱动的 Specialist

> Token 并不是免费的算力，而是一种稀缺资源。

因此，核心问题是：**如何在节省成本的同时保证系统可靠？** 答案是——**为不同任务配置专门的 Specialist，并通过模型可配置实现资源精细调度**。

### 1. 任务驱动 Specialist — 合适的模型做合适的事

每个任务场景对应一个专门的 Specialist：简单任务用性价比高的模型，复杂任务用强模型，重复任务交给自动化 Specialist。

> 核心思想：**不要用万能模型解决所有问题，而是根据任务需求动态选择最合适的模型和工具。**

### 2. 模型可配置 — 动态分配与调度

Routa 的设计允许每个 Specialist 在运行时选择和切换模型：

* **Provider 可插拔** — Claude、DeepSeek、GLM、OpenCode 等可按需接入
* **动态模型分层** — 根据任务复杂度和预算自动选择高/中/低能力模型
* **事件驱动调度** — 每次模型调用都是一个事件，系统按优先级分配资源
* **降级与兜底** — 高价值模型不可用时自动触发备用模型

问题就变成了：

> **把简单任务交给便宜模型，把复杂任务交给强模型，把重复任务交给自动化 Specialist。**
> **模型可配置 + 任务驱动 Specialist + 事件调度，让有限资源发挥最大价值。**

## 四、工具与基础设施

### 4.1 通信分离原则 — Service 负责协作，Tool 负责执行

* **Service**：任务、Agent、状态、Trace 一致性。
* **Tool**：提供可执行能力给任意 Provider。

核心 MCP 工具示例：

| 工具                      | 用途          | 调用者              |
|-------------------------|-------------|------------------|
| delegate_task_to_agent  | 委派任务        | ROUTA            |
| send_message_to_agent   | 消息通信        | 所有               |
| report_to_parent        | 向父 Agent 报告 | CRAFTER, GATE    |
| list_agents             | 查看状态        | ROUTA            |
| read_agent_conversation | 读取历史        | ROUTA, GATE      |
| set_note_content        | 创建/更新 Note  | ROUTA, DEVELOPER |
| subscribe_to_events     | 订阅事件        | ROUTA            |

---

### 4.2 动态工具原则 — 按任务和模型选择

不同 Provider 和模型能力不对称，需要动态选择工具集：

#### 工具权限分组

```typescript
// 工具按权限级别分组
const TOOL_PERMISSION_GROUPS = [
  {
    id: "readonly",
    label: "Read-only tools",
    tools: ["Read", "Glob", "Grep", "WebFetch"],
  },
  {
    id: "edit",
    label: "Edit tools",
    tools: ["Edit", "Write", "NotebookEdit"],
  },
  {
    id: "execution",
    label: "Execution tools",
    tools: ["Bash"],
  },
  {
    id: "mcp",
    label: "MCP tools",
    tools: [], // 动态注册
  },
];
```

#### 模型感知的工具选择

不同模型接收不同的工具集，基于模型能力动态调整：

```typescript
// 弱模型（如 Haiku）— 只提供核心工具
if (modelTier === "FAST") {
  allowedTools = [
    "Read", "Edit", "Write", "Bash", "Glob", "Grep",
    "delegate_task_to_agent", "report_to_parent"
  ];
}
// 强模型（如 Opus）— 提供完整能力
else if (modelTier === "SMART") {
  allowedTools = ALL_TOOLS; // 34 个工具
}
```

#### Provider 能力映射

| Provider        | 适用角色              | 工具集特点              |
|-----------------|-------------------|--------------------|
| **Claude Code** | ROUTA/GATE        | 完整 MCP 工具，支持 Skill |
| **OpenCode**    | CRAFTER/DEVELOPER | 代码生成优化，快速编辑        |
| **Codex**       | CRAFTER（简单任务）     | 基础工具集，成本低          |
| **Gemini**      | 多模态任务             | 图像理解 + 代码          |

#### 运行时工具过滤

```typescript
// 声明时过滤
const sessionOptions = {
  allowedTools: ["Read", "Edit", "Bash"],  // 白名单
  disallowedTools: ["WebSearch"],           // 黑名单
};

// 运行时权限回调
canUseTool: async (toolName, toolInput) => {
  return this.toolPermissionService.canUseTool(toolName, toolInput, {
    permissionMode: this._currentPermissionMode,
  });
}
```

## 案例：Issue 分析
