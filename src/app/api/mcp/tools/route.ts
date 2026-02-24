import { NextRequest, NextResponse } from "next/server";
import { createRoutaMcpServer } from "@/core/mcp/routa-mcp-server";
import { executeMcpTool, getMcpToolDefinitions } from "@/core/mcp/mcp-tool-executor";
import { ToolMode } from "@/core/mcp/routa-mcp-tool-manager";

const DEFAULT_WORKSPACE_ID = "default";

/**
 * GET /api/mcp/tools - List all MCP tool definitions
 *
 * Query params:
 * - mode: "essential" (default, 7 tools) or "full" (all 34 tools)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") ?? "essential") as ToolMode;
  const toolMode: ToolMode = mode === "full" ? "full" : "essential";

  return NextResponse.json({
    tools: getMcpToolDefinitions(toolMode),
    mode: toolMode,
  });
}

/**
 * POST /api/mcp/tools - Execute a specific tool by name
 *
 * Body: { name: string, args: object, mode?: "essential" | "full" }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name : "";
    const args =
      body?.args && typeof body.args === "object"
        ? (body.args as Record<string, unknown>)
        : {};
    const toolMode: ToolMode = body?.mode === "full" ? "full" : "essential";

    if (!name) {
      return NextResponse.json({ error: "Tool name is required" }, { status: 400 });
    }

    // Always validate against full tool list (execution should work regardless of mode)
    const toolExists = getMcpToolDefinitions("full").some((tool) => tool.name === name);
    if (!toolExists) {
      return NextResponse.json({ error: `Unknown tool: ${name}` }, { status: 400 });
    }

    const { system } = createRoutaMcpServer({ workspaceId: DEFAULT_WORKSPACE_ID, toolMode });
    const result = await executeMcpTool(system.tools, name, args, system.noteTools, system.workspaceTools);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error" },
      { status: 500 }
    );
  }
}
