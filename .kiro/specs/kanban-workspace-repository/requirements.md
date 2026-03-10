# 需求文档：Kanban Workspace Repository 关联

## 简介

为 Kanban Workspace 增强 Repository 关联能力。当前 Kanban 卡片（issue）缺少明确的代码仓库上下文，agent 在执行任务时无法确定应该在哪个 repo 中工作。本功能将实现三个核心改进：

1. Workspace 级别的 Repository 信息展示与管理
2. Issue（卡片）与一个或多个 Repository 的显式关联
3. 每个 Issue 支持独立的 Git Worktree 工作目录，避免直接在主代码库上修改

## 术语表

- **Workspace**：Routa 平台中的工作空间，包含 Kanban Board、Sessions、Tasks 等资源
- **Kanban_Board**：看板面板，包含多个 Column，用于管理 Issue 的生命周期
- **Issue**：Kanban Board 上的卡片，对应一个 Task，代表一个可执行的工作单元
- **Codebase**：已注册到 Workspace 的代码仓库记录，包含 repoPath、branch、sourceUrl 等信息
- **Worktree**：Git worktree，一个仓库的独立工作目录副本，允许在不同分支上并行工作
- **Repository_Selector**：Issue 创建或编辑时用于选择关联 Repository 的 UI 组件
- **Worktree_Manager**：负责为 Issue 创建、管理和清理 Git Worktree 的服务模块
- **Card_Detail_Panel**：Kanban 卡片的详情面板，展示 Issue 的完整信息

## 需求

### 需求 1：Workspace Repository 信息展示

**用户故事：** 作为开发者，我希望在 Workspace 页面看到关联的 Repository 信息，以便了解当前工作空间的代码仓库上下文。

#### 验收标准

1. WHEN 用户进入 Workspace 页面，THE Kanban_Board SHALL 在顶部工具栏区域展示当前 Workspace 关联的 Codebase 列表
2. THE Kanban_Board SHALL 对每个 Codebase 展示仓库名称、分支、路径和来源类型（local/github）
3. WHEN Workspace 没有关联任何 Codebase，THE Kanban_Board SHALL 展示提示信息引导用户添加 Codebase
4. WHEN 用户点击 Codebase 条目，THE Kanban_Board SHALL 展示该 Codebase 的详细信息，包括 sourceUrl 和 worktree 列表

### 需求 2：Issue 关联 Repository

**用户故事：** 作为开发者，我希望每个 Issue 能关联一个或多个 Repository，以便 agent 在执行任务时知道应该在哪个代码仓库中工作。

#### 验收标准

1. WHEN 用户创建新 Issue，THE Repository_Selector SHALL 展示当前 Workspace 下所有可用的 Codebase 供用户选择
2. THE Issue SHALL 支持关联一个或多个 Codebase，并将关联信息持久化到 Task 模型中
3. WHEN 用户未选择任何 Codebase，THE Repository_Selector SHALL 默认关联 Workspace 的 default Codebase
4. WHEN 用户编辑已有 Issue，THE Card_Detail_Panel SHALL 展示当前关联的 Codebase 列表并允许修改
5. THE Kanban_Board SHALL 在每张卡片上展示关联的 Repository 名称标识
6. IF Issue 关联的 Codebase 被从 Workspace 中移除，THEN THE Kanban_Board SHALL 在该 Issue 卡片上标记 Repository 关联失效

### 需求 3：Issue 独立工作目录（Worktree）

**用户故事：** 作为开发者，我希望每个 Issue 拥有独立的 Git Worktree 工作目录，以便多个 agent 可以并行工作而不互相干扰。

#### 验收标准

1. WHEN Issue 被移动到 "Dev" 列，THE Worktree_Manager SHALL 为该 Issue 自动创建一个 Git Worktree
2. THE Worktree_Manager SHALL 使用 Issue ID 和标题生成唯一的分支名和工作目录路径
3. THE Card_Detail_Panel SHALL 展示 Issue 关联的 Worktree 信息，包括分支名、工作目录路径和状态
4. WHEN Worktree 创建成功，THE Worktree_Manager SHALL 将 worktree 路径作为 agent session 的工作目录（cwd）
5. WHEN Issue 被移动到 "Done" 列，THE Worktree_Manager SHALL 提示用户是否清理对应的 Worktree
6. IF Worktree 创建失败，THEN THE Worktree_Manager SHALL 将 Issue 标记为 "Blocked" 状态并在卡片上展示错误信息
7. WHILE Issue 处于 "Dev" 或 "Review" 状态，THE Card_Detail_Panel SHALL 展示 Worktree 的实时状态（creating/active/error）

### 需求 4：Kanban 卡片 Worktree 描述

**用户故事：** 作为开发者，我希望在 Kanban 卡片的描述区域看到 Worktree 的关键信息，以便快速了解每个 Issue 的工作目录状态。

#### 验收标准

1. THE Kanban_Board SHALL 在每张卡片上展示 Worktree 的摘要信息，包括分支名和状态徽标
2. WHEN Worktree 状态为 "active"，THE Kanban_Board SHALL 使用绿色徽标标识
3. WHEN Worktree 状态为 "creating"，THE Kanban_Board SHALL 使用黄色徽标标识
4. WHEN Worktree 状态为 "error"，THE Kanban_Board SHALL 使用红色徽标标识并展示错误摘要
5. WHEN 用户点击卡片上的 Worktree 信息，THE Card_Detail_Panel SHALL 展开显示完整的 Worktree 详情

### 需求 5：Workspace 工作目录隔离

**用户故事：** 作为开发者，我希望每个 Workspace 有独立的工作目录根路径，以便不同 Workspace 的 Worktree 互不干扰。

#### 验收标准

1. THE Workspace SHALL 维护一个 worktree 根目录路径配置，所有该 Workspace 下的 Worktree 均创建在此目录下
2. WHEN Workspace 首次创建 Worktree，THE Worktree_Manager SHALL 自动创建 worktree 根目录（如不存在）
3. THE Worktree_Manager SHALL 使用 `{worktreeRoot}/{codebaseLabel}/{issueId}-{slugifiedTitle}` 格式组织目录结构
4. WHEN 用户在 Workspace 设置中修改 worktree 根目录，THE Worktree_Manager SHALL 验证新路径的可写性
