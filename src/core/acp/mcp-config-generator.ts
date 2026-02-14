/**
 * MCP Configuration Generator
 *
 * Generates MCP configuration JSON for connecting AI providers
 * (Claude Code, Codex, OpenCode) to the Routa MCP server.
 *
 * The Routa MCP server exposes coordination tools via HTTP at /api/mcp.
 * This module creates the necessary MCP config JSON that can be passed
 * to providers via --mcp-config flags.
 */

export interface RoutaMcpConfig {
  /** Base URL of the routa-js server (e.g., http://localhost:3000) */
  routaServerUrl: string;
  /** Workspace ID for the MCP session */
  workspaceId?: string;
}

export interface McpServerConfig {
  /** MCP server name/identifier */
  name: string;
  /** Server type: "http" for HTTP-based MCP servers */
  type: "http" | "stdio";
  /** HTTP endpoint URL (for type: "http") */
  url?: string;
  /** Command to execute (for type: "stdio") */
  command?: string;
  /** Command arguments (for type: "stdio") */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Generate MCP configuration JSON for connecting to Routa MCP server.
 *
 * This creates a configuration that tells the AI provider (Claude Code, Codex, OpenCode)
 * how to connect to the Routa MCP server to access coordination tools.
 *
 * @param config - Routa MCP configuration
 * @returns MCP server configuration object
 */
export function generateRoutaMcpConfig(config: RoutaMcpConfig): McpServerConfig {
  const { routaServerUrl, workspaceId = "default" } = config;

  // Construct the MCP endpoint URL
  const mcpEndpoint = `${routaServerUrl}/api/mcp`;

  return {
    name: "routa-coordination",
    type: "http",
    url: mcpEndpoint,
    env: {
      ROUTA_WORKSPACE_ID: workspaceId,
    },
  };
}

/**
 * Generate MCP configuration JSON string for command-line usage.
 *
 * This creates a JSON string that can be passed directly to providers
 * via the --mcp-config flag.
 *
 * Example usage:
 *   const mcpConfigJson = generateRoutaMcpConfigJson({ routaServerUrl: "http://localhost:3000" });
 *   // Pass to Claude Code: claude --mcp-config <mcpConfigJson>
 *
 * @param config - Routa MCP configuration
 * @returns JSON string for MCP configuration
 */
export function generateRoutaMcpConfigJson(config: RoutaMcpConfig): string {
  const mcpConfig = generateRoutaMcpConfig(config);
  return JSON.stringify(mcpConfig);
}

/**
 * Generate MCP configuration for multiple Routa servers.
 *
 * This is useful when you want to connect to multiple Routa instances
 * or expose multiple MCP servers to the AI provider.
 *
 * @param configs - Array of Routa MCP configurations
 * @returns Array of MCP server configurations
 */
export function generateMultipleRoutaMcpConfigs(
  configs: RoutaMcpConfig[]
): McpServerConfig[] {
  return configs.map(generateRoutaMcpConfig);
}

/**
 * Get the default Routa MCP configuration for local development.
 *
 * Assumes routa-js is running on localhost:3000 (Next.js default port).
 *
 * @param workspaceId - Optional workspace ID (defaults to "default")
 * @returns Default MCP configuration
 */
export function getDefaultRoutaMcpConfig(workspaceId?: string): RoutaMcpConfig {
  return {
    routaServerUrl: process.env.ROUTA_SERVER_URL || "http://localhost:3000",
    workspaceId: workspaceId || process.env.ROUTA_WORKSPACE_ID || "default",
  };
}

/**
 * Validate MCP configuration.
 *
 * Checks if the configuration is valid and the server is reachable.
 *
 * @param config - MCP configuration to validate
 * @returns Promise that resolves to true if valid, false otherwise
 */
export async function validateRoutaMcpConfig(
  config: RoutaMcpConfig
): Promise<boolean> {
  try {
    const mcpEndpoint = `${config.routaServerUrl}/api/mcp`;
    
    // Try to make a simple health check or initialize request
    const response = await fetch(mcpEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "routa-config-validator", version: "0.1.0" },
        },
      }),
    });

    if (!response.ok) {
      console.error(`MCP server returned status ${response.status}`);
      return false;
    }

    const result = await response.json();
    return result.result && result.result.serverInfo;
  } catch (error) {
    console.error("Failed to validate MCP config:", error);
    return false;
  }
}

