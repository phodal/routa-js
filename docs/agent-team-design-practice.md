# Agent Team 实践与设计原则：在约束下构建可演进的一个人开发团队

> 独立开发者如何通过 AI Agent 协作系统，构建一个可扩展的虚拟开发团队？

## 缘起

作为独立开发者，我面临一个经典困境：功能要做的事情太多，而时间永远不够。

传统解决方案是招人、组建团队。但这带来了新的问题：沟通成本、管理开销、财务压力。而在 AI 时代，我们有了一个新的选择——**构建一个由 AI Agent 组成的虚拟开发团队**。

过去一年，我为 Routa.js 设计并实现了一个多 Agent 协作系统。这篇文章分享我的实践经验：如何在**约束条件下**，将"多 Agent 协作"打造成可演进的工程系统，而非一次性 Prompt 的堆叠。

---

## 第一章：为什么需要 Agent Team？

### 1.1 独立开发者的资源困境

独立开发者的三大核心约束：

1. **时间是硬约束** — 一天只有 24 小时，每个 Agent 调用都在消耗预算
2. **认知带宽有限** — 无法同时追踪太多上下文，需要精确控制信息流
3. **工具链碎片化** — Claude Code、OpenCode、Codex 各有优势，需要灵活选择

这不是"技术问题"，而是**经济学问题**——如何用有限资源，获得最大产出。

### 1.2 Agent Team 的价值主张

Agent Team 不是"多个 AI 聊天窗口"，而是：

| 传统团队 | Agent Team |
|----------|------------|
| 招聘耗时 | 随时"上岗" |
| 需要管理 | 自驱动执行 |
| 成本固定 | 按需付费 |
| 认知摩擦大 | 结构化通信 |

**核心理念：** 每个 Agent 是一个"角色化的能力单元"，通过结构化协议协作，形成一个虚拟开发团队。

### 1.3 Routa.js 的解决方案

Routa.js 通过三个机制实现 Agent Team：

1. **Specialist 角色化** — Agent 不再是通用助手，而是承担特定角色的专家
2. **MCP 跨 Agent 通信** — 统一的通信协议，让不同 AI 工具协同工作
3. **状态外置** — 所有协作状态持久化，可重放、可审计、可回滚

---

## 第二章：演进优先——构建可替换的团队

### 2.1 可替换原则：团队成员可随时"换人"

独立开发者的技术栈会变化，Agent Team 必须**支持灵活换人**。

#### ACP Protocol — 统一的"招聘标准"

Routa.js 通过 **ACP (Agent Client Protocol)** 支持多种 AI Coding 工具：

| Provider        | 擅长领域 | 成本 | 适用角色 |
|-----------------|----------|------|----------|
| **Claude Code** | 复杂推理、架构设计 | 高 | ROUTA（规划者）、GATE（验证者） |
| **OpenCode**    | 快速实现、代码生成 | 中 | CRAFTER（实现者） |
| **Codex**       | 简单修复、重复任务 | 低 | CRAFTER（简单任务） |
| **Gemini**      | 多模态任务 | 中 | 特殊需求场景 |

所有 Provider 通过统一的 MCP 配置"入职"：

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

**设计理念：** Agent 不感知底层"员工"（Provider），只关注 Specialist 角色。

#### ACP Presets — 内置"员工档案"

```typescript
// src/core/acp/acp-presets.ts
export const ACP_AGENT_PRESETS: readonly AcpAgentPreset[] = [
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    args: ["acp"],
    description: "OpenCode AI coding agent",
  },
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    args: [],
    description: "Anthropic Claude Code (native ACP support)",
    nonStandardApi: true,
  },
];
```

#### ACP Registry — 动态"人才市场"

```typescript
// Registry 提供动态 Agent 发现和版本管理
export const ACP_REGISTRY_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

// 获取特定 Agent 的配置
const agent = await getRegistryAgent("kiro-cli");
```

**优先级：** Registry（动态） > Bundled（静态） > User（自定义）

**优势：**
* 无需代码更新即可支持新的 ACP Agent
* 自动获取最新版本和配置
* 统一的分布方式（npx/uvx/binary）

### 2.2 组合增长原则：团队可按需扩张

独立开发者的需求会变化，Agent Team 必须**支持按需扩张**。

#### 四种核心角色

Routa.js 定义四种核心 Specialist 角色（可类比传统团队职能）：

| Agent Team | 传统团队 | 职责 | Model Tier | 工具权限 |
|------------|----------|------|------------|----------|
| **ROUTA** | 技术负责人/PM | 规划任务、委派工作 | SMART | 无文件编辑，仅委派 |
| **CRAFTER** | 工程师 | 执行实现、编写代码 | FAST | 完整文件编辑权限 |
| **GATE** | 代码审查者 | 验证工作、检查标准 | SMART | 只读 + 消息通信 |
| **DEVELOPER** | 全栈独立开发者 | 独立规划和实现 | SMART | 完整权限，不委派 |

#### 按需加载机制

Specialist 定义从多源加载，按优先级合并（高优先级覆盖低优先级）：

1. **Database（用户自定义）** — 最高优先级，支持运行时修改
2. **User files** (`~/.routa/specialists/`) — 用户本地文件
3. **Bundled** (`resources/specialists/`) — 项目内置定义
4. **Hardcoded fallback** — 兜底硬编码

```typescript
// src/core/orchestration/specialist-prompts.ts
export async function loadSpecialists(): Promise<SpecialistConfig[]> {
  if (_useDatabase) {
    return await loadSpecialistsFromAllSources();
  }
  const fromFiles = loadAllSpecialists();
  const fileIds = new Set(fromFiles.map((s) => s.id));
  const hardcodedExtras = HARDCODED_SPECIALISTS.filter(
    (s) => !fileIds.has(s.id)
  );
  return [...fromFiles, ...hardcodedExtras];
}
```

#### 自定义角色：扩展团队能力

用户可用 YAML 文件定义自定义 Specialist（支持热重载）：

```yaml
# ~/.routa/specialists/security-reviewer.yaml
id: "security-reviewer"
name: "Security Reviewer"
description: "Reviews code for security vulnerabilities"
role: "GATE"  # 复用现有角色
model_tier: "smart"

system_prompt: |
  You review code for security vulnerabilities following OWASP Top 10.
  Focus on input validation, output encoding, and authentication.

role_reminder: "Focus on OWASP Top 10, check input validation"

# 可选：指定默认使用的 Provider
default_adapter: "claude-code-sdk"

# 可选：强制指定模型（覆盖 model_tier）
model: "claude-opus-4-5"
```

**可组合性设计：**
* **角色复用** — 自定义 Specialist 可复用现有角色或定义新角色
* **模型覆盖** — 每个 Specialist 可指定独立模型，覆盖默认 Tier 映射
* **Provider 绑定** — 可指定默认 Provider，或运行时动态选择

### 2.3 状态外置原则：团队记忆可持久化

独立开发者的系统会重启、会崩溃，Agent Team 必须**支持状态恢复**。

#### 三层状态设计

| 层级 | 内容 | 载体 | 用途 |
|------|------|------|------|
| **Database Stores** | Agent、Task、Note、Workspace | PostgreSQL / SQLite | 结构化数据查询 |
| **File-Based Traces** | 追踪记录 | `.routa/traces/{day}/traces-{datetime}.jsonl` | 审计、回放 |
| **Git Integration** | VCS 上下文 | Git metadata | 代码溯源 |

**优势：** 可重放、可回滚、可审计。跨环境统一接口（本地文件或 Serverless 数据库）。

#### 实践案例

> **问题：** HMR 导致 `sessionToTask` 内存 Map 丢失，任务卡在 RUNNING。
> **解决：** `listRunning()` 方法从数据库恢复状态，而非依赖内存。

**教训：** 关键状态必须持久化，内存仅作缓存。

---

## 第三章：流程结构化——从临时协作到可复用流程

### 3.1 流程代码化原则：Prompt → Skill → Specialist

独立开发者的协作流程必须**可复用**，而非每次都重新设计。

#### 三层绑定关系

```
Prompt (一次性) → Skill (可复用) → Specialist (角色化)
```

| 层级 | 定义 | 载体 | 生命周期 |
|------|------|------|----------|
| **Prompt** | 一次性指令文本 | 用户输入或代码字符串 | 单次使用 |
| **Skill** | 可复用的能力单元 | `SKILL.md` 或 `~/.claude/skills/` | 跨项目复用 |
| **Specialist** | 角色 + 权限 + 工具 | Database / YAML / 硬编码 | 系统级绑定 |

#### Skill → Specialist 绑定流程

```typescript
// 1. 定义 Skill（可复用的能力单元）
// ~/.claude/skills/pr-review.md
```

```markdown
---
name: pr-verify
description: Comprehensive PR verification skill
---

You verify pull requests by:
1. Analyzing PR body requirements
2. Reviewing comments for blocking issues
3. Checking CI status
4. Running E2E tests
5. Generating verification report
```

```typescript
// 2. 绑定到 Specialist（赋予角色、模型、工具权限）
// resources/specialists/pr-verifier.yaml
id: "pr-verifier"
name: "PR Verifier"
role: "GATE"  # 复用验证者角色
model_tier: "smart"

system_prompt: |
  You are a PR verification specialist.
  Use the pr-verify skill for comprehensive verification.

role_reminder: "Always run E2E tests before approval"

# 绑定 Skill
skills: ["pr-verify"]
```

```typescript
// 3. 运行时注入 Skill 内容（Claude Code SDK 集成）
const skillContent = skillRegistry.getSkill("pr-verify")?.content;
await adapter.promptStream(
  userRequest,
  sessionId,
  skillContent  // 通过 systemPrompt.append 注入
);
```

#### ROUTA Coordinator 标准工作流

```markdown
1. Understand: 提 1-4 个澄清问题
2. Spec: 使用 `@@@task` 编写 Spec
3. STOP: 展示计划，等待用户批准
4. Wait: 阻止继续，直到批准
5. Delegate Wave 1: 委派任务
6. END TURN: 等待 Wave 1 完成
7. Verify: GATE Agent 验证
8. Review: 如有问题，创建修复任务
9. Verify all: 最终验证
10. Complete: 更新 Spec
```

**设计要点：**
* 强制停止点防止失控
* 委派语义清晰
* 验证闭环保证流程可靠
* Skill 可跨 Specialist 复用，降低维护成本

### 3.2 图结构原则：流程可编排为有向图

独立开发者的任务会变复杂，线性脚本**难以应对复杂依赖**。

#### 从脚本到图

* **节点**：任务、Agent、验证者
* **边**：委派、依赖、回传、验证闭环

递归/环路风险通过"深度阀门"控制：

```typescript
export const MAX_DELEGATION_DEPTH = 2;
```

**教训：** 约束让协作图长期可控，而非限制能力。

---

## 第四章：资源治理——在约束下优化成本

### 4.1 Token 资源原则：分层与预算

独立开发者的 API 调用是**真金白银**，必须精打细算。

#### Model Tier 映射

每个 Provider 有独立的模型映射表，允许针对不同能力等级选择最优模型：

```typescript
// src/core/acp/provider-registry.ts
export const PROVIDER_MODEL_TIERS: Record<string, Record<string, string>> = {
  claude: {
    fast: "haiku-4.5",
    balanced: "sonnet-4.5",
    smart: "opus-4.6",
  },
  claudeCodeSdk: {
    fast: "claude-3-5-haiku-20241022",
    balanced: "claude-sonnet-4-20250514",
    smart: "claude-opus-4-5",
  },
  opencode: {
    fast: "fast",
    balanced: "balanced",
    smart: "smart",
  },
};
```

#### 自定义模型覆盖（三级优先级）

```typescript
// 1. Per-Instance 覆盖（最高优先级）
const adapter = new ClaudeCodeSdkAdapter(cwd, onNotification, {
  model: "claude-opus-4-5",      // 强制使用 Opus
  maxTurns: 50,                   // 自定义最大轮数
  baseUrl: "https://custom.api",  // 自定义 API 端点
  apiKey: "sk-...",               // 自定义密钥
});

// 2. Specialist 级别覆盖
// resources/specialists/crafter.yaml
model: "claude-sonnet-4-20250514"  # 覆盖 model_tier 映射

// 3. Provider Tier 映射（默认）
```

#### Tool Mode 控制

| Tool Mode | 工具数量 | 适用场景 | Token 影响 |
|-----------|----------|----------|------------|
| **Essential** | 12 个 | 弱模型、简单任务 | 低（工具输出少） |
| **Full** | 34 个 | 强模型、复杂任务 | 高（完整能力） |

#### 成本优化策略

| 模型组合 | Tier | Tool Mode | 使用场景 |
|----------|------|-----------|----------|
| FAST + Essential | FAST | essential | 简单修复、重复任务 |
| BALANCED + Full | BALANCED | full | 一般实现任务 |
| SMART + Full | SMART | full | 规划、验证、架构设计 |

**成本控制要点：**
* CRAFTER（实现者）使用 FAST + Essential，节省成本
* ROUTA/GATE（规划/验证）使用 SMART + Full，保证质量
* 可通过 Specialist 的 `model` 字段强制指定特定模型

### 4.2 上下文隔离原则：按角色裁剪

每个 Agent 只接收必要上下文：

| Agent | 接收内容 | 目的 |
|-------|----------|------|
| **ROUTA** | 完整 Spec、任务列表、Agent 状态 | 全局协调 |
| **CRAFTER** | 任务 Note、Acceptance Criteria、验证指令、相关文件 | 精准执行 |
| **GATE** | 只读 Spec、任务 Note、Agent 对话、验证计划 | 独立验证 |

**要点：** 避免浪费 Token，精确控制信息。

---

## 第五章：工具与基础设施

### 5.1 通信分离原则：Service 负责协作，Tool 负责执行

* **Service**：任务、Agent、状态、Trace 一致性
* **Tool**：提供可执行能力给任意 Provider

核心 MCP 工具示例：

| 工具 | 用途 | 谁调用 |
|------|------|--------|
| delegate_task_to_agent | 委派任务 | ROUTA |
| send_message_to_agent | 消息通信 | 所有 |
| report_to_parent | 向父 Agent 报告 | CRAFTER, GATE |
| list_agents | 查看状态 | ROUTA |
| read_agent_conversation | 读取历史 | ROUTA, GATE |
| set_note_content | 创建/更新 Note | ROUTA, DEVELOPER |
| subscribe_to_events | 订阅事件 | ROUTA |

### 5.2 动态工具原则：按任务和模型选择

不同 Provider 和模型能力不对称，需要动态选择工具集。

#### 工具权限分组

```typescript
const TOOL_PERMISSION_GROUPS = [
  { id: "readonly", tools: ["Read", "Glob", "Grep", "WebFetch"] },
  { id: "edit", tools: ["Edit", "Write", "NotebookEdit"] },
  { id: "execution", tools: ["Bash"] },
  { id: "mcp", tools: [] }, // 动态注册
];
```

#### 模型感知的工具选择

```typescript
// 弱模型（如 Haiku）— 只提供核心工具
if (modelTier === "FAST") {
  allowedTools = ["Read", "Edit", "Write", "Bash", "Glob", "Grep", ...];
}
// 强模型（如 Opus）— 提供完整能力
else if (modelTier === "SMART") {
  allowedTools = ALL_TOOLS; // 34 个工具
}
```

#### 案例：PR Verification 工作流

```
分析 (SMART + Full) → CI 检查 (FAST + Essential) → E2E (BALANCED + Full) → 报告 (SMART + Full)
```

使用 Workflow + Background Task 依赖链，每个阶段使用最优模型和工具组合。

**待实现功能：**

> [!NOTE]
> 基于模型的动态工具选择正在开发中。参考 Copilot Chat 的实现：
> * Permission Mode 切换（plan vs execute）
> * Pre/Post 工具执行钩子
> * 模型学习机制（记录哪些工具在哪些模型上效果最好）

---

## 第六章：可观测与 ROI 原则

### 6.1 可观测：全链路审计

Trace 是协作事实来源，而非调试日志：

* 谁（provider/model/contributor）
* 什么时候（timestamp）
* 哪个会话/工作区（sessionId/workspaceId）
* 做了什么（eventType + tool）
* 影响哪些文件
* VCS 上下文（branch/revision）

### 6.2 ROI：用 Trace 量化决策

通过统一结构的数据，可回答：

1. **效率**：任务完成耗时、并行度收益
2. **成本**：Provider/模型/工具调用重度，是否需降级
3. **质量**：验证闭环、通过率、失败集中点

---

## 结语：从一个人到一支队伍

Agent Team 不是"取代开发者"，而是**放大开发者的能力**。

通过 Routa.js 的实践，我验证了一个想法：独立开发者可以在约束条件下，构建一个可演进的虚拟开发团队。这个团队：

* **随时可用** — 无需招聘，无需管理
* **按需扩张** — 添加新角色、新能力
* **成本可控** — 精确控制每个 Agent 的资源消耗
* **可复用** — 流程、技能、经验都可沉淀

这不是未来，而是现在。我已经用这个系统构建了 Routa.js 本身——一个真正的"自己造自己的工具"的故事。

**下一步：** 从实践中学习，持续优化 Agent Team 的设计和实现。
