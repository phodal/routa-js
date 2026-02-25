# Claude Code Agent 在 VS Code 插件中的集成分析

> 基于对 GitHub Copilot Chat v0.37.8（`copilot-chat`）插件源码的逆向分析。

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    VS Code Chat UI                       │
└────────────────────────┬────────────────────────────────┘
                         │ vscode.chat API
┌────────────────────────▼────────────────────────────────┐
│          Copilot Chat Extension (extension.js)           │
│                                                          │
│  ┌─────────────────┐    ┌──────────────────────────┐    │
│  │ CustomAgent      │    │  ClaudeCodeSession        │    │
│  │ Provider         │    │  (进程管理 + 消息路由)    │    │
│  └────────┬────────┘    └──────────┬───────────────┘    │
│           │                        │                     │
│           └────────────┬───────────┘                     │
│                        │ Node child_process.spawn        │
└────────────────────────┼────────────────────────────────┘
                         │ JSONL stream (stdin/stdout)
┌────────────────────────▼────────────────────────────────┐
│              dist/cli.js (Claude Code CLI v2.1.5)        │
│                    Anthropic 官方打包                     │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│              Anthropic API / Claude Models               │
│         (通过插件内置代理服务器转发，注入认证)            │
└─────────────────────────────────────────────────────────┘
```

---

## 2. 激活入口：`onCustomAgentProvider`

### 2.1 package.json 激活事件

```json
{
  "activationEvents": [
    "onStartupFinished",
    "onCustomAgentProvider"
  ]
}
```

`onCustomAgentProvider` 是 VS Code 的 proposed API，当有 chat participant 需要自定义 agent provider 时触发。

### 2.2 注册接口

```typescript
// VS Code proposed API: chatParticipantAdditions
interface vscode.chat {
  registerCustomAgentProvider(provider: CustomAgentProvider): Disposable;
}

interface CustomAgentProvider {
  provideAgents(): CustomAgentDefinition[] | Promise<CustomAgentDefinition[]>;
}
```

### 2.3 插件中的注册代码（混淆还原）

```typescript
// extension.js 中的 hG 类（PromptFiles 服务）
class PromptFiles extends Disposable {
  constructor(instantiationService, configService) {
    super();
    this.id = "PromptFiles";

    if ("registerCustomAgentProvider" in vscode.chat) {
      // 注册组织级自定义 agents（需要配置开启）
      if (configService.getConfig(Config.EnableOrganizationCustomAgents)) {
        const orgProvider = instantiationService.createInstance(
          new ServiceIdentifier(OrganizationAgentProvider)
        );
        this._register(vscode.chat.registerCustomAgentProvider(orgProvider));
      }

      // 注册本地 .prompt.md 文件定义的 agents
      const localProvider = instantiationService.createInstance(LocalAgentProvider);
      this._register(vscode.chat.registerCustomAgentProvider(localProvider));
    }
  }
}
```

### 2.4 Agent 定义格式（`.prompt.md` 文件）

```markdown
---
name: myAgent
description: 这个 agent 做什么
agent: agent          # 声明为 agent 类型
argument-hint: 可选的参数提示
tools: ['edit', 'search']
---

这里是 agent 的 system prompt 内容...
```

---

## 3. 子进程管理：Node.js `child_process`

### 3.1 核心启动函数（混淆还原：`$ti`）

```typescript
function queryClaudeCode({ prompt, options }) {
  const {
    systemPrompt,
    settingSources,
    sandbox,
    ...restOptions
  } = options ?? {};

  // 处理 system prompt
  let systemPromptStr = "";
  let systemPromptAppend;
  if (systemPrompt === undefined) {
    systemPromptStr = "";
  } else if (typeof systemPrompt === "string") {
    systemPromptStr = systemPrompt;
  } else if (systemPrompt.type === "preset") {
    systemPromptAppend = systemPrompt.append;
  }

  // 定位 cli.js 可执行文件
  let cliPath = restOptions.pathToClaudeCodeExecutable;
  if (!cliPath) {
    const currentFile = fileURLToPath(require("url").pathToFileURL(__filename).href);
    const extensionDir = join(currentFile, "..");
    cliPath = join(extensionDir, "cli.js"); // dist/cli.js
  }

  // 标记 SDK 版本（用于 CLI 内部行为判断）
  process.env.CLAUDE_AGENT_SDK_VERSION = "0.2.5";

  // 启动参数
  const {
    abortController = new AbortController(),
    additionalDirectories = [],
    agents,
    allowedTools = [],
    betas,
    canUseTool,
    continue: continueSession,
    cwd,
    disallowedTools = [],
    tools,
    env,
    executable = isRunningInBun() ? "bun" : "node",
    executableArgs = [],
    extraArgs = {},
    fallbackModel,
    // ...更多参数
  } = restOptions;

  // 通过 child_process.spawn 启动
  const child = spawn(executable, [
    ...executableArgs,
    cliPath,
    "--print-sdk",          // 以 SDK 模式运行（输出 JSONL）
    "--system-prompt", systemPromptStr,
    // ...其他 CLI 参数
  ], {
    env: { ...process.env, ...env },
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
```

### 3.2 实际会话启动（`ClaudeCodeSession._startSession`）

```typescript
async _startSession(token) {
  const workspaceFolders = this.workspaceService.getWorkspaceFolders().map(f => f.fsPath);
  const additionalDirs = workspaceFolders;
  let cwd;

  if (workspaceFolders.length === 1) {
    cwd = workspaceFolders[0];
    additionalDirs = [];
  }

  const pathSeparator = isMac ? ":" : ";";

  const sessionOptions = {
    cwd,
    additionalDirectories: additionalDirs,
    allowDangerouslySkipPermissions: true,  // 插件内部信任模式
    abortController: this._abortController,
    executable: process.execPath,           // 使用 VS Code 内置 Node.js
    disallowedTools: ["WebSearch"],         // 禁用 WebSearch（由插件自己处理）

    env: {
      ...process.env,
      // 关键：将 API 请求代理到插件内置服务器
      ANTHROPIC_BASE_URL: `http://localhost:${this.serverConfig.port}`,
      ANTHROPIC_API_KEY: this.serverConfig.nonce,  // 临时 nonce 作为认证
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      USE_BUILTIN_RIPGREP: "0",
      PATH: `${appRoot}/node_modules/@vscode/ripgrep/bin${pathSeparator}${process.env.PATH}`,
    },

    resume: this.sessionId,                 // 恢复上次会话
    model: this._currentModelId,
    permissionMode: this._currentPermissionMode,

    hooks: this._buildHooks(token),         // 工具调用钩子

    // 工具权限检查回调
    canUseTool: async (toolName, toolInput) => {
      if (!this._currentRequest) return { behavior: "deny", message: "No active request" };
      return this.toolPermissionService.canUseTool(toolName, toolInput, {
        toolInvocationToken: this._currentRequest.toolInvocationToken,
        permissionMode: this._currentPermissionMode,
        stream: this._currentRequest.stream,
      });
    },

    systemPrompt: { type: "preset", preset: "claude_code" },
    settingSources: ["user", "project", "local"],

    stderr: (line) => this.logService.error(`claude-agent-sdk stderr: ${line}`),
  };

  this._queryGenerator = await this.claudeCodeService.query({
    prompt: this._createPromptIterable(),
    options: sessionOptions,
  });
}
```

### 3.3 进程生命周期管理

```typescript
class ClaudeCodeSession {
  private _abortController = new AbortController();
  private _queryGenerator: AsyncGenerator | undefined;
  private _promptQueue: PendingPrompt[] = [];

  dispose() {
    // 中止所有进行中的请求
    this._abortController.abort();
    // 清空队列，通知所有等待者
    this._promptQueue.forEach(p => p.deferred.error(new Error("Session disposed")));
    this._promptQueue = [];
    super.dispose();
  }

  // 设置变更时重启会话（保持 resume 连续性）
  _restartSession() {
    this._queryGenerator = undefined;
    this._abortController.abort();
    this._abortController = new AbortController();
    // 下次 invoke 时会自动重新启动
  }
}
```

---

## 4. JSONL Stream IPC 协议

### 4.1 消息流向

```
VS Code Extension                    Claude Code CLI (cli.js)
      │                                        │
      │──── stdin: prompt (JSON) ─────────────▶│
      │                                        │ (调用 Anthropic API)
      │◀─── stdout: JSONL messages ────────────│
      │                                        │
```

### 4.2 消息类型定义

CLI 通过 stdout 输出 JSONL（每行一个 JSON 对象），共有三种顶层消息类型：

#### `assistant` 消息
```typescript
interface AssistantMessage {
  type: "assistant";
  session_id: string;
  message: {
    role: "assistant";
    content: AssistantContent[];
  };
}

type AssistantContent =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
```

#### `user` 消息（工具结果回传）
```typescript
interface UserMessage {
  type: "user";
  session_id: string;
  message: {
    role: "user";
    content: UserContent[];
  };
}

type UserContent =
  | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean };
```

#### `result` 消息（轮次结束）
```typescript
interface ResultMessage {
  type: "result";
  session_id: string;
  subtype: "success" | "error_max_turns" | "error_during_execution";
  num_turns?: number;
}
```

### 4.3 插件侧消息处理（完整流程）

`tool_use` 的渲染分两个阶段，**不是**在收到 `assistant` 消息时立即渲染，而是等到对应的 `tool_result` 回来后才真正 push 到 stream：

```
assistant 消息（tool_use）          user 消息（tool_result）
        │                                    │
        ▼                                    ▼
  暂存到 pendingToolUses Map          processToolResult()
  （不 push 到 stream）                      │
                                    调用 U2e() 生成 ToolInvocation
                                             │
                                    r.push(invocation) → 渲染到 UI
```

```typescript
// 阶段一：收到 assistant 消息，tool_use 只暂存
handleAssistantMessage(message, stream, pendingToolUses) {
  for (const content of message.message.content) {
    if (content.type === "text")
      stream.markdown(content.text);           // 文本立即渲染
    else if (content.type === "thinking")
      stream.push(new ThinkingPart(content.thinking));  // 思考立即渲染
    else if (content.type === "tool_use")
      pendingToolUses.set(content.id, content); // tool_use 只暂存，不渲染
  }
}

// 阶段二：收到 user 消息（tool_result），才真正渲染
handleUserMessage(message, stream, pendingToolUses, toolInvocationToken, token) {
  if (Array.isArray(message.message.content))
    for (const content of message.message.content)
      if (content.type === "tool_result")
        processToolResult(content, stream, pendingToolUses, toolInvocationToken, token);
}

processToolResult(toolResult, stream, pendingToolUses, toolInvocationToken, token) {
  const toolUse = pendingToolUses.get(toolResult.tool_use_id);
  if (!toolUse) return;
  pendingToolUses.delete(toolResult.tool_use_id);

  // 调用分发器，生成 ToolInvocation
  const invocation = U2e(toolUse);  // 按工具名差异化渲染

  if (invocation) {
    invocation.isError = toolResult.is_error;
    // 用户拒绝执行时，标记为未确认
    if (toolResult.content === "The user declined to run the tool")
      invocation.isConfirmed = false;
  }

  // TodoWrite 有额外的副作用：同步到 VS Code TODO 面板
  if (toolUse.name === "TodoWrite")
    processTodoWriteTool(toolUse, toolInvocationToken, token);

  // 最终 push 到 stream（invocation 为 undefined 时跳过）
  if (invocation) stream.push(invocation);
}

// TodoWrite 副作用：将 Claude 的 todo 列表同步到 VS Code manage_todo_list 工具
processTodoWriteTool(toolUse, toolInvocationToken, token) {
  const input = toolUse.input;
  toolsService.invokeTool("manage_todo_list", {
    input: {
      operation: "write",
      todoList: input.todos.map((todo, index) => ({
        id: index,
        title: todo.content,
        description: "",
        status: todo.status === "pending"     ? "not-started"
               : todo.status === "in_progress" ? "in-progress"
               : "completed",
      })),
    },
    toolInvocationToken,
  }, token);
}
```

### 4.4 tool_use 按工具类型的差异化渲染（U2e 分发器）

`U2e()` 是核心分发函数，按工具名做 switch-case，为每种工具生成不同的 `ToolInvocation`（`rS` 类实例）：

```typescript
// U2e() —— tool_use 渲染分发器（混淆还原）
function U2e(toolUse: ToolUseContent): ToolInvocation | undefined {
  const invocation = new ToolInvocation(toolUse.name, toolUse.id, /*confirmed=*/false);
  invocation.isConfirmed = true;

  switch (toolUse.name) {

    // ── Bash：不设 invocationMessage，改用 toolSpecificData ──
    // toolSpecificData.commandLine 触发 VS Code 终端命令行专属 UI 组件
    case "Bash":
      invocation.invocationMessage = "";
      invocation.toolSpecificData = {
        commandLine: { original: toolUse.input?.command },
        language: "bash",
      };
      break;

    // ── Read：显示可点击的文件路径链接 ──
    // input.file_path → "[](vscode-file://...)" Markdown 链接
    case "Read":
      const filePath = toolUse.input?.file_path ?? "";
      invocation.invocationMessage = new MarkdownString(
        l10n.t("Read {0}", filePath ? toVscodeFileLink(filePath) : "")
      );
      break;

    // ── LS（列目录）：同 Read，用 input.path ──
    case "LS":
      const dirPath = toolUse.input?.path ?? "";
      invocation.invocationMessage = new MarkdownString(
        l10n.t("Read {0}", dirPath ? toVscodeFileLink(dirPath) : "")
      );
      break;

    // ── Glob：显示 glob 模式字符串 ──
    case "Glob":
      invocation.invocationMessage = new MarkdownString(
        l10n.t("Searched for files matching `{0}`", toolUse.input?.pattern ?? "")
      );
      break;

    // ── Grep：显示正则模式字符串 ──
    case "Grep":
      invocation.invocationMessage = new MarkdownString(
        l10n.t("Searched for regex `{0}`", toolUse.input?.pattern ?? "")
      );
      break;

    // ── Edit / MultiEdit / Write：返回 undefined，完全跳过 ToolInvocation ──
    // 由 EditTracker（PreToolUse/PostToolUse hook）接管：
    //   _onWillEditTool → stream.externalEdit() 展示 diff UI
    //   _onDidEditTool  → completeEdit() 完成追踪
    // Fst = ["Edit", "MultiEdit", "Write", "NotebookEdit"]
    case "Edit":
    case "MultiEdit":
    case "Write":
      return undefined;

    // ── ExitPlanMode：显示 Claude 生成的完整计划文本 ──
    // input.plan 包含 Claude 在 Plan 模式下制定的执行计划
    case "ExitPlanMode":
      invocation.invocationMessage = l10n.t(
        "Here is Claude's plan:\n{0}", toolUse.input?.plan ?? ""
      );
      break;

    // ── Task（子 agent）：显示任务描述 ──
    // input.description 是传给子 agent 的任务说明
    // 注意：消息是 "Completed Task"，说明此时子任务已执行完毕
    case "Task":
      invocation.invocationMessage = new MarkdownString(
        l10n.t('Completed Task: "{0}"', toolUse.input?.description ?? "")
      );
      break;

    // ── TodoWrite：返回 undefined，跳过 ToolInvocation ──
    // 但在 processToolResult 中有额外副作用：
    // 调用 manage_todo_list 工具将 todo 同步到 VS Code TODO 面板
    case "TodoWrite":
      return undefined;

    // ── 其余所有工具（WebFetch、WebSearch、Skill、NotebookEdit 等）──
    // 通用兜底：显示 "Used tool: <name>"
    // 注意：NotebookEdit 虽然在 Fst（edit tools）里，但 switch 没有单独 case，
    // 走 default，不会触发 EditTracker，这是一个与 Edit/Write 不一致的地方
    default:
      invocation.invocationMessage = l10n.t("Used tool: {0}", toolUse.name);
      break;
  }

  return invocation;
}

// 辅助：将文件路径转为 VS Code 可点击的 Markdown 链接
// 格式：[](vscode-file://vscode-app/path/to/file)
function toVscodeFileLink(filePath: string): string {
  return `[](${vscode.Uri.file(filePath).toString()})`;
}
```

各工具渲染策略完整汇总：

| 工具名 | 渲染路径 | UI 表现 | 备注 |
|--------|----------|---------|------|
| `Bash` | `toolSpecificData.commandLine` | 终端命令行专属 UI | 唯一使用 `toolSpecificData` 的工具 |
| `Read` | `invocationMessage` = 文件链接 | 可点击文件路径 | `input.file_path` |
| `LS` | `invocationMessage` = 目录链接 | 可点击目录路径 | `input.path` |
| `Glob` | `invocationMessage` = glob 模式 | 显示搜索模式 | `input.pattern` |
| `Grep` | `invocationMessage` = 正则模式 | 显示搜索模式 | `input.pattern` |
| `Edit` | 返回 `undefined` | diff UI | 由 `EditTracker` 接管 |
| `MultiEdit` | 返回 `undefined` | diff UI | 由 `EditTracker` 接管 |
| `Write` | 返回 `undefined` | diff UI | 由 `EditTracker` 接管 |
| `ExitPlanMode` | `invocationMessage` = 计划文本 | 显示完整计划 | `input.plan` |
| `Task` | `invocationMessage` = 任务描述 | "Completed Task: ..." | `input.description`，子 agent 完成后显示 |
| `TodoWrite` | 返回 `undefined` + 副作用 | 同步到 TODO 面板 | 调用 `manage_todo_list` 工具 |
| `NotebookEdit` | `default` 兜底 | "Used tool: NotebookEdit" | 虽在 edit tools 列表但无专属 case |
| `WebFetch` | `default` 兜底 | "Used tool: WebFetch" | — |
| `WebSearch` | `default` 兜底 | "Used tool: WebSearch" | 实际被 `disallowedTools` 禁用 |
| `Skill` | `default` 兜底 | "Used tool: Skill" | — |
| 其他 MCP 工具 | `default` 兜底 | "Used tool: <name>" | — |

**三个关键设计细节**：

1. **渲染时机**：`tool_use` 在 `assistant` 消息阶段只暂存，收到 `tool_result` 后才渲染。这意味着 UI 展示的是"已完成"的工具调用，而非"正在执行"。

2. **`Bash` 的特殊性**：是唯一设置 `toolSpecificData` 而非 `invocationMessage` 的工具，触发 VS Code 的终端命令行专属渲染组件。

3. **`NotebookEdit` 的不一致**：它被列在 `Fst = ["Edit","MultiEdit","Write","NotebookEdit"]`（edit tools，会触发 EditTracker hook），但 `U2e()` 的 switch 里没有对应 case，走 `default` 显示通用文本，不会返回 `undefined`。这意味着 `NotebookEdit` 既会触发 EditTracker（展示 diff），又会显示 "Used tool: NotebookEdit" 文本，与 `Edit`/`Write` 的纯 diff 展示不同。

### 4.4 Prompt 输入格式

插件通过 async iterable 向 CLI 持续输入 prompt：

```typescript
async *_createPromptIterable() {
  for (;;) {
    const request = await this._getNextRequest();
    this._currentRequest = { stream: request.stream, ... };

    yield {
      type: "user",
      message: {
        role: "user",
        content: request.prompt,  // 用户输入的文本
      },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? "",
    };

    // 等待本轮完成（result 消息触发）
    await request.deferred.p;
  }
}
```

---

## 5. 模型选择机制

### 5.1 可用模型列表（从代码中提取）

```typescript
// 模型 ID 常量
const MODEL_IDS = {
  CLAUDE_CODE:    "claude-code-20250219",
  SONNET_4:       "claude-sonnet-4",       // 默认，平衡性能
  OPUS_4:         "claude-opus-4",         // 最强推理
  HAIKU_4:        "claude-haiku-4",        // 快速轻量
  OPUS_4_5:       "claude-opus-4-5",
  SONNET_4_5:     "claude-sonnet-4-5",
};

// 各模型 max output tokens
function getMaxOutputTokens(modelId: string): number {
  const id = modelId.toLowerCase();
  if (id.includes("3-5"))           return 8192;
  if (id.includes("claude-3-opus")) return 4096;
  if (id.includes("opus-4-5"))      return 64000;
  if (id.includes("opus-4"))        return 32000;
  if (id.includes("sonnet-4") || id.includes("haiku-4")) return 64000;
  return 32000; // 默认
}

// context window
function getContextWindow(modelId: string, betas?: string[]): number {
  if (modelId.includes("[1m]") || betas?.includes("context-1m-2025-08-07")) {
    return 1_000_000; // 1M context（需要 beta）
  }
  return 200_000; // 默认 200K
}
```

### 5.2 UI 中的模型选项

```typescript
// 用户可选的模型（在 agent 配置 UI 中）
const MODEL_OPTIONS = [
  {
    id: "sonnet",
    label: "Sonnet",
    description: "Balanced performance - best for most agents",
    isDefault: true,
  },
  {
    id: "opus",
    label: "Opus",
    description: "Most capable for complex reasoning tasks",
  },
  {
    id: "haiku",
    label: "Haiku",
    description: "Fast and efficient for simple tasks",
  },
  {
    id: "inherit",
    label: "Inherit from parent",
    description: "Use the same model as the main conversation",
  },
];
```

### 5.3 模型切换

```typescript
// 会话中动态切换模型
async _setModel(modelId: string) {
  this._currentModelId = modelId;
  // 通过 SDK 的 setModel 接口通知 CLI
}

// 启动时传入
const sessionOptions = {
  model: this._currentModelId,
  fallbackModel: "claude-sonnet-4",  // 主模型不可用时的备选
};
```

### 5.4 Beta 特性控制

```typescript
// 支持的 beta headers
const SUPPORTED_BETAS = new Set([
  "interleaved-thinking-2025-05-14",   // 交错思考
  "context-1m-2025-08-07",             // 1M context window
  "tool-search-tool-2025-10-19",       // 工具搜索
  "tool-examples-2025-10-29",          // 工具示例
]);

// Claude Code 专属 beta
const CLAUDE_CODE_BETAS = new Set([
  "claude-code-20250219",
  "interleaved-thinking-2025-05-14",
  "fine-grained-tool-streaming-2025-05-14",
  "context-management-2025-06-27",
]);
```

---

## 6. 可用工具（Tools）

### 6.1 VS Code 内置工具（注册给 Claude 使用）

这些工具通过 `package.json` 的 `languageModelTools` 贡献点注册：

| 工具名 | 引用名 | 功能 |
|--------|--------|------|
| `copilot_searchCodebase` | `codebase` | 语义搜索代码库 |
| `search_subagent` | `searchSubagent` | 启动搜索子 agent |
| `copilot_searchWorkspaceSymbols` | `symbols` | 搜索代码符号 |
| `copilot_listCodeUsages` | `usages` | 列出符号引用 |
| `copilot_getVSCodeAPI` | `vscodeAPI` | 获取 VS Code API 文档 |
| `copilot_findFiles` | `fileSearch` | 按 glob 查找文件 |
| `copilot_findTextInFiles` | `textSearch` | 全文搜索 |
| `copilot_applyPatch` | `applyPatch` | 应用 diff patch |
| `copilot_readFile` | `readFile` | 读取文件内容 |
| `copilot_listDirectory` | `listDirectory` | 列出目录 |
| `copilot_getErrors` | `problems` | 获取编译/lint 错误 |
| `copilot_readProjectStructure` | — | 获取项目文件树 |
| `copilot_getChangedFiles` | `changes` | 获取 git diff |
| `copilot_testFailure` | `testFailure` | 获取测试失败信息 |
| `copilot_memory` | `memory` | 存储代码库记忆 |
| `copilot_insertEdit` | `insertEdit` | 插入/修改代码 |
| `copilot_createFile` | `createFile` | 创建新文件 |
| `copilot_createDirectory` | `createDirectory` | 创建目录 |
| `copilot_runVscodeCommand` | `runCommand` | 执行 VS Code 命令 |

### 6.2 Claude Code CLI 内置工具

CLI 自身内置的工具（在 `cli.js` 中定义）：

```typescript
// 文件操作
"Read"          // 读取文件
"Write"         // 写入文件
"Edit"          // 编辑文件（字符串替换）
"NotebookEdit"  // 编辑 Jupyter Notebook
"Glob"          // 文件 glob 匹配
"Grep"          // 文本搜索

// 执行
"Bash"          // 执行 shell 命令

// 网络
"WebFetch"      // 获取网页内容
"WebSearch"     // 网络搜索（插件中被禁用）

// Agent 协作
"Task"          // 启动子 agent 任务
"Skill"         // 调用技能

// 任务管理
"TodoWrite"     // 写入 TODO 列表（插件会拦截并同步到 VS Code）
```

### 6.3 工具权限分组

```typescript
const TOOL_PERMISSION_GROUPS = [
  {
    id: "readonly",
    label: "Read-only tools",
    tools: ["Read", "Glob", "Grep", "WebFetch", "WebSearch"],
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
    tools: [],  // 动态注册
  },
  {
    id: "other",
    label: "Other tools",
    tools: ["Skill", "Task", "TodoWrite"],
  },
];
```

### 6.4 工具注册到 SDK

```typescript
// 将 VS Code 工具注册给 Claude Code SDK
function createSdkAgent(agentDef) {
  const sdkAgent = new ClaudeCodeSDK();

  agentDef.tools.forEach(tool => {
    sdkAgent.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      tool.handler,
    );
  });

  return { type: "sdk", name: agentDef.name, instance: sdkAgent };
}
```

---

## 7. 认证代理机制

插件不直接暴露 Anthropic API Key 给 CLI，而是通过内置代理服务器转发：

```typescript
// 启动本地代理服务器
const serverConfig = {
  port: <随机端口>,
  nonce: <随机 nonce>,  // 作为临时 API Key
};

// CLI 的环境变量
env: {
  ANTHROPIC_BASE_URL: `http://localhost:${serverConfig.port}`,
  ANTHROPIC_API_KEY: serverConfig.nonce,  // CLI 用这个 nonce 认证
}

// 代理服务器收到请求后：
// 1. 验证 nonce
// 2. 替换为真实的 GitHub Copilot token
// 3. 转发到 Anthropic API
```

---

## 8. 工具调用钩子（Hooks）

```typescript
_buildHooks(token) {
  const hooks = getRegisteredHooks(this.instantiationService);

  // PreToolUse：工具调用前
  hooks.PreToolUse = hooks.PreToolUse ?? [];
  hooks.PreToolUse.push({
    matcher: EDIT_TOOLS.join("|"),  // 匹配编辑类工具
    hooks: [
      (toolName, toolUseId) => this._onWillEditTool(toolName, toolUseId, token),
    ],
  });

  // PostToolUse：工具调用后
  hooks.PostToolUse = hooks.PostToolUse ?? [];
  hooks.PostToolUse.push({
    matcher: EDIT_TOOLS.join("|"),
    hooks: [
      (toolName, toolUseId) => this._onDidEditTool(toolName, toolUseId),
    ],
  });

  return hooks;
}

// 编辑前：追踪受影响的文件 URI，用于 diff 展示
async _onWillEditTool(toolName, toolUseId, token) {
  const affectedUris = getAffectedUris(toolName);
  await this._editTracker.trackEdit(toolUseId, affectedUris, stream, token);
  return {};
}

// 编辑后：完成编辑追踪
async _onDidEditTool(toolName, toolUseId) {
  await this._editTracker.completeEdit(toolUseId);
  return {};
}
```

---

## 9. 会话持久化

Claude Code 会话以 JSONL 文件形式存储在 `~/.claude/projects/<slug>/` 目录下：

```typescript
// 会话文件路径
const sessionDir = path.join(
  os.homedir(),
  ".claude",
  "projects",
  computeFolderSlug(workspaceFolder),
);

// 每个会话一个 .jsonl 文件
// 文件名 = session UUID

// 恢复会话
const sessionOptions = {
  resume: this.sessionId,  // 传入上次的 session ID
};
```

---

## 10. 关键环境变量

| 变量名 | 作用 |
|--------|------|
| `CLAUDE_AGENT_SDK_VERSION` | 标记 SDK 版本（`0.2.5`），CLI 据此调整行为 |
| `ANTHROPIC_BASE_URL` | 代理服务器地址（插件注入） |
| `ANTHROPIC_API_KEY` | 临时 nonce（插件注入，非真实 key） |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | 禁用遥测等非必要流量 |
| `CLAUDE_CONFIG_DIR` | Claude 配置目录（默认 `~/.claude`） |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | 调试日志目录 |
| `USE_BUILTIN_RIPGREP` | 是否使用内置 ripgrep（插件设为 `0`，用 VS Code 的） |
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 最大输出 token 数（默认 32000，上限 64000） |
| `BASH_MAX_OUTPUT_LENGTH` | Bash 工具最大输出长度（默认 30000，上限 150000） |

---

## 参考

- 插件版本：`copilot-chat` v0.37.8
- Claude Code CLI 版本：v2.1.5（打包在 `dist/cli.js`）
- SDK 版本：`CLAUDE_AGENT_SDK_VERSION=0.2.5`
- VS Code 最低版本要求：`^1.109.0-20260124`
