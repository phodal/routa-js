# Routa.js — Product Feature Specification

Multi-agent coordination platform. This document is auto-generated from:
- Frontend routes: `src/app/**/page.tsx`
- API contract: `api-contract.yaml`

---

## Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Task input first |
| A2A Protocol | `/a2a` | A2A protocol testing |
| AG-UI Protocol | `/ag-ui` | AG-UI protocol testing |
| MCP Tools | `/mcp-tools` | Browse and execute MCP tools |
| Messages | `/messages` | Notifications and PR history |
| Settings | `/settings` | Providers, specialists, models |
| Agent Installation | `/settings/agents` | Manage ACP agents |
| Scheduled Triggers | `/settings/schedules` | Cron-based agent triggers |
| GitHub Webhooks | `/settings/webhooks` | GitHub event triggers |
| Traces | `/traces` | Browse agent execution traces |
| Workspace | `/workspace/:workspaceId` | Workspace session management |
| Session Detail | `/workspace/:workspaceId/sessions/:sessionId` | Individual session view |

---

## API Endpoints

### A2A (8)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/a2a/sessions` | List A2A sessions |
| GET | `/api/a2a/card` | A2A agent card |
| POST | `/api/a2a/rpc` | A2A JSON-RPC |
| GET | `/api/a2a/rpc` | A2A SSE stream |
| POST | `/api/a2a/message` | Send a message via the A2A protocol |
| GET | `/api/a2a/tasks` | List A2A tasks |
| GET | `/api/a2a/tasks/{id}` | Get an A2A task by ID |
| POST | `/api/a2a/tasks/{id}` | Update / respond to an A2A task |

### A2Ui (2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/a2ui/dashboard` | Get A2UI v0.10 dashboard data |
| POST | `/api/a2ui/dashboard` | Add custom A2UI messages to the dashboard |

### ACP (15)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/acp` | ACP JSON-RPC endpoint |
| GET | `/api/acp` | ACP SSE stream |
| GET | `/api/acp/registry` | List agents in the ACP registry |
| POST | `/api/acp/registry` | Register an agent in the ACP registry |
| POST | `/api/acp/install` | Install an ACP agent |
| DELETE | `/api/acp/install` | Uninstall an ACP agent |
| GET | `/api/acp/runtime` | Get ACP runtime status |
| POST | `/api/acp/runtime` | Start ACP runtime |
| GET | `/api/acp/warmup` | Get ACP warmup status |
| POST | `/api/acp/warmup` | Trigger ACP warmup |
| GET | `/api/acp/docker/status` | Get Docker daemon status |
| POST | `/api/acp/docker/pull` | Pull a Docker image |
| GET | `/api/acp/docker/containers` | List Docker containers for OpenCode agents |
| POST | `/api/acp/docker/container/start` | Start a Docker container for OpenCode agent |
| POST | `/api/acp/docker/container/stop` | Stop a Docker container |

### Ag-Ui (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ag-ui` | Process AG-UI protocol request (SSE stream) |

### Agents (5)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List agents (or get single by id query param) |
| POST | `/api/agents` | Create a new agent |
| GET | `/api/agents/{id}` | Get agent by ID (REST-style path param) |
| DELETE | `/api/agents/{id}` | Delete an agent |
| POST | `/api/agents/{id}/status` | Update agent status |

### Background-Tasks (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/background-tasks` | List background tasks |
| POST | `/api/background-tasks` | Create a background task |
| POST | `/api/background-tasks/process` | Process the next pending background task |
| GET | `/api/background-tasks/{id}` | Get a background task by ID |
| PATCH | `/api/background-tasks/{id}` | Update a background task (PENDING only) |
| DELETE | `/api/background-tasks/{id}` | Cancel a background task |
| POST | `/api/background-tasks/{id}/retry` | Retry a failed background task |

### Clone (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clone` | List cloned repositories |
| POST | `/api/clone` | Clone a GitHub repository |
| PATCH | `/api/clone` | Switch branch on cloned repo |
| POST | `/api/clone/progress` | Clone with SSE progress |
| GET | `/api/clone/branches` | Get branch info |
| POST | `/api/clone/branches` | Fetch remote branches |
| PATCH | `/api/clone/branches` | Checkout branch |

### Codebases (3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| PATCH | `/api/codebases/{id}` | Update codebase metadata |
| DELETE | `/api/codebases/{id}` | Delete a codebase |
| POST | `/api/codebases/{id}/default` | Set a codebase as the default |

### Debug (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/debug/path` | Debug endpoint — returns resolved binary paths (desktop only) |

### Files (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/files/search` | Search files in a codebase |

### GitHub (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/github` | List active GitHub virtual workspaces |
| POST | `/api/github/import` | Import a GitHub repo as a virtual workspace (zipball download) |
| GET | `/api/github/tree` | Get file tree for an imported GitHub repo |
| GET | `/api/github/file` | Read a file from an imported GitHub repo |
| GET | `/api/github/search` | Search files in an imported GitHub repo |
| POST | `/api/github/pr-comment` | Post a comment on a GitHub pull request |

### Health (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check — returns service status |

### MCP (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/mcp` | MCP Streamable HTTP (JSON-RPC) |
| GET | `/api/mcp` | MCP SSE stream |
| DELETE | `/api/mcp` | Terminate MCP session |
| GET | `/api/mcp/tools` | List MCP tools |
| POST | `/api/mcp/tools` | Execute an MCP tool |
| PATCH | `/api/mcp/tools` | Update MCP tool configuration |

### Mcp-Server (3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp-server` | Get MCP server status |
| POST | `/api/mcp-server` | Start MCP server |
| DELETE | `/api/mcp-server` | Stop MCP server |

### Mcp-Servers (4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp-servers` | List custom MCP servers (or get single by id query param) |
| POST | `/api/mcp-servers` | Create a new custom MCP server |
| PUT | `/api/mcp-servers` | Update an existing custom MCP server |
| DELETE | `/api/mcp-servers` | Delete a custom MCP server |

### Memory (3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/memory` | List memory entries for a workspace |
| POST | `/api/memory` | Create a memory entry |
| DELETE | `/api/memory` | Delete memory entries |

### Notes (6)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notes` | List notes or get single by noteId |
| POST | `/api/notes` | Create or update a note |
| DELETE | `/api/notes` | Delete note by query params |
| GET | `/api/notes/events` | SSE stream for note change events |
| GET | `/api/notes/{workspaceId}/{noteId}` | Get note by workspace + note ID |
| DELETE | `/api/notes/{workspaceId}/{noteId}` | Delete note by path params |

### Polling (4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/polling/config` | Get polling configuration |
| POST | `/api/polling/config` | Update polling configuration |
| GET | `/api/polling/check` | Run a polling check (GET) |
| POST | `/api/polling/check` | Run a polling check (POST) |

### Providers (2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/providers` | List configured LLM providers |
| GET | `/api/providers/models` | List available models for configured providers |

### Rpc (2)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/rpc` | Generic JSON-RPC endpoint |
| GET | `/api/rpc/methods` | List available RPC methods |

### Schedules (8)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/schedules` | List scheduled tasks |
| POST | `/api/schedules` | Create a new schedule |
| GET | `/api/schedules/{id}` | Get a schedule by ID |
| PATCH | `/api/schedules/{id}` | Update a schedule |
| DELETE | `/api/schedules/{id}` | Delete a schedule |
| POST | `/api/schedules/{id}/run` | Trigger a schedule to run immediately |
| GET | `/api/schedules/tick` | Get tick status for scheduled tasks |
| POST | `/api/schedules/tick` | Manually trigger the schedule tick |

### Sessions (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sessions` | List ACP sessions |
| GET | `/api/sessions/{sessionId}/context` | Get hierarchical context for a session |
| GET | `/api/sessions/{id}` | Get session by ID |
| PATCH | `/api/sessions/{id}` | Update session metadata |
| DELETE | `/api/sessions/{id}` | Delete a session |
| GET | `/api/sessions/{id}/history` | Get message history for a session |
| POST | `/api/sessions/{id}/disconnect` | Disconnect and kill an active session process |

### Skills (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/skills` | List skills or get by name |
| POST | `/api/skills` | Reload skills from disk |
| GET | `/api/skills/clone` | Discover skills from repo path |
| POST | `/api/skills/clone` | Clone a skill repository |
| POST | `/api/skills/upload` | Upload skill as zip |
| GET | `/api/skills/catalog` | List available skills in the registry |
| POST | `/api/skills/catalog` | Refresh the local skill catalog from registry |

### Specialists (4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/specialists` | List configured specialist agents |
| POST | `/api/specialists` | Create a specialist configuration |
| PUT | `/api/specialists` | Update an existing specialist |
| DELETE | `/api/specialists` | Delete a specialist |

### Tasks (7)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks |
| POST | `/api/tasks` | Create a task |
| DELETE | `/api/tasks` | Delete all tasks for a workspace |
| GET | `/api/tasks/{id}` | Get task by ID |
| DELETE | `/api/tasks/{id}` | Delete a task |
| POST | `/api/tasks/{id}/status` | Update task status |
| GET | `/api/tasks/ready` | Find tasks with all dependencies satisfied |

### Test-Mcp (1)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test-mcp` | Test MCP config |

### Traces (4)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/traces` | List agent execution traces |
| POST | `/api/traces` | Create a new trace record |
| GET | `/api/traces/stats` | Get aggregated trace statistics |
| GET | `/api/traces/{id}` | Get a single trace by ID |

### Webhooks (10)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/configs` | List webhook configurations |
| POST | `/api/webhooks/configs` | Create a webhook configuration |
| PUT | `/api/webhooks/configs` | Update a webhook configuration |
| DELETE | `/api/webhooks/configs` | Delete a webhook configuration |
| GET | `/api/webhooks/github` | List registered GitHub webhooks |
| POST | `/api/webhooks/github` | Handle an incoming GitHub webhook event |
| GET | `/api/webhooks/register` | List webhook registrations |
| POST | `/api/webhooks/register` | Register a new webhook |
| DELETE | `/api/webhooks/register` | Unregister a webhook |
| GET | `/api/webhooks/webhook-logs` | List webhook delivery logs |

### Workspaces (10)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/workspaces` | List all workspaces |
| POST | `/api/workspaces` | Create a workspace |
| GET | `/api/workspaces/{id}` | Get workspace by ID |
| PATCH | `/api/workspaces/{id}` | Update workspace (title, repoPath, branch, status, metadata) |
| DELETE | `/api/workspaces/{id}` | Delete workspace |
| POST | `/api/workspaces/{id}/archive` | Archive or unarchive a workspace |
| GET | `/api/workspaces/{id}/codebases` | List codebases in a workspace |
| POST | `/api/workspaces/{id}/codebases` | Add a codebase to a workspace |
| GET | `/api/workspaces/{workspace_id}/codebases/{codebase_id}/worktrees` | List worktrees for a codebase |
| POST | `/api/workspaces/{workspace_id}/codebases/{codebase_id}/worktrees` | Create a new git worktree |

### Worktrees (3)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/worktrees/{id}` | Get a single worktree |
| DELETE | `/api/worktrees/{id}` | Remove a worktree |
| POST | `/api/worktrees/{id}/validate` | Validate worktree health on disk |
