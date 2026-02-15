/**
 * Standalone MCP Server Management API - /api/mcp-server
 *
 * Manages the standalone RoutaMcpHttpServer that provides both
 * Streamable HTTP and WebSocket transports on a dynamic port.
 *
 * This is analogous to the Java RoutaMcpWebSocketServer which is
 * started by AcpSessionManager for multi-agent coordination.
 *
 * Endpoints:
 *   GET  /api/mcp-server          - Get server status + URLs
 *   POST /api/mcp-server          - Start the server
 *   DELETE /api/mcp-server        - Stop the server
 */

import { NextResponse } from "next/server";
import {
  getOrStartMcpServer,
  getMcpServer,
  stopMcpServer,
} from "@/core/mcp/mcp-server-singleton";

export const dynamic = "force-dynamic";

/**
 * GET: Check the standalone MCP server status.
 */
export async function GET() {
  const server = getMcpServer();

  if (!server) {
    return NextResponse.json({
      running: false,
      message:
        "Standalone MCP server is not running. POST to /api/mcp-server to start it.",
      fallback: "/api/mcp (Next.js Streamable HTTP route)",
    });
  }

  return NextResponse.json({
    running: true,
    port: server.port,
    mcpUrl: server.mcpUrl,
    wsUrl: server.wsUrl,
    transports: ["streamable-http", "websocket"],
  });
}

/**
 * POST: Start the standalone MCP server.
 */
export async function POST() {
  try {
    const server = await getOrStartMcpServer("default");
    return NextResponse.json({
      running: true,
      port: server.port,
      mcpUrl: server.mcpUrl,
      wsUrl: server.wsUrl,
      transports: ["streamable-http", "websocket"],
      message: "Standalone MCP server started successfully.",
    });
  } catch (error) {
    console.error("[MCP Server API] Failed to start:", error);
    return NextResponse.json(
      {
        running: false,
        error: error instanceof Error ? error.message : "Failed to start",
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Stop the standalone MCP server.
 */
export async function DELETE() {
  try {
    await stopMcpServer();
    return NextResponse.json({
      running: false,
      message: "Standalone MCP server stopped.",
    });
  } catch (error) {
    console.error("[MCP Server API] Failed to stop:", error);
    return NextResponse.json(
      {
        running: false,
        error: error instanceof Error ? error.message : "Failed to stop",
      },
      { status: 500 },
    );
  }
}
