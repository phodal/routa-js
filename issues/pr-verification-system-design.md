# PR Verification System Design

## 问题分析

当前系统存在以下差距，无法支持完整的 PR 验证工作流：

### 1. Webhook 配置限制

**现状**: `GitHubWebhookConfig` 只支持单一 `triggerAgentId`

```typescript
// src/core/store/github-webhook-store.ts
interface GitHubWebhookConfig {
  triggerAgentId: string;  // 只能指定一个 agent
  promptTemplate?: string; // 静态模板
}
```

**问题**: 无法触发多阶段工作流（如 PR 验证需要：分析 → CI 检查 → E2E 测试 → 报告）

### 2. Workflow 与 Webhook 断开

**现状**: Rust 端有完整的 `WorkflowDefinition` 支持，但 TypeScript 端 webhook 没有连接

```yaml
# resources/flows/code-review.yaml - 已有工作流定义
trigger:
  type: webhook
  source: github
  event: pull_request.opened
```

**问题**: 现有工作流定义不能被 webhook 自动触发

### 3. Background Task 无依赖关系

**现状**: 每个 `BackgroundTask` 独立运行

```typescript
// src/core/models/background-task.ts
interface BackgroundTask {
  prompt: string;
  agentId: string;
  // 无 parentTaskId, dependsOn, 或 workflowId
}
```

**问题**: 无法实现"CI 通过后再运行 E2E"的条件执行

### 4. Skills 与 Specialists 分离

**现状**:
- **Skills**: `.claude/skills/` — Claude 专属，由 `skill-loader.ts` 加载
- **Specialists**: `resources/specialists/` — Routa 通用，由 `specialist-file-loader.ts` 加载

**问题**: 无法在 Specialist prompt 中注入 Skill 内容

---

## 改进方案

### 方案 1: 扩展 GitHubWebhookConfig（推荐）

```typescript
interface GitHubWebhookConfig {
  // 现有字段...
  
  // 新增: 工作流触发
  workflowId?: string;        // 引用 resources/flows/*.yaml
  
  // 新增: Skills 注入
  skillIds?: string[];        // 注入到 agent prompt 中的 skills
  
  // 新增: 条件执行
  conditions?: {
    requireLabels?: string[];     // PR 必须有这些 labels
    excludeLabels?: string[];     // PR 不能有这些 labels
    requireReviewApproval?: boolean;
    requireCIPass?: boolean;
  };
}
```

### 方案 2: 扩展 BackgroundTask 支持链式执行

```typescript
interface BackgroundTask {
  // 现有字段...
  
  // 新增: 任务编排
  workflowId?: string;            // 所属工作流
  workflowStepIndex?: number;     // 步骤序号
  parentTaskId?: string;          // 父任务（用于追踪）
  dependsOnTaskIds?: string[];    // 依赖的任务 IDs
  
  // 新增: 条件执行
  runCondition?: {
    type: "always" | "on_success" | "on_failure" | "manual";
    expression?: string;  // e.g. "${parent.output.ciPassed} === true"
  };
}
```

### 方案 3: TypeScript 端 Workflow Executor

在 `src/core/workflows/` 添加 TypeScript 版的工作流执行器：

```typescript
// src/core/workflows/workflow-executor.ts
class WorkflowExecutor {
  async executeFromWebhook(
    workflowId: string,
    payload: GitHubWebhookPayload
  ): Promise<WorkflowRun> {
    const workflow = await this.loadWorkflow(workflowId);
    const run = await this.createRun(workflow, payload);
    
    for (const step of workflow.steps) {
      if (!this.checkCondition(step, run)) continue;
      
      const task = await this.createTaskForStep(step, run);
      await this.backgroundTaskStore.save(task);
      
      // 等待任务完成或继续下一步
      if (step.waitForCompletion) {
        await this.waitForTask(task.id);
      }
    }
    
    return run;
  }
}
```

### 方案 4: Skill 注入到 Specialist

```typescript
// src/core/specialists/specialist-with-skills.ts
async function buildSpecialistPrompt(
  specialistId: string,
  skillIds: string[]
): Promise<string> {
  const specialist = await loadSpecialist(specialistId);
  const skills = await Promise.all(skillIds.map(loadSkill));
  
  return [
    specialist.systemPrompt,
    "---",
    "## Injected Skills",
    ...skills.map(s => s.content),
  ].join("\n");
}
```

---

## 实现优先级

| 优先级 | 改进项 | 影响 |
|--------|--------|------|
| P0 | Webhook → Workflow 连接 | 核心功能 |
| P1 | BackgroundTask 依赖支持 | 条件执行 |
| P2 | Skill 注入到 Specialist | 复用已有 Skills |
| P3 | TypeScript Workflow Executor | 完整 TS 支持 |

## 详细设计: PR Verification 工作流

### 工作流 YAML 示例

```yaml
# resources/flows/pr-verify.yaml
name: "PR Verification"
description: "Multi-phase PR verification workflow"
version: "1.0"

trigger:
  type: webhook
  source: github
  events:
    - pull_request.opened
    - pull_request.synchronize
    - pull_request_review.submitted

variables:
  repo: "${trigger.payload.repository.full_name}"
  pr_number: "${trigger.payload.pull_request.number}"

steps:
  - name: "Analyze Requirements"
    specialist: "pr-analyzer"
    input: |
      Analyze PR #${pr_number} in ${repo}:
      - Parse PR body for requirements
      - Extract acceptance criteria
      - Identify related issues
    output_key: "requirements"

  - name: "Check Reviews"
    specialist: "pr-reviewer"
    input: |
      Check review status for PR #${pr_number}:
      ${steps['Analyze Requirements'].output}
    output_key: "reviews"

  - name: "Verify CI"
    specialist: "ci-checker"
    input: |
      Verify CI status for PR #${pr_number}
    output_key: "ci_status"
    condition: "${steps['Check Reviews'].output.hasApproval} == true"

  - name: "E2E Verification"
    specialist: "e2e-tester"
    input: |
      Run E2E tests for PR #${pr_number}
    output_key: "e2e_results"
    condition: "${steps['Verify CI'].output.passed} == true"

  - name: "Generate Report"
    specialist: "report-generator"
    input: |
      Generate verification report:
      - Requirements: ${steps['Analyze Requirements'].output}
      - Reviews: ${steps['Check Reviews'].output}
      - CI: ${steps['Verify CI'].output}
      - E2E: ${steps['E2E Verification'].output}
    output_key: "final_report"
    actions:
      - post_pr_comment
```

### 数据库 Schema 变更

```sql
-- 1. 扩展 github_webhook_configs 表
ALTER TABLE github_webhook_configs ADD COLUMN workflow_id TEXT;
ALTER TABLE github_webhook_configs ADD COLUMN skill_ids TEXT; -- JSON array

-- 2. 新增 workflow_runs 表
CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, RUNNING, COMPLETED, FAILED
  trigger_payload TEXT, -- JSON
  variables TEXT, -- JSON resolved variables
  current_step_index INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. 扩展 background_tasks 表
ALTER TABLE background_tasks ADD COLUMN workflow_run_id TEXT;
ALTER TABLE background_tasks ADD COLUMN workflow_step_name TEXT;
ALTER TABLE background_tasks ADD COLUMN depends_on_task_ids TEXT; -- JSON array
ALTER TABLE background_tasks ADD COLUMN task_output TEXT; -- JSON output for chaining
```

### 核心组件变更

```
src/core/workflows/
├── workflow-loader.ts        # 加载 YAML 工作流定义
├── workflow-executor.ts      # 执行工作流步骤
├── workflow-store.ts         # WorkflowRun 持久化
└── workflow-condition.ts     # 条件表达式求值

src/core/webhooks/
└── github-webhook-handler.ts # 修改: 支持 workflowId 触发

src/core/background-worker/
└── index.ts                  # 修改: 支持任务依赖检查
```

## 下一步行动

### Phase 1: 基础设施 (1-2 days)
1. [ ] 添加 `workflow_runs` 表 schema
2. [ ] 扩展 `BackgroundTask` 类型添加 `workflowRunId`, `dependsOnTaskIds`
3. [ ] 扩展 `GitHubWebhookConfig` 添加 `workflowId`

### Phase 2: Workflow Executor (2-3 days)
4. [ ] 创建 `src/core/workflows/workflow-loader.ts`
5. [ ] 创建 `src/core/workflows/workflow-executor.ts`
6. [ ] 修改 `handleGitHubWebhook` 支持工作流触发

### Phase 3: 任务依赖 (1-2 days)
7. [ ] 修改 `BackgroundWorker.dispatchPending()` 检查依赖
8. [ ] 实现任务输出传递机制

### Phase 4: PR Verify 工作流 (1 day)
9. [ ] 创建 `resources/flows/pr-verify.yaml`
10. [ ] 创建 `resources/specialists/pr-analyzer.md`
11. [ ] 测试端到端流程

