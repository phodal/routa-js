# 功能实现总结

## 已实现的三个功能

### 1. Provider Registry (提供者注册表)

**文件位置：**
- `src/core/acp/provider-registry.ts` - 核心实现
- 更新 `src/core/acp/index.ts` - 添加导出

**功能特性：**
- **复合模型 ID 支持**：`provider:model` 格式（如 `claude:opus-4.6`）
- **模型分层配置**：`PROVIDER_MODEL_TIERS` 定义每个 provider 的 fast/balanced/smart 模型
- **provider 继承**：子 agent 可以继承父 agent 的 provider
- **模型解析工具**：
  - `parseCompoundModelId()` - 解析复合模型 ID
  - `createCompoundModelId()` - 创建复合模型 ID
  - `getModelForProvider()` - 根据 tier 获取对应模型
  - `resolveModelForSpecialist()` - 为 specialist 解析模型（考虑 provider 继承）

### 2. Delegation Depth Tracking (委派深度追踪)

**文件位置：**
- `src/core/orchestration/delegation-depth.ts` - 核心实现
- 更新 `src/core/orchestration/orchestrator.ts` - 集成到 orchestrator
- 更新 `src/core/tools/agent-tools.ts` - 添加 metadata 支持

**功能特性：**
- **最大深度限制**：2 层（用户创建 -> 第一层子 agent -> 第二层子 agent）
- **深度存储**：在 Agent.metadata.delegationDepth 中存储
- **创建前检查**：`checkDelegationDepth()` 在创建子 agent 前检查
- **深度计算**：`calculateChildDepth(parentDepth)` 返回 `parentDepth + 1`
- **元数据构建**：`buildAgentMetadata()` 创建包含深度信息的 metadata

**集成到 Orchestrator：**
```typescript
// 0. 检查委派深度
const depthCheck = await checkDelegationDepth(this.system.agentStore, callerAgentId);
if (!depthCheck.allowed) {
  return errorResult(depthCheck.error!);
}

// 4. 创建 agent 记录时添加 delegation depth metadata
const agentMetadata = buildAgentMetadata(
  calculateChildDepth(depthCheck.currentDepth),
  callerAgentId,
  specialistConfig.id
);
```

### 3. Specialist Discovery (Specialist 发现与数据库存储)

**文件位置：**
- `src/core/db/schema.ts` - 添加 `specialists` 表定义（Postgres）
- `src/core/db/sqlite-schema.ts` - 添加 `specialists` 表定义（SQLite）
- `src/core/store/specialist-store.ts` - 数据库访问层
- `src/core/specialists/specialist-db-loader.ts` - 数据库加载器
- `src/core/orchestration/specialist-prompts.ts` - 更新支持数据库加载
- `src/app/api/specialists/route.ts` - REST API 端点
- `src/client/components/specialist-manager.tsx` - Web UI 管理组件

**功能特性：**
- **多级优先级加载**：
  1. 数据库用户 specialists（最高优先级）
  2. 文件系统用户 specialists (`~/.routa/specialists/`)
  3. 内置文件 specialists (`resources/specialists/`)
  4. 硬编码 fallback（最低优先级）

- **数据库支持**：
  - Postgres 和 SQLite 双支持
  - CRUD 操作：创建、读取、更新、删除、upsert
  - 按来源/角色/enabled 状态筛选

- **REST API 端点**：
  - `GET /api/specialists` - 列出所有 specialists
  - `GET /api/specialists?id=xxx` - 获取单个 specialist
  - `POST /api/specialists` - 创建新的 specialist
  - `PUT /api/specialists` - 更新 specialist
  - `DELETE /api/specialists?id=xxx` - 删除 specialist
  - `POST /api/specialists` (action: sync) - 同步内置 specialists 到数据库

- **Web UI 组件** (`SpecialistManager`)：
  - 列表视图显示所有 specialists
  - 创建/编辑表单
  - 删除功能
  - 来源标识（user/bundled/hardcoded）
  - 同步内置 specialists 按钮

## 数据库迁移

需要运行迁移来创建 `specialists` 表。对于 Postgres：

```sql
CREATE TABLE specialists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'user',
  role TEXT NOT NULL,
  default_model_tier TEXT NOT NULL DEFAULT 'SMART',
  system_prompt TEXT NOT NULL,
  role_reminder TEXT NOT NULL DEFAULT '',
  model TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## 使用示例

### Provider Registry 使用

```typescript
import {
  parseCompoundModelId,
  resolveModelForSpecialist,
  getModelForProvider
} from "@/core/acp";

// 解析复合模型 ID
const { providerId, modelId } = parseCompoundModelId("claude:opus-4.6");
// { providerId: "claude", modelId: "opus-4.6" }

// 子 agent 继承父 agent 的 provider
const childModel = resolveModelForSpecialist(
  undefined,           // 无特定模型覆盖
  "smart",            // 使用 smart tier
  "claude:opus-4.6",  // 父 agent 的模型
  "claude"            // 父 agent 的 provider
);
// 返回: "claude:opus-4.6"
```

### Delegation Depth 使用

```typescript
import {
  checkDelegationDepth,
  calculateChildDepth,
  buildAgentMetadata
} from "@/core/orchestration/delegation-depth";

// 检查是否允许创建子 agent
const check = await checkDelegationDepth(agentStore, parentAgentId);
if (!check.allowed) {
  console.error(check.error); // "Cannot create sub-agent: maximum delegation depth (2) reached"
}

// 计算子 agent 的深度
const childDepth = calculateChildDepth(check.currentDepth);

// 构建包含深度的 metadata
const metadata = buildAgentMetadata(
  childDepth,
  parentAgentId,
  "crafter"
);
// { delegationDepth: "1", createdByAgentId: "xxx", specialist: "crafter" }
```

### Specialist API 使用

```typescript
// 获取所有 specialists
const response = await fetch("/api/specialists");
const { specialists } = await response.json();

// 创建新的 specialist
await fetch("/api/specialists", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    id: "my-specialist",
    name: "My Custom Specialist",
    description: "Does something specific",
    role: "CRAFTER",
    defaultModelTier: "BALANCED",
    systemPrompt: "You are a specialist that...",
    roleReminder: "Stay focused on your task",
  })
});

// 同步内置 specialists 到数据库
await fetch("/api/specialists", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "sync" })
});
```

## 下一步

1. **数据库迁移**：需要创建并运行迁移脚本来创建 `specialists` 表
2. **UI 集成**：将 `SpecialistManager` 组件添加到设置页面
3. **测试**：添加单元测试和集成测试
4. **文档**：更新用户文档说明如何配置自定义 specialists
