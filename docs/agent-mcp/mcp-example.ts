/**
 * MCP Configuration Examples
 *
 * This file demonstrates how to configure MCP for different ACP providers
 * to connect to the Routa MCP server.
 */

import { AcpProcess } from "@/core/acp/acp-process";
import { ClaudeCodeProcess } from "@/core/acp/claude-code-process";
import { buildConfigFromPreset } from "@/core/acp/opencode-process";
import { getPresetById } from "@/core/acp/acp-presets";
import {
  setupMcpForCodex,
  setupMcpForClaudeCode,
  setupMcpForOpenCode,
  getMcpStatus,
} from "@/core/acp/mcp-setup";
import { getDefaultRoutaMcpConfig } from "@/core/acp/mcp-config-generator";

// ─── Example 1: Codex with MCP ─────────────────────────────────────────

export async function startCodexWithMcp(workspacePath: string) {
  console.log("Starting Codex with MCP configuration...");

  // Setup MCP configuration
  const mcpConfigs = setupMcpForCodex({
    routaServerUrl: "http://localhost:3000",
    workspaceId: "my-workspace",
  });

  // Build process config
  const config = buildConfigFromPreset(
    "codex",
    workspacePath,
    [], // extra args
    {}, // extra env
    mcpConfigs // MCP configs
  );

  // Check MCP status
  const status = getMcpStatus("codex", mcpConfigs);
  console.log("MCP Status:", status);

  // Create and start process
  const process = new AcpProcess(config, (notification) => {
    console.log("Codex notification:", notification);
  });

  await process.start();
  console.log("Codex started with MCP enabled");

  return process;
}

// ─── Example 2: Claude Code with MCP ───────────────────────────────────

export async function startClaudeCodeWithMcp(workspacePath: string) {
  console.log("Starting Claude Code with MCP configuration...");

  // Setup MCP configuration
  const mcpConfigs = setupMcpForClaudeCode({
    routaServerUrl: "http://localhost:3000",
    workspaceId: "my-workspace",
  });

  // Build Claude Code config
  const preset = getPresetById("claude");
  if (!preset) {
    throw new Error("Claude preset not found");
  }

  const config = {
    preset,
    command: "claude",
    cwd: workspacePath,
    displayName: "Claude Code",
    permissionMode: "acceptEdits",
    mcpConfigs, // MCP configs
  };

  // Create and start process
  const process = new ClaudeCodeProcess(config, (notification) => {
    console.log("Claude Code notification:", notification);
  });

  await process.start();
  console.log("Claude Code started with MCP enabled");

  return process;
}

// ─── Example 3: OpenCode with MCP ──────────────────────────────────────

export async function startOpenCodeWithMcp(workspacePath: string) {
  console.log("Starting OpenCode with MCP configuration...");

  // Setup MCP configuration
  const mcpConfigs = setupMcpForOpenCode({
    routaServerUrl: "http://localhost:3000",
    workspaceId: "my-workspace",
  });

  // Build process config
  const config = buildConfigFromPreset(
    "opencode",
    workspacePath,
    [],
    {},
    mcpConfigs
  );

  // Create and start process
  const process = new AcpProcess(config, (notification) => {
    console.log("OpenCode notification:", notification);
  });

  await process.start();
  console.log("OpenCode started with MCP enabled");

  return process;
}

// ─── Example 4: Using Environment Variables ────────────────────────────

export async function startProviderWithDefaultMcp(
  providerId: "codex" | "claude" | "opencode",
  workspacePath: string
) {
  console.log(`Starting ${providerId} with default MCP configuration...`);

  // Use default config from environment variables
  const defaultConfig = getDefaultRoutaMcpConfig();
  console.log("Default MCP config:", defaultConfig);

  let mcpConfigs: string[];
  if (providerId === "codex") {
    mcpConfigs = setupMcpForCodex(defaultConfig);
  } else if (providerId === "claude") {
    mcpConfigs = setupMcpForClaudeCode(defaultConfig);
  } else {
    mcpConfigs = setupMcpForOpenCode(defaultConfig);
  }

  const config = buildConfigFromPreset(
    providerId,
    workspacePath,
    [],
    {},
    mcpConfigs
  );

  const process = new AcpProcess(config, (notification) => {
    console.log(`${providerId} notification:`, notification);
  });

  await process.start();
  return process;
}

// ─── Example Usage ──────────────────────────────────────────────────────

if (require.main === module) {
  const workspacePath = process.cwd();

  // Example: Start Codex with MCP
  startCodexWithMcp(workspacePath)
    .then((process) => {
      console.log("Codex process started successfully");
      // You can now send prompts to the process
    })
    .catch((error) => {
      console.error("Failed to start Codex:", error);
    });
}

