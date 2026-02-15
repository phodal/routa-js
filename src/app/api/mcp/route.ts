/**
 * MCP Server API Route - /api/mcp
 *
 * Exposes the Routa MCP server via SSE (Server-Sent Events) transport.
 * External MCP clients (Claude Code, MCP Inspector, etc.) connect here.
 *
 * GET  /api/mcp - SSE stream for MCP messages
 * POST /api/mcp - Send MCP JSON-RPC messages
 */

import { NextRequest, NextResponse } from "next/server";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createRoutaMcpServer } from "@/core/mcp/routa-mcp-server";
import { executeMcpTool, getMcpToolDefinitions } from "@/core/mcp/mcp-tool-executor";

// Keep a reference to the server and active transports
const transports = new Map<string, SSEServerTransport>();

const DEFAULT_WORKSPACE_ID = "default";

export async function GET(request: NextRequest) {
  const { server } = createRoutaMcpServer(DEFAULT_WORKSPACE_ID);

  // Create SSE response
  const encoder = new TextEncoder();
  let transport: SSEServerTransport;

  const stream = new ReadableStream({
    start(controller) {
      // Create a fake response object for the SSE transport
      const sessionId = crypto.randomUUID();

      // Use a custom writable approach since we're in Next.js
      const responseObj = {
        writeHead: (_status: number, _headers: Record<string, string>) => responseObj,
        write: (data: string) => {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // Stream closed
          }
          return true;
        },
        on: (_event: string, _handler: () => void) => responseObj,
        end: () => {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        },
      };

      // Note: SSE transport needs actual HTTP res/req objects.
      // For Next.js App Router, we provide a simplified SSE stream.
      const eventStream = () => {
        // Send SSE endpoint info
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "endpoint", url: `/api/mcp?sessionId=${sessionId}` })}\n\n`
          )
        );
      };

      eventStream();

      // Store session for POST handler
      transports.set(sessionId, undefined as unknown as SSEServerTransport);

      // Clean up on close
      request.signal.addEventListener("abort", () => {
        transports.delete(sessionId);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { server, system } = createRoutaMcpServer(DEFAULT_WORKSPACE_ID);

    // Handle JSON-RPC directly
    // This is a simplified handler that processes MCP tool calls
    if (body.method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: getMcpToolDefinitions(),
        },
      });
    }

    if (body.method === "tools/call") {
      const { name, arguments: args } = body.params;
      const result = await executeMcpTool(system.tools, name, args);
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result,
      });
    }

    // Initialize
    if (body.method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "routa-mcp",
            version: "0.1.0",
          },
        },
      });
    }

    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: `Method not found: ${body.method}` },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : "Internal error",
        },
      },
      { status: 200 }
    );
  }
}
