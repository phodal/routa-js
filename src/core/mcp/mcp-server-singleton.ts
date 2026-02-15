/**
 * MCP Server Singleton
 *
 * Manages a single global instance of RoutaMcpHttpServer.
 *
 * The standalone MCP server provides two transports:
 *   - Streamable HTTP at /mcp (for CLI agents: Claude, Copilot, Auggie, …)
 *   - WebSocket at /ws (for MCP Inspector and other WS clients)
 *
 * This mirrors the Java AcpSessionManager pattern where RoutaMcpWebSocketServer
 * is started lazily on the first session and reused across all sessions.
 *
 * Usage:
 *   const server = await getOrStartMcpServer("my-workspace");
 *   console.log(server.mcpUrl);  // http://127.0.0.1:54321/mcp
 *   console.log(server.wsUrl);   // ws://127.0.0.1:54321/ws
 */

import { RoutaMcpHttpServer } from "./routa-mcp-http-server";

let instance: RoutaMcpHttpServer | null = null;

/**
 * Get the running MCP server instance, or start one if it doesn't exist.
 */
export async function getOrStartMcpServer(
  workspaceId: string = "default",
): Promise<RoutaMcpHttpServer> {
  if (instance && instance.isRunning) {
    return instance;
  }

  instance = new RoutaMcpHttpServer(workspaceId);
  await instance.start();
  return instance;
}

/**
 * Get the MCP server instance if running, or null.
 */
export function getMcpServer(): RoutaMcpHttpServer | null {
  return instance?.isRunning ? instance : null;
}

/**
 * Stop the MCP server if running.
 */
export async function stopMcpServer(): Promise<void> {
  if (instance?.isRunning) {
    await instance.stop();
  }
  instance = null;
}

/**
 * Get the Streamable HTTP URL for the MCP server.
 * Returns the standalone server's URL if running, otherwise falls back
 * to the Next.js /api/mcp route.
 *
 * @param fallbackPort - The port of the Next.js server (default: 3000)
 */
export function getMcpEndpointUrl(fallbackPort: string = "3000"): string {
  if (instance?.isRunning) {
    return instance.mcpUrl;
  }
  // Fall back to the Next.js API route
  const host = process.env.HOST || "localhost";
  const port = process.env.PORT || fallbackPort;
  return `http://${host}:${port}/api/mcp`;
}
