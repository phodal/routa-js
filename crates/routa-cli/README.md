# Routa CLI

Command-line interface for the Routa.js multi-agent coordination platform.

## Installation

```bash
cargo build --release --manifest-path crates/routa-cli/Cargo.toml
```

The binary will be at `crates/routa-cli/target/release/routa`.

## Quick Start

### 🚀 Prompt Mode (Quick Coordination)

Run a full multi-agent coordination flow with a single command:

```bash
routa -p "Create a Python calculator script with add, subtract, multiply, divide functions"
```

This will:
1. Create a ROUTA coordinator agent
2. Analyze your requirement
3. Generate and delegate tasks to CRAFTER agents
4. Stream all progress to your terminal
5. Show a summary when complete

**Options:**
- `--workspace-id <ID>` - Workspace to use (default: `default`)
- `--provider <PROVIDER>` - ACP provider (default: `opencode`)
- `--db <PATH>` - Database path (default: `routa.db`)

**Examples:**
```bash
# Simple file creation
routa -p "Create a hello.py file that prints Hello World"

# Complex feature
routa -p "Add OAuth login to the app with Google and GitHub providers"

# With custom workspace
routa -p "Refactor the auth module" --workspace-id my-project
```

### 🔌 ACP Server Mode

Run Routa as an ACP (Agent Client Protocol) server that other agents can connect to:

```bash
routa acp --workspace-id my-project --provider opencode
```

This starts a JSON-RPC server on stdio that supports:
- `initialize` - Get server capabilities
- `session/new` - Create a coordination session
- `session/prompt` - Send a requirement and get streaming updates
- `session/cancel` - Cancel a running session
- `session/list` - List active sessions

**Example client interaction:**
```bash
# Initialize
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | routa acp

# Create session
echo '{"jsonrpc":"2.0","id":2,"method":"session/new","params":{"cwd":"."}}' | routa acp

# Send prompt
echo '{"jsonrpc":"2.0","id":3,"method":"session/prompt","params":{"sessionId":"...","text":"Create a REST API"}}' | routa acp
```

## Other Commands

### Workspace Management

```bash
# List workspaces
routa workspace list

# Create workspace
routa workspace create --name my-project
```

### Agent Management

```bash
# List agents
routa agent list --workspace-id default

# Create agent
routa agent create --name dev-agent --role DEVELOPER --workspace-id default

# Get agent status
routa agent status --id <agent-id>
```

### Task Management

```bash
# List tasks
routa task list --workspace-id default

# Create task
routa task create \
  --title "Add feature" \
  --objective "Implement user authentication" \
  --workspace-id default

# Update task status
routa task update-status \
  --id <task-id> \
  --status COMPLETED \
  --agent-id <agent-id>
```

### Interactive Chat

Start an interactive chat session with an agent:

```bash
routa chat --workspace-id default --provider opencode --role DEVELOPER
```

### Delegation

Delegate a task to a specialist agent:

```bash
routa delegate \
  --task-id <task-id> \
  --caller-agent-id <parent-agent-id> \
  --caller-session-id <session-id> \
  --specialist CRAFTER \
  --provider opencode
```

## Requirements

- Rust 1.70+
- An ACP provider installed (e.g., `opencode`, `claude`)
  - For opencode: Available at `~/.opencode/bin/opencode`
  - For claude: `claude` command in PATH

## Architecture

The CLI is a thin adapter layer over `routa-core`:

```
routa CLI
  ├── commands/prompt.rs      (-p mode)
  ├── commands/acp_serve.rs   (ACP server)
  └── commands/*.rs           (CRUD operations)
       ↓
routa-core (shared business logic)
  ├── orchestration/          (RoutaOrchestrator)
  ├── acp/                    (AcpManager)
  ├── rpc/                    (RpcRouter)
  └── store/                  (SQLite stores)
```

All business logic is in `routa-core`, ensuring consistency with the Web UI and Desktop app.

## Documentation

- [Implementation Details](../../docs/CLI-IMPLEMENTATION.md)
- [Test Results](../../CLI-TEST-RESULTS.md)
- [Architecture Guide](../../AGENTS.md)

## License

MIT
