/**
 * RoutaMcpServer - port of routa-core RoutaMcpServer.kt
 *
 * Creates and configures an MCP Server with all Routa coordination tools.
 * Equivalent to the Kotlin RoutaMcpServer.create() factory.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RoutaMcpToolManager, ToolMode } from "./routa-mcp-tool-manager";
import { RoutaSystem, getRoutaSystem } from "../routa-system";
import { getRoutaOrchestrator } from "../orchestration/orchestrator-singleton";

export interface RoutaMcpServerResult {
  server: McpServer;
  system: RoutaSystem;
  toolManager: RoutaMcpToolManager;
}

export interface CreateMcpServerOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Tool mode: "essential" (7 tools) or "full" (all tools). Default: "essential" */
  toolMode?: ToolMode;
  /** Optional existing RoutaSystem instance */
  system?: RoutaSystem;
}

/**
 * Create a configured MCP server with Routa coordination tools.
 * If an orchestrator is available, it will be wired in for process-spawning delegation.
 *
 * @param options.toolMode - "essential" for 7 core tools (weak models), "full" for all 34 tools
 */
export function createRoutaMcpServer(
  workspaceIdOrOptions: string | CreateMcpServerOptions,
  system?: RoutaSystem
): RoutaMcpServerResult {
  // Support both old signature (workspaceId, system?) and new (options)
  const opts: CreateMcpServerOptions =
    typeof workspaceIdOrOptions === "string"
      ? { workspaceId: workspaceIdOrOptions, system, toolMode: "essential" }
      : workspaceIdOrOptions;

  const routaSystem = opts.system ?? getRoutaSystem();
  const toolMode = opts.toolMode ?? "essential";

  const server = new McpServer({
    name: "routa-mcp",
    version: "0.1.0",
  });

  const toolManager = new RoutaMcpToolManager(routaSystem.tools, opts.workspaceId);
  toolManager.setToolMode(toolMode);

  // Wire in orchestrator if available
  const orchestrator = getRoutaOrchestrator();
  if (orchestrator) {
    toolManager.setOrchestrator(orchestrator);
  }

  // Wire in note tools and workspace tools
  toolManager.setNoteTools(routaSystem.noteTools);
  toolManager.setWorkspaceTools(routaSystem.workspaceTools);

  toolManager.registerTools(server);

  return { server, system: routaSystem, toolManager };
}
