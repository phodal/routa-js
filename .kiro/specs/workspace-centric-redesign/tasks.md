# 实施计划：以 Workspace 为核心的架构重设计

## 概述

本计划将 Workspace 从 "default" 占位符提升为一等公民，按以下顺序递增实施：数据模型 → Store 层 → API 层 → 前端组件 → Rust 后端对等实现。每个步骤在前一步骤基础上构建，确保无孤立代码。

## 任务

- [ ] 1. 数据模型与 Schema 变更
  - [ ] 1.1 更新 Workspace TypeScript 模型，移除 repoPath 和 branch 字段
    - 修改 `src/core/models/workspace.ts`，从 `Workspace` 接口中移除 `repoPath` 和 `branch`
    - 修改 `src/core/models/index.ts`，导出新增的 Codebase 模型
    - _需求: 3.1, 10.1_

  - [ ] 1.2 新增 Codebase TypeScript 模型
    - 创建 `src/core/models/codebase.ts`，定义 `Codebase` 接口（id, workspaceId, repoPath, branch, label, isDefault, createdAt, updatedAt）
    - _需求: 3.2_

  - [ ] 1.3 更新 Postgres Drizzle schema
    - 修改 `src/core/db/schema.ts`：从 `workspaces` 表移除 `repoPath`/`branch` 列
    - 新增 `codebases` 表定义（含外键和唯一索引）
    - 新增 `workspaceSkills` 中间表定义
    - 为 `acpSessions.workspaceId` 添加外键约束
    - _需求: 3.1, 3.2, 3.3, 3.7_

  - [ ] 1.4 更新 SQLite Drizzle schema
    - 修改 `src/core/db/sqlite-schema.ts`：与 Postgres schema 保持结构一致
    - 新增 `codebases` 表和 `workspaceSkills` 表的 SQLite 版本
    - _需求: 3.7_

  - [ ] 1.5 创建数据库迁移文件
    - 创建 `drizzle/0001_workspace_centric.sql`（Postgres 迁移）
    - 创建 `drizzle-sqlite/0001_workspace_centric.sql`（SQLite 迁移）
    - 迁移内容：创建新表、迁移 repo_path/branch 数据到 codebases、添加外键、删除旧列
    - _需求: 3.1, 3.2, 3.3, 3.7, 3.8_

- [ ] 2. Store 层实现（Next.js）
  - [ ] 2.1 重构 WorkspaceStore 接口与实现
    - 修改 `src/core/db/pg-workspace-store.ts`：移除 `ensureDefault()` 方法
    - 新增 `listByStatus(status)`, `updateTitle(id, title)`, `updateStatus(id, status)`, `delete(id)` 方法
    - 更新 `save()` 方法，不再处理 repoPath/branch
    - _需求: 1.1, 1.2, 1.4, 1.5, 1.6, 10.5_

  - [ ]* 2.2 编写 WorkspaceStore 属性测试
    - **Property 1: Workspace 创建不变量**
    - **Property 2: Workspace 状态过滤正确性**
    - **Property 4: Workspace title 更新往返**
    - **Property 5: Workspace 归档状态转换**
    - **验证: 需求 1.1, 1.2, 1.4, 1.5, 1.6**

  - [ ] 2.3 新增 CodebaseStore 接口与实现
    - 创建 `src/core/store/codebase-store.ts`（接口定义）
    - 创建 `src/core/db/pg-codebase-store.ts`（Postgres 实现）
    - 实现 `add()`, `get()`, `listByWorkspace()`, `update()`, `remove()`, `getDefault()`, `setDefault()` 方法
    - 首个 Codebase 添加时自动设置 isDefault=true
    - 添加 repoPath 唯一性校验（同一 Workspace 内）
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 2.4 编写 CodebaseStore 属性测试
    - **Property 6: Codebase 添加/列出往返**
    - **Property 7: Codebase 移除正确性**
    - **Property 8: Codebase 更新往返**
    - **Property 9: 首个 Codebase 默认标记**
    - **验证: 需求 2.1, 2.2, 2.3, 2.4, 2.5**

  - [ ] 2.5 更新 SQLite Store 实现
    - 修改 `src/core/db/sqlite-stores.ts`：更新 SqliteWorkspaceStore（移除 ensureDefault，新增方法）
    - 新增 SqliteCodebaseStore 实现
    - _需求: 3.7, 10.5_

  - [ ]* 2.6 编写级联删除与字段完整性属性测试
    - **Property 10: 级联删除完整性**
    - **Property 11: 数据模型字段完整性**
    - **验证: 需求 2.7, 3.1, 3.2, 3.8, 6.5**

- [ ] 3. 检查点 - 确保所有 Store 层测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 4. Workspace API 端点（Next.js）
  - [ ] 4.1 扩展 Workspace CRUD API
    - 修改 `src/app/api/workspaces/route.ts`（已存在）：扩展 POST（创建）和 GET（列表，支持 status 过滤）
    - 新增 `src/app/api/workspaces/[id]/route.ts`：GET（详情含 codebases）、PATCH（更新 title）、DELETE（级联删除）
    - 新增 `src/app/api/workspaces/[id]/archive/route.ts`：PATCH（归档）
    - 统一错误响应格式（404、400）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [ ]* 4.2 编写 Workspace API 单元测试
    - 测试创建、列表过滤、详情、更新、归档、删除、404 错误
    - _需求: 1.1–1.7_

  - [ ] 4.3 新增 Codebase CRUD API
    - 创建 `src/app/api/workspaces/[id]/codebases/route.ts`：POST（添加）和 GET（列出）
    - 创建 `src/app/api/workspaces/[id]/codebases/[cbId]/route.ts`：PATCH（更新）和 DELETE（移除）
    - 处理 409 重复 repoPath 错误
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 4.4 编写 Codebase API 单元测试
    - 测试添加、列出、更新、移除、409 重复、首个默认标记
    - _需求: 2.1–2.6_

- [ ] 5. Session 与 Skill API 变更（Next.js）
  - [ ] 5.1 更新 Session API 支持 Workspace 过滤
    - 修改 `src/app/api/sessions/route.ts`：GET 新增必填 `workspaceId` 查询参数
    - 修改 Session 创建流程（ACP 流程中）：必须关联有效的 workspaceId
    - 移除所有 `workspaceId ?? "default"` 回退逻辑
    - _需求: 6.1, 6.2, 6.4, 10.2, 10.3_

  - [ ]* 5.2 编写 Session 过滤属性测试
    - **Property 12: Session 要求有效 Workspace**
    - **Property 13: Workspace 切换过滤 Session**
    - **Property 16: Session workspaceId 往返**
    - **Property 17: Session 列表按创建时间倒序**
    - **验证: 需求 3.3, 6.1, 6.2, 6.3, 6.4, 10.3**

  - [ ] 5.3 更新 Skills API 支持 Workspace 级别管理
    - 修改 `src/app/api/skills/route.ts`：GET 支持 `workspaceId` 参数过滤已安装 Skill
    - 新增安装端点 POST `/api/skills/install`（接受 workspaceId + skillId）
    - 新增卸载端点 DELETE `/api/skills/uninstall`（接受 workspaceId + skillId）
    - 保留全局 catalog 查询不变
    - _需求: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [ ]* 5.4 编写 Skill 安装/卸载属性测试
    - **Property 18: Skill 安装/列出往返**
    - **Property 19: Skill 卸载正确性**
    - **验证: 需求 7.1, 7.2, 7.3**

  - [ ] 5.5 更新 Notes API 移除 "default" 回退
    - 修改 `src/app/api/notes/route.ts`：要求显式提供 workspaceId，移除 `?? "default"` 回退
    - _需求: 10.2_

- [ ] 6. 检查点 - 确保所有 API 层测试通过
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 7. 前端组件实现
  - [ ] 7.1 实现 WorkspaceSwitcher 组件
    - 创建 `src/client/components/workspace-switcher.tsx`
    - 显示在顶部导航栏，展示当前 Workspace 名称
    - 点击展开下拉列表，显示所有 active Workspace
    - 提供"创建新 Workspace"入口（弹出创建表单）
    - 切换时触发 onSwitch 回调
    - _需求: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 7.2 编写 WorkspaceSwitcher 组件测试
    - 测试渲染、下拉展开、切换回调、创建入口
    - _需求: 4.1–4.4_

  - [ ] 7.3 实现 CodebasePicker 组件
    - 创建 `src/client/components/codebase-picker.tsx`
    - 显示在聊天输入区域附近，列出当前 Workspace 的 Codebase
    - 单个 Codebase 时自动选中
    - 选中的 Codebase 的 repoPath 作为新 Session 的 cwd
    - _需求: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.4 编写 CodebasePicker 组件测试
    - 测试列表渲染、选择回调、自动选中、高亮
    - _需求: 5.1–5.4_

  - [ ] 7.5 实现 WorkspaceOnboarding 组件
    - 创建 `src/client/components/workspace-onboarding.tsx`
    - 当无 active Workspace 时显示引导界面
    - 引导用户创建第一个 Workspace，创建后自动切换
    - _需求: 4.6, 9.4, 10.4_

  - [ ]* 7.6 编写 WorkspaceOnboarding 组件测试
    - 测试引导流程、创建后自动切换
    - _需求: 4.6, 9.4, 10.4_

- [ ] 8. 前端集成与状态管理
  - [ ] 8.1 实现 Workspace 上下文持久化
    - 在 `src/client/` 中实现 localStorage 读写当前活跃 Workspace ID
    - 应用启动时自动恢复上次 Workspace
    - 已删除/归档的 Workspace 回退到第一个 active Workspace
    - _需求: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 8.2 编写 Workspace 持久化属性测试
    - **Property 21: Workspace 上下文持久化往返**
    - **验证: 需求 9.1, 9.2**

  - [ ] 8.3 集成 Workspace 状态到主页面
    - 修改 `src/app/page.tsx`：新增 Workspace 状态管理，传递 workspaceId 给子组件
    - 修改 `src/client/components/session-panel.tsx`：接收 workspaceId prop，按 Workspace 过滤 Session
    - 修改 `src/client/components/skill-panel.tsx`：接收 workspaceId prop，显示 Workspace 级别 Skill
    - 修改 `src/client/components/chat-panel.tsx`：接收 workspaceId 和 selectedCodebase，创建 Session 时传递
    - 用 CodebasePicker 替代 RepoPicker（`src/client/components/repo-picker.tsx`）
    - _需求: 4.3, 4.5, 5.2, 5.5, 6.3, 7.4_

  - [ ]* 8.4 编写 Codebase 选择与 Session 关联属性测试
    - **Property 14: Codebase 选择设置 Session cwd**
    - **Property 15: Codebase 切换不影响现有 Session**
    - **验证: 需求 5.2, 5.5**

- [ ] 9. 移除 "default" Workspace 硬编码依赖
  - [ ] 9.1 清理所有 "default" 硬编码引用
    - 全局搜索并移除所有 `workspaceId="default"` 或 `?? "default"` 的引用
    - 移除 `ensureDefault()` 方法调用（`src/core/db/pg-workspace-store.ts`, `src/core/db/sqlite-stores.ts`）
    - 更新 Session 创建流程，不再自动使用 "default"
    - 更新 Notes API，不再使用 "default" 回退
    - _需求: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 9.2 编写 "default" 移除验证测试
    - 验证系统中不再存在 "default" 硬编码引用
    - 验证无 Workspace 时系统引导创建而非自动创建 "default"
    - _需求: 10.1–10.5_

- [ ] 10. 检查点 - 确保前端集成和 "default" 清理完成
  - 确保所有测试通过，如有疑问请询问用户。

- [ ] 11. Rust 后端对等实现
  - [ ] 11.1 更新 Rust Workspace 模型，移除 repo_path 和 branch
    - 修改 `crates/routa-core/src/models/workspace.rs`：移除 `repo_path` 和 `branch` 字段
    - 新增 `crates/routa-core/src/models/codebase.rs`：定义 `Codebase` 结构体
    - 修改 `crates/routa-core/src/models/mod.rs`：导出 Codebase 模型
    - _需求: 3.1, 3.2, 8.3_

  - [ ] 11.2 更新 Rust 数据库初始化
    - 修改 `crates/routa-core/src/db/mod.rs`：`initialize_tables()` 新增 `codebases` 表和 `workspace_skills` 表
    - 添加唯一索引 `idx_codebases_workspace_repo`
    - _需求: 3.7, 8.3_

  - [ ] 11.3 实现 Rust CodebaseStore
    - 创建 `crates/routa-core/src/store/codebase_store.rs`
    - 实现 add, get, list_by_workspace, update, remove, get_default, set_default 方法
    - 修改 `crates/routa-core/src/store/mod.rs`：导出 CodebaseStore
    - _需求: 8.1, 8.2_

  - [ ] 11.4 重构 Rust WorkspaceStore
    - 修改 `crates/routa-core/src/store/workspace_store.rs`：移除 `ensure_default()`
    - 新增 `update_title()`, `archive()`, `list_by_status()`, `delete()` 方法
    - _需求: 8.1, 10.5_

  - [ ] 11.5 实现 Rust Workspace CRUD API 端点
    - 修改 `crates/routa-server/src/api/workspaces.rs`：扩展 POST/GET，新增 PATCH/DELETE/archive
    - 修改 `crates/routa-server/src/api/mod.rs`：注册新路由
    - _需求: 8.1, 8.4_

  - [ ] 11.6 实现 Rust Codebase CRUD API 端点
    - 创建 `crates/routa-server/src/api/codebases.rs`：POST/GET/PATCH/DELETE
    - 修改 `crates/routa-server/src/api/mod.rs`：注册 codebases 路由
    - 修改 `crates/routa-core/src/state.rs`：`AppStateInner` 新增 `codebase_store` 字段
    - _需求: 8.2, 8.4_

  - [ ] 11.7 更新 Rust 启动流程，移除 ensure_default
    - 修改 `crates/routa-server/src/lib.rs`：`create_app_state()` 移除 `ensure_default()` 调用
    - _需求: 8.1, 10.5_

  - [ ]* 11.8 编写 Rust 后端属性测试
    - 使用 `proptest` 测试 WorkspaceStore 和 CodebaseStore
    - **Property 1–11: Store 层属性测试**
    - **验证: 需求 8.1, 8.2, 8.3**

  - [ ]* 11.9 编写 Rust API 响应一致性测试
    - **Property 20: 双后端 API 响应一致性**
    - 验证相同请求返回结构相同的 JSON 响应
    - **验证: 需求 8.1, 8.2, 8.4**

- [ ] 12. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有疑问请询问用户。

## 备注

- 标记 `*` 的任务为可选任务，可跳过以加速 MVP 交付
- 每个任务引用了具体的需求编号以确保可追溯性
- 检查点确保增量验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
- Rust 后端任务（第 11 步）可在 Next.js 后端完成后并行开发
