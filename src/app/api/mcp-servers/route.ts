/**
 * Custom MCP Servers API
 *
 * REST API for managing user-defined MCP server configurations.
 * These servers are merged with the built-in routa-coordination server
 * when spawning ACP provider processes.
 *
 * Endpoints:
 * - GET /api/mcp-servers          - List all custom MCP servers
 * - GET /api/mcp-servers?id=<id>  - Get a specific MCP server
 * - POST /api/mcp-servers         - Create a new MCP server
 * - PUT /api/mcp-servers          - Update an existing MCP server
 * - DELETE /api/mcp-servers?id=<id> - Delete a MCP server
 */

import { NextRequest, NextResponse } from "next/server";
import { getDatabase, isPostgres } from "@/core/db";
import { PostgresCustomMcpServerStore } from "@/core/store/custom-mcp-server-store";
import type { McpServerType } from "@/core/store/custom-mcp-server-store";

const VALID_TYPES: McpServerType[] = ["stdio", "http", "sse"];

// ─── GET /api/mcp-servers ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const workspaceId = searchParams.get("workspaceId") ?? undefined;

    if (!isPostgres()) {
      return NextResponse.json(
        { error: "MCP Servers API requires Postgres database" },
        { status: 501 }
      );
    }

    const db = getDatabase();
    const store = new PostgresCustomMcpServerStore(db);

    if (id) {
      const server = await store.get(id);
      if (!server) {
        return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
      }
      return NextResponse.json(server);
    }

    const servers = await store.list(workspaceId);
    return NextResponse.json({ servers });
  } catch (error) {
    console.error("[McpServersAPI] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load MCP servers", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── POST /api/mcp-servers ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "MCP Servers API requires Postgres database" },
        { status: 501 }
      );
    }

    const body = await request.json();
    const { id, name, description, type, command, args, url, headers, env, enabled, workspaceId } = body;

    // Validate required fields
    if (!id || !name || !type) {
      return NextResponse.json(
        { error: "Missing required fields: id, name, type" },
        { status: 400 }
      );
    }

    // Validate type
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate stdio servers have command
    if (type === "stdio" && !command) {
      return NextResponse.json(
        { error: "stdio type requires a command" },
        { status: 400 }
      );
    }

    // Validate http/sse servers have url
    if ((type === "http" || type === "sse") && !url) {
      return NextResponse.json(
        { error: `${type} type requires a url` },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const store = new PostgresCustomMcpServerStore(db);

    const server = await store.create({
      id,
      name,
      description,
      type,
      command,
      args,
      url,
      headers,
      env,
      enabled: enabled ?? true,
      workspaceId,
    });

    return NextResponse.json(
      { server, message: "MCP server created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("[McpServersAPI] POST error:", error);
    return NextResponse.json(
      { error: "Failed to create MCP server", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── PUT /api/mcp-servers ───────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "MCP Servers API requires Postgres database" },
        { status: 501 }
      );
    }

    const body = await request.json();
    const { id, name, description, type, command, args, url, headers, env, enabled } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Validate type if provided
    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type: ${type}. Must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const store = new PostgresCustomMcpServerStore(db);

    const server = await store.update(id, {
      name,
      description,
      type,
      command,
      args,
      url,
      headers,
      env,
      enabled,
    });

    if (!server) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    return NextResponse.json({
      server,
      message: "MCP server updated successfully",
    });
  } catch (error) {
    console.error("[McpServersAPI] PUT error:", error);
    return NextResponse.json(
      { error: "Failed to update MCP server", details: String(error) },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/mcp-servers ────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    if (!isPostgres()) {
      return NextResponse.json(
        { error: "MCP Servers API requires Postgres database" },
        { status: 501 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const store = new PostgresCustomMcpServerStore(db);

    const deleted = await store.delete(id);

    if (!deleted) {
      return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "MCP server deleted successfully",
    });
  } catch (error) {
    console.error("[McpServersAPI] DELETE error:", error);
    return NextResponse.json(
      { error: "Failed to delete MCP server", details: String(error) },
      { status: 500 }
    );
  }
}
