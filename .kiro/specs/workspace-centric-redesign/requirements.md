# 需求文档：以 Workspace 为核心的架构重设计

## 简介

当前 Routa.js 的架构以 Session（会话）为主要导航和交互单元，Workspace 虽然在数据模型中存在，但仅作为一个"default"占位符，缺乏显式的管理能力。本次重设计将 Workspace 提升为一等公民，使其成为所有资源（Session、Note、Skill、Agent、Task）的组织核心。每个 Workspace 可关联多个代码仓库（Codebase），以支持微服务等多仓库场景。用户在 UI 中显式创建、切换和管理 Workspace，Session 则降级为 Workspace 内部的会话记录。

## 术语表

- **Workspace（工作空间）**：Routa 中的顶层组织单元，包含一组相关的代码仓库、会话、笔记、技能和任务。
- **Codebase（代码仓库）**：一个 Git 仓库路径及其分支信息，隶属于某个 Workspace。一个 Workspace 可包含多个 Codebase。
- **Session（会话）**：用户与 ACP Agent 的一次交互会话，隶属于某个 Workspace。
- **Note（笔记）**：Workspace 内的协作文档，包括 Spec、Task、General 类型。
- **Skill（技能）**：可加载的知识模块，可在 Workspace 级别安装和管理。
- **Agent（代理）**：AI 编码代理，隶属于某个 Workspace。
- **Task（任务）**：由 Agent 执行的工作单元，隶属于某个 Workspace。
- **Workspace_Switcher（工作空间切换器）**：UI 中用于切换当前活跃 Workspace 的组件。
- **Codebase_Picker（代码仓库选择器）**：UI 中用于在当前 Workspace 内选择活跃 Codebase 的组件。
- **Workspace_API**：提供 Workspace CRUD 操作的 REST API 端点。
- **Codebase_API**：提供 Codebase CRUD 操作的 REST API 端点。

## 需求

### 需求 1：Workspace 生命周期管理

**用户故事：** 作为开发者，我希望能够创建、查看、编辑和归档 Workspace，以便按项目或业务领域组织我的工作。

#### 验收标准

1. THE Workspace_API SHALL 提供创建 Workspace 的端点，接受 title 参数并返回新创建的 Workspace 对象
2. THE Workspace_API SHALL 提供列出所有 Workspace 的端点，支持按 status 过滤（active / archived）
3. THE Workspace_API SHALL 提供获取单个 Workspace 详情的端点，包含其关联的 Codebase 列表
4. THE Workspace_API SHALL 提供更新 Workspace title 的端点
5. THE Workspace_API SHALL 提供归档 Workspace 的端点，将 status 设置为 archived
6. WHEN 用户创建 Workspace 时，THE Workspace_API SHALL 生成唯一 ID 并设置 status 为 active
7. IF 请求的 Workspace 不存在，THEN THE Workspace_API SHALL 返回 404 状态码和描述性错误信息

### 需求 2：Codebase 多仓库支持

**用户故事：** 作为开发者，我希望一个 Workspace 能关联多个代码仓库，以便在微服务等多仓库场景下统一管理。

#### 验收标准

1. THE Codebase_API SHALL 提供向 Workspace 添加 Codebase 的端点，接受 repoPath 和可选的 branch、label 参数
2. THE Codebase_API SHALL 提供列出某个 Workspace 下所有 Codebase 的端点
3. THE Codebase_API SHALL 提供移除 Workspace 中某个 Codebase 的端点
4. THE Codebase_API SHALL 提供更新 Codebase 的 branch 或 label 的端点
5. WHEN 向 Workspace 添加第一个 Codebase 时，THE Codebase_API SHALL 将该 Codebase 标记为默认活跃 Codebase
6. IF 添加的 repoPath 在该 Workspace 中已存在，THEN THE Codebase_API SHALL 返回 409 状态码和描述性错误信息
7. WHEN 删除 Workspace 时，THE Codebase_API SHALL 级联删除该 Workspace 下所有 Codebase 记录

### 需求 3：Workspace 数据模型重构

**用户故事：** 作为开发者，我希望数据库 schema 能正确反映以 Workspace 为核心的层级关系，以便数据一致性得到保障。

#### 验收标准

1. THE Workspace 数据模型 SHALL 包含以下字段：id、title、status、metadata、createdAt、updatedAt
2. THE Codebase 数据模型 SHALL 包含以下字段：id、workspaceId（外键）、repoPath、branch、label、isDefault、createdAt、updatedAt
3. THE Session 数据模型 SHALL 通过 workspaceId 外键关联到 Workspace
4. THE Note 数据模型 SHALL 通过 workspaceId 外键关联到 Workspace（已有，保持不变）
5. THE Agent 数据模型 SHALL 通过 workspaceId 外键关联到 Workspace（已有，保持不变）
6. THE Task 数据模型 SHALL 通过 workspaceId 外键关联到 Workspace（已有，保持不变）
7. THE Postgres schema 和 SQLite schema SHALL 保持结构一致，仅类型映射不同
8. WHEN 删除 Workspace 时，THE 数据库 SHALL 级联删除该 Workspace 下所有关联的 Codebase、Session、Note、Agent 和 Task 记录

### 需求 4：Workspace 切换与 UI 导航

**用户故事：** 作为开发者，我希望在 UI 中能快速切换 Workspace，以便在不同项目间高效切换上下文。

#### 验收标准

1. THE Workspace_Switcher SHALL 显示在页面顶部导航栏中，展示当前活跃 Workspace 的名称
2. WHEN 用户点击 Workspace_Switcher 时，THE Workspace_Switcher SHALL 展开下拉列表，显示所有 active 状态的 Workspace
3. WHEN 用户从下拉列表中选择一个 Workspace 时，THE Workspace_Switcher SHALL 切换当前上下文到所选 Workspace，并刷新左侧边栏的 Session 列表和 Skill 列表
4. THE Workspace_Switcher SHALL 提供"创建新 Workspace"的入口，点击后弹出创建表单
5. WHEN 切换 Workspace 时，THE 聊天面板 SHALL 清空当前会话内容，显示新 Workspace 的上下文
6. WHEN 应用启动且无 Workspace 存在时，THE 系统 SHALL 引导用户创建第一个 Workspace

### 需求 5：Codebase 选择与会话关联

**用户故事：** 作为开发者，我希望在输入区域选择当前 Workspace 的 Codebase，以便 Agent 在正确的代码仓库上下文中工作。

#### 验收标准

1. THE Codebase_Picker SHALL 显示在聊天输入区域附近，展示当前 Workspace 下所有可用的 Codebase
2. WHEN 用户选择一个 Codebase 时，THE Codebase_Picker SHALL 将该 Codebase 的 repoPath 作为后续 Session 创建的 cwd 参数
3. THE Codebase_Picker SHALL 高亮显示当前选中的 Codebase
4. WHEN Workspace 下只有一个 Codebase 时，THE Codebase_Picker SHALL 自动选中该 Codebase，无需用户手动选择
5. WHEN 用户切换 Codebase 时，THE 系统 SHALL 保留当前 Session 不中断，仅更新后续新建 Session 的 cwd 上下文

### 需求 6：Session 归属 Workspace

**用户故事：** 作为开发者，我希望 Session 明确归属于 Workspace，以便在切换 Workspace 时看到对应的会话历史。

#### 验收标准

1. WHEN 创建新 Session 时，THE Session_API SHALL 将当前活跃 Workspace 的 ID 写入 Session 的 workspaceId 字段
2. THE Session_API SHALL 支持按 workspaceId 过滤 Session 列表
3. WHEN 用户切换 Workspace 时，THE 左侧 Session 列表 SHALL 仅显示属于当前 Workspace 的 Session
4. THE Session 列表 SHALL 按创建时间倒序排列，最新的 Session 显示在最上方
5. WHEN 删除 Workspace 时，THE 系统 SHALL 同时删除该 Workspace 下所有 Session 及其消息历史

### 需求 7：Skill 以 Workspace 为单元管理

**用户故事：** 作为开发者，我希望 Skill 的安装和管理以 Workspace 为单位，以便不同项目使用不同的技能集。

#### 验收标准

1. THE Skill_API SHALL 支持将 Skill 安装到指定 Workspace
2. THE Skill_API SHALL 支持列出某个 Workspace 下已安装的 Skill
3. THE Skill_API SHALL 支持从 Workspace 中卸载 Skill
4. WHEN 用户切换 Workspace 时，THE 左侧 Skill 面板 SHALL 仅显示当前 Workspace 已安装的 Skill
5. THE Skill_API SHALL 保留全局 Skill 目录（catalog）的查询能力，供用户浏览和安装
6. WHEN 创建新 Workspace 时，THE 系统 SHALL 不自动安装任何 Skill，Skill 列表初始为空

### 需求 8：Rust 后端 API 对等实现

**用户故事：** 作为开发者，我希望 Rust 后端（routa-server）实现与 Next.js 后端相同的 Workspace 和 Codebase API，以便桌面端和 Web 端行为一致。

#### 验收标准

1. THE Rust 后端 SHALL 实现与 Next.js 后端相同的 Workspace CRUD REST API 端点
2. THE Rust 后端 SHALL 实现与 Next.js 后端相同的 Codebase CRUD REST API 端点
3. THE Rust 后端 SHALL 使用 SQLite 存储 Workspace 和 Codebase 数据，schema 与 Next.js SQLite schema 一致
4. THE Rust 后端 SHALL 对相同的请求返回相同结构的 JSON 响应
5. IF Next.js 后端新增 Workspace 相关 API 端点，THEN THE Rust 后端 SHALL 在同一版本中实现对应端点

### 需求 9：Workspace 上下文持久化

**用户故事：** 作为开发者，我希望应用记住我上次使用的 Workspace，以便重新打开时自动恢复上下文。

#### 验收标准

1. WHEN 用户切换 Workspace 时，THE 系统 SHALL 将当前活跃 Workspace ID 持久化到本地存储（localStorage 或等效机制）
2. WHEN 应用启动时，THE 系统 SHALL 从本地存储读取上次活跃的 Workspace ID，并自动切换到该 Workspace
3. IF 上次活跃的 Workspace 已被删除或归档，THEN THE 系统 SHALL 回退到第一个 active 状态的 Workspace
4. IF 没有任何 active 状态的 Workspace 存在，THEN THE 系统 SHALL 引导用户创建新 Workspace

### 需求 10：移除 Default Workspace 硬编码依赖

**用户故事：** 作为开发者，我希望系统不再依赖硬编码的 "default" Workspace ID，以便 Workspace 管理完全由用户控制。

#### 验收标准

1. THE 系统 SHALL 移除所有对 workspaceId="default" 的硬编码引用
2. THE Notes API SHALL 要求请求中显式提供 workspaceId 参数，不再使用 "default" 作为回退值
3. THE Session 创建流程 SHALL 要求关联到一个已存在的 Workspace，不再自动使用 "default"
4. WHEN 系统首次启动且无 Workspace 存在时，THE 系统 SHALL 引导用户创建第一个 Workspace，而非自动创建 "default"
5. THE ensureDefault 方法 SHALL 被移除或替换为显式的 Workspace 创建流程
