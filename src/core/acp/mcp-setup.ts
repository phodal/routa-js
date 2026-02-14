/**
 * MCP Setup for ACP Providers
 *
 * Provides helper functions to configure MCP (Model Context Protocol) for
 * different ACP providers (Claude Code, Codex, OpenCode) to connect to
 * the Routa MCP server.
 *
 * Usage:
 *   import { setupMcpForProvider } from './mcp-setup';
 *   
 *   const mcpConfigs = setupMcpForProvider('codex', {
 *     routaServerUrl: 'http://localhost:3000',
 *     workspaceId: 'my-workspace'
 *   });
 *   
 *   const config = buildConfigFromPreset('codex', '/path/to/workspace', [], {}, mcpConfigs);
 */

import {
  generateRoutaMcpConfigJson,
  getDefaultRoutaMcpConfig,
  type RoutaMcpConfig,
} from "./mcp-config-generator";

/**
 * Provider IDs that support MCP configuration
 */
export type McpSupportedProvider = "claude" | "codex" | "opencode" | "auggie" | "gemini";

/**
 * Check if a provider supports MCP configuration.
 *
 * @param providerId - Provider ID to check
 * @returns True if the provider supports MCP
 */
export function providerSupportsMcp(providerId: string): boolean {
  const supportedProviders: McpSupportedProvider[] = [
    "claude",
    "codex",
    "opencode",
    "auggie",
    "gemini",
  ];
  return supportedProviders.includes(providerId as McpSupportedProvider);
}

/**
 * Setup MCP configuration for a specific provider.
 *
 * This generates the MCP configuration JSON strings that can be passed
 * to the provider via --mcp-config flags.
 *
 * @param providerId - Provider ID (claude, codex, opencode, etc.)
 * @param config - Routa MCP configuration (optional, uses defaults if not provided)
 * @returns Array of MCP config JSON strings
 */
export function setupMcpForProvider(
  providerId: McpSupportedProvider,
  config?: RoutaMcpConfig
): string[] {
  if (!providerSupportsMcp(providerId)) {
    console.warn(`Provider "${providerId}" does not support MCP configuration`);
    return [];
  }

  const mcpConfig = config || getDefaultRoutaMcpConfig();
  const mcpConfigJson = generateRoutaMcpConfigJson(mcpConfig);

  return [mcpConfigJson];
}

/**
 * Setup MCP for Claude Code.
 *
 * Claude Code uses the --mcp-config flag to specify MCP server configurations.
 *
 * @param config - Routa MCP configuration
 * @returns Array of MCP config JSON strings for Claude Code
 */
export function setupMcpForClaudeCode(config?: RoutaMcpConfig): string[] {
  return setupMcpForProvider("claude", config);
}

/**
 * Setup MCP for Codex.
 *
 * Codex (via codex-acp wrapper) may support --mcp-config flag.
 *
 * @param config - Routa MCP configuration
 * @returns Array of MCP config JSON strings for Codex
 */
export function setupMcpForCodex(config?: RoutaMcpConfig): string[] {
  return setupMcpForProvider("codex", config);
}

/**
 * Setup MCP for OpenCode.
 *
 * OpenCode may support --mcp-config flag for MCP server configurations.
 *
 * @param config - Routa MCP configuration
 * @returns Array of MCP config JSON strings for OpenCode
 */
export function setupMcpForOpenCode(config?: RoutaMcpConfig): string[] {
  return setupMcpForProvider("opencode", config);
}

/**
 * Setup MCP for Auggie.
 *
 * Auggie supports --mcp-config flag natively.
 *
 * @param config - Routa MCP configuration
 * @returns Array of MCP config JSON strings for Auggie
 */
export function setupMcpForAuggie(config?: RoutaMcpConfig): string[] {
  return setupMcpForProvider("auggie", config);
}

/**
 * Check if MCP is configured for a provider.
 *
 * This checks if the provider has MCP configs set up.
 *
 * @param mcpConfigs - MCP config array to check
 * @returns True if MCP is configured
 */
export function isMcpConfigured(mcpConfigs?: string[]): boolean {
  return !!mcpConfigs && mcpConfigs.length > 0;
}

/**
 * Get MCP status for a provider.
 *
 * @param providerId - Provider ID
 * @param mcpConfigs - Current MCP configs
 * @returns MCP status object
 */
export function getMcpStatus(
  providerId: string,
  mcpConfigs?: string[]
): {
  supported: boolean;
  configured: boolean;
  configCount: number;
} {
  return {
    supported: providerSupportsMcp(providerId),
    configured: isMcpConfigured(mcpConfigs),
    configCount: mcpConfigs?.length || 0,
  };
}

