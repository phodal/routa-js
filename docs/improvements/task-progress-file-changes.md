# Task Progress Bar & File Changes Improvements

## 问题分析

当前 `TaskProgressBar` 只显示一个任务，因为它只追踪 `toolKind === "task"` 的工具调用。
Copilot/Claude 使用内置的 task management 来显示 "Todos (7/8)" 格式的任务列表，
这些任务来自 agent 响应中的 **markdown checklist** 格式。

另外，当前没有追踪 file changes (如 Copilot 显示 "13 files changed +1986 -125")。

## 改进方案

### 1. 增强 TaskProgressBar - 解析 Markdown Checklist

**数据来源：** Agent 响应中的 markdown checklist 格式

```markdown
- [ ] Task 1: Analyze the codebase
- [x] Task 2: Implement feature A  
- [ ] Task 3: Write tests
- [/] Task 4: Currently working on this
```

**解析逻辑：**
- `- [ ]` → pending (未完成)
- `- [x]` → completed (已完成)
- `- [/]` → in_progress (进行中)
- `- [-]` → cancelled (已取消)

**新增文件：** `src/client/utils/checklist-parser.ts`

```typescript
export interface ChecklistItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  raw: string;
}

export function parseChecklist(content: string): ChecklistItem[];
export function hasChecklist(content: string): boolean;
```

### 2. 添加 FileChangesTracker

**数据来源：**
- `tool_call_update` 事件中的工具结果 (Edit, Write, etc.)
- `report_to_parent` 工具的 `filesModified` 字段
- `task_completion` 事件

**追踪数据：**
```typescript
export interface FileChange {
  path: string;
  linesAdded: number;
  linesRemoved: number;
  operation: "created" | "modified" | "deleted";
}

export interface FileChangesState {
  files: Map<string, FileChange>;
  totalAdded: number;
  totalRemoved: number;
}
```

**新增文件：** `src/client/utils/file-changes-tracker.ts`

### 3. 改进 session/update 事件处理

**监听事件：**
- `agent_message_chunk` - 解析 checklist 内容
- `tool_call_update` - 提取文件修改信息  
- `task_completion` - 提取 filesModified

**状态管理：**
在 `chat-panel.tsx` 中新增：
- `checklistItems: ChecklistItem[]` - 解析的任务列表
- `fileChanges: FileChangesState` - 文件修改统计

### 4. UI 更新

**TaskProgressBar 组件改进：**

```
┌─────────────────────────────────────────────────┐
│ ● Todos (3/5)  Current task title...        ▼  │
│ ═══════════════════════════════60%══════════   │
├─────────────────────────────────────────────────┤
│ [展开后显示]                                    │
│ ✓ #1 Task completed                            │
│ ✓ #2 Another completed task                    │
│ ● #3 Currently running task           running  │
│ ○ #4 Pending task                     pending  │
│ ○ #5 Another pending task             pending  │
├─────────────────────────────────────────────────┤
│ 📁 5 files changed  +286 -45                   │
└─────────────────────────────────────────────────┘
```

## 实现步骤

1. **创建 `checklist-parser.ts`** - Markdown checklist 解析器
2. **创建 `file-changes-tracker.ts`** - 文件变更追踪器  
3. **更新 `chat-panel.tsx`** - 添加状态管理和事件监听
4. **更新 `task-progress-bar.tsx`** - 增强 UI 显示

## 文件变更清单

- [ ] `src/client/utils/checklist-parser.ts` (新增)
- [ ] `src/client/utils/file-changes-tracker.ts` (新增)
- [ ] `src/client/components/chat-panel.tsx` (修改)
- [ ] `src/client/components/task-progress-bar.tsx` (修改)

