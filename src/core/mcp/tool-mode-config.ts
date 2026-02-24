/**
 * Global Tool Mode Configuration
 *
 * Controls which MCP tools are exposed to agents.
 * - "essential": 7 core Agent coordination tools (best for weak models)
 * - "full": All 34 tools (Task, Agent, Note, Workspace, Git)
 */

import { ToolMode } from "./routa-mcp-tool-manager";

/**
 * Global tool mode configuration.
 * Default is "essential" for better compatibility with weak models.
 * Can be set via ROUTA_TOOL_MODE env var or changed at runtime.
 */
let globalToolMode: ToolMode =
  (process.env.ROUTA_TOOL_MODE as ToolMode) || "essential";

/**
 * Set the global tool mode.
 * This affects all new MCP sessions.
 */
export function setGlobalToolMode(mode: ToolMode): void {
  globalToolMode = mode;
  console.log(`[ToolModeConfig] Global tool mode set to: ${mode}`);
}

/**
 * Get the current global tool mode.
 */
export function getGlobalToolMode(): ToolMode {
  return globalToolMode;
}

