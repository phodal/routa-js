# MCP Setup Guide for ACP Providers

This guide explains how to configure MCP (Model Context Protocol) for different ACP providers (Claude Code, Codex, OpenCode) to connect to the Routa MCP server.

## Overview

The Routa MCP server exposes coordination tools via HTTP at `/api/mcp`. AI providers can connect to this server to access tools like:

- `list_agents` - List all agents in the workspace
- `create_agent` - Create new agents (ROUTA/CRAFTER/GATE)
- `delegate_task` - Assign tasks to agents
- `send_message_to_agent` - Inter-agent communication
- `report_to_parent` - Submit completion reports
- And more...

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│  AI Provider    │         │  Routa MCP       │         │  Routa System   │
│  (Claude/Codex) │ ──MCP──>│  Server          │ ──────> │  (AgentTools)   │
│                 │         │  /api/mcp        │         │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

## Quick Start

### 1. Basic Usage

```typescript
import { buildConfigFromPreset } from './opencode-process';
import { setupMcpForCodex } from './mcp-setup';

// Setup MCP for Codex
const mcpConfigs = setupMcpForCodex({
  routaServerUrl: 'http://localhost:3000',
  workspaceId: 'my-workspace'
});

// Build config with MCP enabled
const config = buildConfigFromPreset(
  'codex',
  '/path/to/workspace',
  [],      // extra args
  {},      // extra env
  mcpConfigs  // MCP configs
);

// Start the process
const process = new AcpProcess(config, (notification) => {
  console.log('Notification:', notification);
});

await process.start();
```

### 2. Claude Code Example

```typescript
import { ClaudeCodeProcess } from './claude-code-process';
import { setupMcpForClaudeCode } from './mcp-setup';

const mcpConfigs = setupMcpForClaudeCode({
  routaServerUrl: 'http://localhost:3000',
  workspaceId: 'my-workspace'
});

const config = {
  preset: getPresetById('claude'),
  command: 'claude',
  cwd: '/path/to/workspace',
  displayName: 'Claude Code',
  mcpConfigs,  // MCP configs
};

const process = new ClaudeCodeProcess(config, (notification) => {
  console.log('Notification:', notification);
});

await process.start();
```

### 3. OpenCode Example

```typescript
import { buildConfigFromPreset } from './opencode-process';
import { setupMcpForOpenCode } from './mcp-setup';

const mcpConfigs = setupMcpForOpenCode({
  routaServerUrl: 'http://localhost:3000',
  workspaceId: 'my-workspace'
});

const config = buildConfigFromPreset(
  'opencode',
  '/path/to/workspace',
  [],
  {},
  mcpConfigs
);

const process = new AcpProcess(config, (notification) => {
  console.log('Notification:', notification);
});

await process.start();
```

## Environment Variables

You can configure the Routa server URL and workspace ID via environment variables:

```bash
export ROUTA_SERVER_URL=http://localhost:3000
export ROUTA_WORKSPACE_ID=my-workspace
```

Then use the default configuration:

```typescript
import { setupMcpForCodex, getDefaultRoutaMcpConfig } from './mcp-setup';

// Uses environment variables
const mcpConfigs = setupMcpForCodex();
```

## MCP Configuration Format

The MCP configuration is a JSON object with the following structure:

```json
{
  "name": "routa-coordination",
  "type": "http",
  "url": "http://localhost:3000/api/mcp",
  "env": {
    "ROUTA_WORKSPACE_ID": "my-workspace"
  }
}
```

This JSON is passed to providers via the `--mcp-config` flag:

```bash
codex-acp --mcp-config '{"name":"routa-coordination","type":"http","url":"http://localhost:3000/api/mcp"}'
```

## Checking MCP Status

```typescript
import { getMcpStatus } from './mcp-setup';

const status = getMcpStatus('codex', mcpConfigs);
console.log(status);
// {
//   supported: true,
//   configured: true,
//   configCount: 1
// }
```

## Troubleshooting

### Provider doesn't support --mcp-config

Some providers may not support the `--mcp-config` flag. Check the provider's documentation or use `providerSupportsMcp()` to verify:

```typescript
import { providerSupportsMcp } from './mcp-setup';

if (providerSupportsMcp('codex')) {
  // Setup MCP
} else {
  console.warn('Provider does not support MCP');
}
```

### Connection errors

If the provider can't connect to the Routa MCP server:

1. Ensure the routa-js server is running (`npm run dev`)
2. Check the server URL is correct
3. Verify the `/api/mcp` endpoint is accessible
4. Check firewall/network settings

### Validation

You can validate the MCP configuration before using it:

```typescript
import { validateRoutaMcpConfig } from './mcp-config-generator';

const config = {
  routaServerUrl: 'http://localhost:3000',
  workspaceId: 'my-workspace'
};

const isValid = await validateRoutaMcpConfig(config);
if (!isValid) {
  console.error('MCP configuration is invalid or server is not reachable');
}
```

