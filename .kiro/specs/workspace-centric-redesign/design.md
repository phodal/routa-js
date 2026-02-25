# 设计文档：以 Workspace 为核心的架构重设计

## 概述

本设计将 Workspace 从当前的"default"占位符提升为 Routa.js 的一等公民组织单元。核心变更包括：

1. **新增 Codebase 数据模型**：将 Workspace 上的 `repoPath`/`branch` 拆分为独立的 `codebases` 表，支持一对多关系
2. **Session 归属 Workspace**：`acpSessions` 表新增 `workspaceId` 外键，Session 列表按 Workspace 过滤
3. **移除 "default" 硬编码**：删除 `ensureDefault()` 方法及所有 `workspaceId="default"` 的回退逻辑
4. **前端 Workspace 切换器**：顶部导航栏新增 Workspace 下拉切换组件，左侧边栏内容随 Workspace 切换
5. **Codebase 选择器**：聊天输入区域新增 Codebase 选择器，替代当前的 RepoPicker
6. **双后端对等实现**：Next.js 和 Rust 后端同步实现所有新增 API

### 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| Codebase 与 Workspace 的关系 | 独立表 + 外键 | 支持多仓库场景，避免 JSON 数组的查询复杂性 |
| Workspace 上下文持久化 | localStorage | 纯前端状态，无需后端参与，刷新即恢复 |
| Session 的 workspaceId | 外键约束 | 保证数据一致性，级联删除 |
| Skill 与 Workspace 关联 | 中间表 workspace_skills | Skill 本身是全局资源，安装关系是多对多 |
| 首次启动引导 | 前端 onboarding 流程 | 替代 ensureDefault()，用户显式创建 |

## 架构

### 当前架构

```mermaid
graph TB
    subgraph Frontend
        Page[page.tsx]
        SessionPanel[SessionPanel]
        SkillPanel[SkillPanel]
        ChatPanel[ChatPanel]
        RepoPicker[RepoPicker]
    end

    subgraph "Next.js API"
        SessionAPI[/api/sessions]
        NotesAPI[/api/notes]
        SkillsAPI[/api/skills]
        AcpAPI[/api/acp]
    end

    subgraph "Data Layer"
        PgSchema[schema.ts - Postgres]
        SqliteSchema[sqlite-schema.ts - SQLite]
        WorkspaceStore[PgWorkspaceStore]
    end

    Page --> SessionPanel
    Page --> ChatPanel
    ChatPanel --> RepoPicker
    Page --> SkillPanel
    SessionPanel --> SessionAPI
    ChatPanel --> AcpAPI
    SkillPanel --> SkillsAPI
    WorkspaceStore -->|ensureDefault| PgSchema
```

**问题**：
- Workspace 仅有 `ensureDefault()` 创建的 "default" 实例
- Session (`acpSessions`) 的 `workspaceId` 字段存在但始终为 "default"
- Notes API 使用 `?? "default"` 作为回退
- RepoPicker 是独立的仓库选择，与 Workspace 无关联
- Skill 是全局的，无 Workspace 隔离

### 目标架构

```mermaid
graph TB
    subgraph Frontend
        Page[page.tsx]
        WsSwitcher[WorkspaceSwitcher]
        SessionPanel[SessionPanel]
        SkillPanel[SkillPanel]
        ChatPanel[ChatPanel]
        CbPicker[CodebasePicker]
    end

    subgraph "Next.js API"
        WsAPI[/api/workspaces]
        CbAPI[/api/workspaces/:id/codebases]
        SessionAPI[/api/sessions?workspaceId=]
        NotesAPI[/api/notes?workspaceId=]
        SkillsAPI[/api/skills?workspaceId=]
        AcpAPI[/api/acp]
    end

    subgraph "Rust API (对等)"
        RustWsAPI[/api/workspaces]
        RustCbAPI[/api/workspaces/:id/codebases]
        RustSessionAPI[/api/sessions]
    end

    subgraph "Data Layer"
        Workspaces[(workspaces)]
        Codebases[(codebases)]
        Sessions[(acp_sessions)]
        WsSkills[(workspace_skills)]
    end

    Page --> WsSwitcher
    Page --> SessionPanel
    Page --> ChatPanel
    ChatPanel --> CbPicker
    Page --> SkillPanel

    WsSwitcher --> WsAPI
    CbPicker --> CbAPI
    SessionPanel --> SessionAPI
    SkillPanel --> SkillsAPI

    WsAPI --> Workspaces
    CbAPI --> Codebases
    SessionAPI --> Sessions
    SkillsAPI --> WsSkills
    Codebases -->|FK| Workspaces
    Sessions -->|FK| Workspaces
    WsSkills -->|FK| Workspaces
```


## 组件与接口

### 1. Workspace API（Next.js）

**路径**：`src/app/api/workspaces/route.ts`（已存在，需扩展）

| 方法 | 路径 | 描述 | 请求体/参数 | 响应 |
|------|------|------|-------------|------|
| POST | `/api/workspaces` | 创建 Workspace | `{ title: string }` | `{ workspace: Workspace }` |
| GET | `/api/workspaces` | 列出 Workspace | `?status=active\|archived` | `{ workspaces: Workspace[] }` |
| GET | `/api/workspaces/:id` | 获取详情 | - | `{ workspace: Workspace, codebases: Codebase[] }` |
| PATCH | `/api/workspaces/:id` | 更新 title | `{ title: string }` | `{ workspace: Workspace }` |
| PATCH | `/api/workspaces/:id/archive` | 归档 | - | `{ workspace: Workspace }` |
| DELETE | `/api/workspaces/:id` | 删除（级联） | - | `{ deleted: true }` |

**文件变更**：
- 新增 `src/app/api/workspaces/[id]/route.ts` — 单个 Workspace 的 GET/PATCH/DELETE
- 新增 `src/app/api/workspaces/[id]/archive/route.ts` — 归档端点

### 2. Codebase API（Next.js）

**路径**：`src/app/api/workspaces/[id]/codebases/route.ts`（新增）

| 方法 | 路径 | 描述 | 请求体/参数 | 响应 |
|------|------|------|-------------|------|
| POST | `/api/workspaces/:id/codebases` | 添加 Codebase | `{ repoPath, branch?, label? }` | `{ codebase: Codebase }` |
| GET | `/api/workspaces/:id/codebases` | 列出 Codebase | - | `{ codebases: Codebase[] }` |
| PATCH | `/api/workspaces/:id/codebases/:cbId` | 更新 | `{ branch?, label? }` | `{ codebase: Codebase }` |
| DELETE | `/api/workspaces/:id/codebases/:cbId` | 移除 | - | `{ deleted: true }` |

**文件变更**：
- 新增 `src/app/api/workspaces/[id]/codebases/route.ts`
- 新增 `src/app/api/workspaces/[id]/codebases/[cbId]/route.ts`

### 3. Session API 变更

**现有文件**：`src/app/api/sessions/route.ts`

变更：
- GET `/api/sessions` 新增必填参数 `?workspaceId=xxx`，不再返回全部 Session
- Session 创建时（通过 ACP 流程）必须关联 workspaceId

### 4. Skills API 变更

**现有文件**：`src/app/api/skills/route.ts`

变更：
- 新增 `workspace_skills` 中间表管理安装关系
- GET `/api/skills?workspaceId=xxx` 返回该 Workspace 已安装的 Skill
- POST `/api/skills/install` 接受 `{ workspaceId, skillId }` 安装 Skill
- DELETE `/api/skills/uninstall` 接受 `{ workspaceId, skillId }` 卸载 Skill
- 全局 catalog 查询保持不变

### 5. 前端组件

#### 5.1 WorkspaceSwitcher（新增）

**文件**：`src/client/components/workspace-switcher.tsx`

```typescript
interface WorkspaceSwitcherProps {
  currentWorkspaceId: string | null;
  onSwitch: (workspaceId: string) => void;
  onCreate: (title: string) => void;
}
```

**行为**：
- 显示在顶部导航栏，展示当前 Workspace 名称
- 点击展开下拉列表，显示所有 active Workspace
- 提供"创建新 Workspace"入口
- 切换时触发 `onSwitch`，刷新 Session 列表和 Skill 列表

#### 5.2 CodebasePicker（新增）

**文件**：`src/client/components/codebase-picker.tsx`

```typescript
interface CodebasePickerProps {
  workspaceId: string;
  selectedCodebaseId: string | null;
  onSelect: (codebase: Codebase) => void;
}
```

**行为**：
- 显示在聊天输入区域附近
- 列出当前 Workspace 下所有 Codebase
- 单个 Codebase 时自动选中
- 选中的 Codebase 的 `repoPath` 作为新 Session 的 `cwd`

#### 5.3 WorkspaceOnboarding（新增）

**文件**：`src/client/components/workspace-onboarding.tsx`

**行为**：
- 当无 active Workspace 时显示
- 引导用户创建第一个 Workspace
- 创建后自动切换到新 Workspace

#### 5.4 现有组件变更

| 组件 | 变更 |
|------|------|
| `page.tsx` | 新增 Workspace 状态管理，传递 workspaceId 给子组件 |
| `SessionPanel` | 接收 workspaceId prop，按 Workspace 过滤 Session |
| `SkillPanel` | 接收 workspaceId prop，显示 Workspace 级别的 Skill |
| `ChatPanel` | 接收 workspaceId 和 selectedCodebase，创建 Session 时传递 |
| `RepoPicker` | 被 CodebasePicker 替代（或重构为 CodebasePicker 的内部组件） |

### 6. Rust 后端对等实现

#### 6.1 新增 Rust 文件

| 文件 | 描述 |
|------|------|
| `crates/routa-core/src/models/codebase.rs` | Codebase 数据模型 |
| `crates/routa-core/src/store/codebase_store.rs` | Codebase SQLite 存储 |
| `crates/routa-server/src/api/codebases.rs` | Codebase REST API 路由 |

#### 6.2 Rust 文件变更

| 文件 | 变更 |
|------|------|
| `crates/routa-core/src/db/mod.rs` | `initialize_tables()` 新增 `codebases` 和 `workspace_skills` 表 |
| `crates/routa-core/src/state.rs` | `AppStateInner` 新增 `codebase_store` 字段 |
| `crates/routa-core/src/store/mod.rs` | 导出 `CodebaseStore` |
| `crates/routa-core/src/store/workspace_store.rs` | 移除 `ensure_default()`，新增 `update_title()`、`archive()` |
| `crates/routa-server/src/api/workspaces.rs` | 扩展 CRUD 端点，新增 PATCH/archive |
| `crates/routa-server/src/api/mod.rs` | 注册 codebases 路由 |
| `crates/routa-server/src/lib.rs` | `create_app_state()` 移除 `ensure_default()` 调用 |


## 数据模型

### 新增表：codebases

**Postgres（Drizzle schema.ts）**：

```typescript
export const codebases = pgTable("codebases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  repoPath: text("repo_path").notNull(),
  branch: text("branch"),
  label: text("label"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

**SQLite（sqlite-schema.ts）**：

```typescript
export const codebases = sqliteTable("codebases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  repoPath: text("repo_path").notNull(),
  branch: text("branch"),
  label: text("label"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
```

**Rust（db/mod.rs initialize_tables）**：

```sql
CREATE TABLE IF NOT EXISTS codebases (
    id              TEXT PRIMARY KEY,
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_path       TEXT NOT NULL,
    branch          TEXT,
    label           TEXT,
    is_default      INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_codebases_workspace_repo
    ON codebases(workspace_id, repo_path);
CREATE INDEX IF NOT EXISTS idx_codebases_workspace ON codebases(workspace_id);
```

### 新增表：workspace_skills

**Postgres**：

```typescript
export const workspaceSkills = pgTable("workspace_skills", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.skillId] })]);
```

**SQLite**：

```typescript
export const workspaceSkills = sqliteTable("workspace_skills", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  installedAt: integer("installed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.skillId] })]);
```

**Rust**：

```sql
CREATE TABLE IF NOT EXISTS workspace_skills (
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    skill_id        TEXT NOT NULL,
    installed_at    INTEGER NOT NULL,
    PRIMARY KEY (workspace_id, skill_id)
);
```

### 现有表变更

#### workspaces 表

移除 `repoPath` 和 `branch` 字段（迁移到 `codebases` 表）：

```typescript
// 变更前
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  repoPath: text("repo_path"),        // 移除
  branch: text("branch"),              // 移除
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// 变更后
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

#### acp_sessions 表

`workspaceId` 字段添加外键约束：

```typescript
// 变更前
workspaceId: text("workspace_id").notNull(),

// 变更后
workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
```

### Workspace TypeScript 模型变更

```typescript
// src/core/models/workspace.ts — 变更后
export interface Workspace {
  id: string;
  title: string;
  // repoPath 和 branch 已移除，迁移到 Codebase
  status: WorkspaceStatus;
  metadata: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

// 新增 src/core/models/codebase.ts
export interface Codebase {
  id: string;
  workspaceId: string;
  repoPath: string;
  branch?: string;
  label?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Rust 模型变更

```rust
// crates/routa-core/src/models/workspace.rs — 移除 repo_path 和 branch
pub struct Workspace {
    pub id: String,
    pub title: String,
    // repo_path 和 branch 已移除
    pub status: WorkspaceStatus,
    pub metadata: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// 新增 crates/routa-core/src/models/codebase.rs
pub struct Codebase {
    pub id: String,
    pub workspace_id: String,
    pub repo_path: String,
    pub branch: Option<String>,
    pub label: Option<String>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
```

### 数据库迁移策略

1. **创建新表**：`codebases`、`workspace_skills`
2. **迁移数据**：将现有 `workspaces.repo_path`/`branch` 数据迁移到 `codebases` 表
3. **添加外键**：`acp_sessions.workspace_id` 添加外键约束
4. **删除列**：`workspaces` 表移除 `repo_path` 和 `branch` 列
5. **清理数据**：删除 id="default" 的 Workspace 记录（如果存在）

**Drizzle 迁移文件**：
- `drizzle/0001_workspace_centric.sql`（Postgres）
- `drizzle-sqlite/0001_workspace_centric.sql`（SQLite）

### WorkspaceStore 接口变更

```typescript
// 移除 ensureDefault()，新增方法
export interface WorkspaceStore {
  save(workspace: Workspace): Promise<void>;
  get(workspaceId: string): Promise<Workspace | undefined>;
  list(): Promise<Workspace[]>;
  listByStatus(status: WorkspaceStatus): Promise<Workspace[]>;
  updateTitle(workspaceId: string, title: string): Promise<void>;
  updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<void>;
  delete(workspaceId: string): Promise<void>;
  // ensureDefault() 已移除
}
```

### 新增 CodebaseStore

```typescript
// src/core/db/pg-codebase-store.ts
export interface CodebaseStore {
  add(codebase: Codebase): Promise<void>;
  get(codebaseId: string): Promise<Codebase | undefined>;
  listByWorkspace(workspaceId: string): Promise<Codebase[]>;
  update(codebaseId: string, fields: { branch?: string; label?: string }): Promise<void>;
  remove(codebaseId: string): Promise<void>;
  getDefault(workspaceId: string): Promise<Codebase | undefined>;
  setDefault(workspaceId: string, codebaseId: string): Promise<void>;
}
```


## 正确性属性（Correctness Properties）

*属性（Property）是指在系统所有合法执行中都应成立的特征或行为——本质上是对系统行为的形式化陈述。属性是人类可读规格说明与机器可验证正确性保证之间的桥梁。*

### Property 1: Workspace 创建不变量

*For any* 非空 title 字符串，调用 Workspace 创建 API 后，返回的 Workspace 对象应满足：id 唯一且非空、status 为 "active"、title 与输入一致。多次创建产生的 id 互不相同。

**Validates: Requirements 1.1, 1.6**

### Property 2: Workspace 状态过滤正确性

*For any* 包含 active 和 archived 状态 Workspace 的集合，按 status 过滤列表时，返回的所有 Workspace 的 status 字段应与过滤条件一致。

**Validates: Requirements 1.2**

### Property 3: Workspace 详情包含 Codebase

*For any* Workspace 及其关联的 Codebase 集合，获取 Workspace 详情时，返回的 codebases 列表应包含所有已添加的 Codebase，且每个 Codebase 的字段与添加时一致。

**Validates: Requirements 1.3**

### Property 4: Workspace title 更新往返

*For any* 已存在的 Workspace 和任意新 title 字符串，更新 title 后再获取该 Workspace，返回的 title 应与更新值一致。

**Validates: Requirements 1.4**

### Property 5: Workspace 归档状态转换

*For any* active 状态的 Workspace，调用归档端点后，该 Workspace 的 status 应变为 "archived"。

**Validates: Requirements 1.5**

### Property 6: Codebase 添加/列出往返

*For any* Workspace 和任意 repoPath/branch/label 组合，向 Workspace 添加 Codebase 后，列出该 Workspace 的 Codebase 应包含刚添加的记录，且 repoPath、branch、label 字段与输入一致。

**Validates: Requirements 2.1, 2.2**

### Property 7: Codebase 移除正确性

*For any* Workspace 中已存在的 Codebase，移除后再列出该 Workspace 的 Codebase，结果中不应包含已移除的记录。

**Validates: Requirements 2.3**

### Property 8: Codebase 更新往返

*For any* 已存在的 Codebase 和任意新 branch/label 值，更新后再获取该 Codebase，返回的 branch/label 应与更新值一致。

**Validates: Requirements 2.4**

### Property 9: 首个 Codebase 默认标记

*For any* 空的 Workspace，添加第一个 Codebase 后，该 Codebase 的 isDefault 应为 true。后续添加的 Codebase 的 isDefault 应为 false。

**Validates: Requirements 2.5**

### Property 10: 级联删除完整性

*For any* Workspace 及其关联的 Codebase、Session、Note、Agent、Task 记录，删除该 Workspace 后，所有关联记录应不再存在于数据库中。

**Validates: Requirements 2.7, 3.8, 6.5**

### Property 11: 数据模型字段完整性

*For any* 通过 API 创建的 Workspace，返回的对象应包含 id、title、status、metadata、createdAt、updatedAt 字段且均非 null。*For any* 通过 API 创建的 Codebase，返回的对象应包含 id、workspaceId、repoPath、isDefault、createdAt、updatedAt 字段且均非 null。

**Validates: Requirements 3.1, 3.2**

### Property 12: Session 要求有效 Workspace

*For any* 不存在的 workspaceId，尝试创建 Session 时应失败或返回错误。Session 的 workspaceId 必须引用一个已存在的 Workspace。

**Validates: Requirements 3.3, 10.3**

### Property 13: Workspace 切换过滤 Session

*For any* 两个不同的 Workspace，各自包含不同的 Session，按 workspaceId 过滤 Session 列表时，返回的 Session 应全部属于指定的 Workspace，不包含其他 Workspace 的 Session。

**Validates: Requirements 4.3, 6.2, 6.3**

### Property 14: Codebase 选择设置 Session cwd

*For any* Workspace 中选中的 Codebase，创建新 Session 时，Session 的 cwd 字段应等于该 Codebase 的 repoPath。

**Validates: Requirements 5.2**

### Property 15: Codebase 切换不影响现有 Session

*For any* 已存在的 Session，切换当前 Workspace 的活跃 Codebase 后，该 Session 的 cwd 字段应保持不变。

**Validates: Requirements 5.5**

### Property 16: Session workspaceId 往返

*For any* 有效的 Workspace，创建 Session 时传入该 workspaceId，获取该 Session 后，workspaceId 字段应与创建时一致。

**Validates: Requirements 6.1**

### Property 17: Session 列表按创建时间倒序

*For any* 属于同一 Workspace 的 Session 列表，列表中每个 Session 的 createdAt 应大于等于其后一个 Session 的 createdAt。

**Validates: Requirements 6.4**

### Property 18: Skill 安装/列出往返

*For any* Workspace 和任意 Skill，将 Skill 安装到该 Workspace 后，列出该 Workspace 的 Skill 应包含刚安装的 Skill。

**Validates: Requirements 7.1, 7.2**

### Property 19: Skill 卸载正确性

*For any* Workspace 中已安装的 Skill，卸载后再列出该 Workspace 的 Skill，结果中不应包含已卸载的 Skill。

**Validates: Requirements 7.3**

### Property 20: 双后端 API 响应一致性

*For any* 相同的 Workspace/Codebase CRUD 请求，Next.js 后端和 Rust 后端应返回结构相同的 JSON 响应（字段名和类型一致，忽略时间戳精度差异）。

**Validates: Requirements 8.1, 8.2, 8.4**

### Property 21: Workspace 上下文持久化往返

*For any* active 状态的 Workspace，切换到该 Workspace 后，localStorage 中存储的 workspaceId 应与该 Workspace 的 id 一致。重新加载应用后，系统应自动选中该 Workspace。

**Validates: Requirements 9.1, 9.2**


## 错误处理

### API 错误响应格式

所有 API 端点使用统一的错误响应格式：

```json
{
  "error": "描述性错误信息"
}
```

### 错误场景

| 场景 | HTTP 状态码 | 错误信息 |
|------|------------|---------|
| Workspace 不存在 | 404 | `Workspace {id} not found` |
| Codebase 不存在 | 404 | `Codebase {id} not found` |
| 重复的 repoPath | 409 | `Codebase with repoPath {path} already exists in this workspace` |
| 缺少必填参数 title | 400 | `title is required` |
| 缺少必填参数 repoPath | 400 | `repoPath is required` |
| 缺少必填参数 workspaceId | 400 | `workspaceId is required` |
| 无效的 status 值 | 400 | `Invalid status: {value}. Must be 'active' or 'archived'` |
| 尝试操作已归档的 Workspace | 400 | `Workspace {id} is archived` |

### 前端错误处理

- Workspace 切换失败：显示 toast 提示，保持当前 Workspace 不变
- Codebase 添加重复：显示 "该仓库路径已存在" 提示
- 网络错误：显示重试按钮
- localStorage 读取失败：回退到第一个 active Workspace
- 已保存的 Workspace 不存在：自动回退到第一个 active Workspace

### 数据迁移错误处理

- 迁移脚本应在事务中执行，失败时回滚
- 如果 `workspaces.repo_path` 数据迁移到 `codebases` 失败，保留原始数据不删除列
- Rust 后端的 `initialize_tables()` 使用 `IF NOT EXISTS` 确保幂等性

## 测试策略

### 双重测试方法

本特性采用单元测试 + 属性测试的双重策略：

- **单元测试**：验证具体示例、边界情况和错误条件
- **属性测试**：验证跨所有输入的通用属性

两者互补，缺一不可。

### 属性测试配置

- **库选择**：
  - TypeScript：使用 `fast-check`（与现有 vitest 集成）
  - Rust：使用 `proptest`
- **每个属性测试最少运行 100 次迭代**
- **每个属性测试必须通过注释引用设计文档中的属性编号**
- **标签格式**：`Feature: workspace-centric-redesign, Property {number}: {property_text}`
- **每个正确性属性由单个属性测试实现**

### 测试分层

#### 层 1：Store 层属性测试（核心）

针对 `WorkspaceStore`、`CodebaseStore`、`SqliteWorkspaceStore`、`SqliteCodebaseStore` 的纯数据操作：

| 属性 | 测试文件 | 描述 |
|------|---------|------|
| P1 | `workspace-store.property.test.ts` | 创建不变量 |
| P2 | `workspace-store.property.test.ts` | 状态过滤 |
| P4 | `workspace-store.property.test.ts` | title 更新往返 |
| P5 | `workspace-store.property.test.ts` | 归档状态转换 |
| P6 | `codebase-store.property.test.ts` | 添加/列出往返 |
| P7 | `codebase-store.property.test.ts` | 移除正确性 |
| P8 | `codebase-store.property.test.ts` | 更新往返 |
| P9 | `codebase-store.property.test.ts` | 首个默认标记 |
| P10 | `cascade-delete.property.test.ts` | 级联删除 |
| P11 | `model-fields.property.test.ts` | 字段完整性 |

#### 层 2：API 层单元测试

针对 REST API 端点的请求/响应验证：

| 测试 | 测试文件 | 描述 |
|------|---------|------|
| Workspace CRUD | `workspace-api.test.ts` | 创建、读取、更新、归档、删除 |
| Codebase CRUD | `codebase-api.test.ts` | 添加、列出、更新、移除 |
| 409 重复 repoPath | `codebase-api.test.ts` | 重复添加返回 409 |
| 404 不存在 | `workspace-api.test.ts` | 不存在的 ID 返回 404 |
| Session 过滤 | `session-api.test.ts` | 按 workspaceId 过滤 |
| Skill 安装/卸载 | `skill-workspace.test.ts` | 安装、列出、卸载 |

#### 层 3：前端组件测试

| 测试 | 测试文件 | 描述 |
|------|---------|------|
| WorkspaceSwitcher | `workspace-switcher.test.tsx` | 渲染、切换、创建 |
| CodebasePicker | `codebase-picker.test.tsx` | 选择、自动选中 |
| WorkspaceOnboarding | `workspace-onboarding.test.tsx` | 首次启动引导 |
| localStorage 持久化 | `workspace-persistence.test.ts` | 保存/恢复 |

#### 层 4：Rust 后端属性测试

使用 `proptest` 对 Rust Store 层进行属性测试：

| 属性 | 测试文件 | 描述 |
|------|---------|------|
| P1-P11 | `tests/workspace_properties.rs` | Workspace/Codebase Store 属性 |
| P20 | `tests/api_parity.rs` | 双后端响应一致性 |

### 单元测试重点

单元测试应聚焦于：
- 具体的边界情况（空 title、超长字符串、特殊字符）
- 错误条件（404、409、400）
- 集成点（ACP Session 创建时 workspaceId 的传递）
- 数据迁移脚本的正确性

避免编写过多单元测试——属性测试已覆盖大量输入组合。
