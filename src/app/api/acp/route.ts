/**
 * ACP Server API Route - /api/acp
 *
 * Exposes the Routa ACP agent via JSON-RPC over HTTP.
 * Clients (browser, OpenCode, etc.) connect here via ACP protocol.
 *
 * KEY DESIGN: Prompt responses are returned INLINE in the JSON-RPC result
 * so they work even without SSE. SSE is supplementary for real-time streaming.
 *
 * POST /api/acp - Send ACP JSON-RPC messages
 * GET  /api/acp - SSE stream for ACP session updates
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getRoutaSystem } from "@/core/routa-system";
import { SkillRegistry } from "@/core/skills/skill-registry";
import { AgentRole, AgentStatus } from "@/core/models/agent";

// ─── Session state ─────────────────────────────────────────────────────

interface AcpServerSession {
  id: string;
  cwd: string;
  routaAgentId?: string;
  workspaceId: string;
  createdAt: Date;
}

const sessions = new Map<string, AcpServerSession>();
const sseClients = new Map<
  string,
  ReadableStreamDefaultController<Uint8Array>
>();

// Skill registry singleton
let skillRegistry: SkillRegistry | undefined;

function getSkillRegistry(): SkillRegistry {
  if (!skillRegistry) {
    skillRegistry = new SkillRegistry({
      projectDir: process.cwd(),
    });
  }
  return skillRegistry;
}

// ─── GET: SSE stream for session updates ───────────────────────────────

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const clientId = sessionId ?? uuidv4();
      sseClients.set(clientId, controller);

      // Send connection established
      const event = `data: ${JSON.stringify({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: clientId,
          sessionUpdate: "connected",
        },
      })}\n\n`;
      controller.enqueue(encoder.encode(event));

      request.signal.addEventListener("abort", () => {
        sseClients.delete(clientId);
        try {
          controller.close();
        } catch {
          // already closed
        }
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

// ─── POST: ACP JSON-RPC handler ────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { method, params, id } = body;

    switch (method) {
      case "initialize":
        return jsonrpcResponse(id, {
          protocolVersion: params?.protocolVersion ?? "0.1.0",
          agentCapabilities: {
            streaming: true,
            skills: true,
            loadSession: true,
          },
          agentInfo: {
            name: "routa-acp",
            version: "0.1.0",
          },
        });

      case "session/new":
        return handleNewSession(id, params);

      case "session/prompt":
        return handlePrompt(id, params);

      case "session/cancel":
        return jsonrpcResponse(id, { cancelled: true });

      case "session/load":
        return handleLoadSession(id, params);

      case "session/set_mode":
        return jsonrpcResponse(id, { mode: params?.mode ?? "default" });

      // ─── Extension methods ─────────────────────────────────────

      case "skills/list":
        return handleSkillsList(id);

      case "skills/load":
        return handleSkillLoad(id, params);

      case "agents/list":
        return handleAgentsList(id, params);

      case "tools/call":
        return handleToolCall(id, params);

      default:
        return jsonrpcResponse(id, null, {
          code: -32601,
          message: `Method not found: ${method}`,
        });
    }
  } catch (error) {
    return jsonrpcResponse(null, null, {
      code: -32603,
      message: error instanceof Error ? error.message : "Internal error",
    });
  }
}

// ─── Handler implementations ───────────────────────────────────────────

async function handleNewSession(
  id: string | number,
  params: { cwd?: string; mcpServers?: unknown[] }
) {
  const system = getRoutaSystem();
  const sessionId = uuidv4();
  const workspaceId = params?.cwd ?? "default";

  // Create a coordinator agent for this session
  const createResult = await system.tools.createAgent({
    name: `routa-session-${sessionId.slice(0, 8)}`,
    role: AgentRole.ROUTA,
    workspaceId,
  });

  const routaAgentId =
    createResult.success && createResult.data
      ? (createResult.data as { agentId: string }).agentId
      : undefined;

  // *** FIX: Activate the agent immediately ***
  if (routaAgentId) {
    await system.agentStore.updateStatus(routaAgentId, AgentStatus.ACTIVE);
  }

  const session: AcpServerSession = {
    id: sessionId,
    cwd: params?.cwd ?? process.cwd(),
    routaAgentId,
    workspaceId,
    createdAt: new Date(),
  };
  sessions.set(sessionId, session);

  // Get available skills
  const registry = getSkillRegistry();
  const skills = registry.listSkillSummaries();

  // Return session info with skills (SSE may not be connected yet)
  return jsonrpcResponse(id, {
    sessionId,
    agentId: routaAgentId,
    availableCommands: skills.map((s) => ({
      name: s.name,
      description: s.description,
    })),
  });
}

async function handlePrompt(
  id: string | number,
  params: {
    sessionId: string;
    prompt?: Array<{ type: string; text?: string }>;
  }
) {
  const session = sessions.get(params.sessionId);
  if (!session) {
    return jsonrpcResponse(id, null, {
      code: -32602,
      message: `Session not found: ${params.sessionId}`,
    });
  }

  const system = getRoutaSystem();
  const promptText =
    params.prompt
      ?.filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n") ?? "";

  // Collect messages to return inline
  const messages: Array<{
    role: string;
    content: string;
    toolName?: string;
    toolCallId?: string;
    toolStatus?: string;
    toolResult?: unknown;
  }> = [];

  // Check for skill invocation
  if (promptText.startsWith("/")) {
    const registry = getSkillRegistry();
    const skillName = promptText.slice(1).split(" ")[0];
    const skill = registry.getSkill(skillName);
    if (skill) {
      const content = `**Skill: ${skill.name}**\n\n${skill.content}`;
      messages.push({ role: "assistant", content });

      // Also send via SSE if connected
      sendSessionUpdate(params.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content,
      });

      return jsonrpcResponse(id, {
        stopReason: "end_turn",
        messages,
      });
    }
  }

  // Route through Routa coordination
  if (session.routaAgentId) {
    // Thinking
    messages.push({
      role: "thinking",
      content: "Analyzing request and coordinating agents...",
    });
    sendSessionUpdate(params.sessionId, {
      sessionUpdate: "agent_thought_chunk",
      content: "Analyzing request and coordinating agents...",
    });

    // Execute list_agents tool
    const agentListResult = await system.tools.listAgents(
      session.workspaceId
    );
    const toolCallId = uuidv4();

    messages.push({
      role: "tool",
      content: JSON.stringify(agentListResult.data, null, 2),
      toolName: "list_agents",
      toolCallId,
      toolStatus: "completed",
      toolResult: agentListResult.data,
    });

    sendSessionUpdate(params.sessionId, {
      sessionUpdate: "tool_call",
      toolCallId,
      toolName: "list_agents",
      toolStatus: "completed",
      toolResult: agentListResult.data,
    });

    // Generate response based on the prompt
    const agents = (agentListResult.data as Array<{
      id: string;
      name: string;
      role: string;
      status: string;
    }>) ?? [];

    let responseText: string;

    // Simple command processing
    if (
      promptText.toLowerCase().includes("create") &&
      promptText.toLowerCase().includes("agent")
    ) {
      // Extract agent name from prompt
      const nameMatch = promptText.match(
        /(?:named?|called?)\s+["']?(\w[\w-]*)["']?/i
      );
      const agentName = nameMatch?.[1] ?? `crafter-${Date.now()}`;
      const roleMatch = promptText.match(
        /\b(ROUTA|CRAFTER|GATE|routa|crafter|gate)\b/i
      );
      const role = roleMatch?.[1]?.toUpperCase() ?? "CRAFTER";

      const createResult = await system.tools.createAgent({
        name: agentName,
        role,
        workspaceId: session.workspaceId,
        parentId: session.routaAgentId,
      });

      if (createResult.success) {
        const created = createResult.data as {
          agentId: string;
          name: string;
          role: string;
        };
        // Activate the new agent FIRST, then build result
        await system.agentStore.updateStatus(
          created.agentId,
          AgentStatus.ACTIVE
        );

        const createdWithStatus = { ...created, status: "ACTIVE" };
        const createToolId = uuidv4();
        messages.push({
          role: "tool",
          content: JSON.stringify(createdWithStatus, null, 2),
          toolName: "create_agent",
          toolCallId: createToolId,
          toolStatus: "completed",
          toolResult: createdWithStatus,
        });

        responseText =
          `Created agent **${created.name}** (${created.role}).\n\n` +
          `Agent ID: \`${created.agentId}\`\n` +
          `Status: ACTIVE\n` +
          `Parent: ${session.routaAgentId}`;
      } else {
        responseText = `Failed to create agent: ${createResult.error}`;
      }
    } else if (
      promptText.toLowerCase().includes("list") &&
      promptText.toLowerCase().includes("agent")
    ) {
      if (agents.length === 0) {
        responseText = "No agents in the workspace yet.";
      } else {
        responseText =
          `**${agents.length} agent(s) in workspace:**\n\n` +
          agents
            .map(
              (a) =>
                `- **${a.name}** (${a.role}) - ${a.status}\n  ID: \`${a.id}\``
            )
            .join("\n");
      }
    } else if (
      promptText.toLowerCase().includes("status") ||
      promptText.toLowerCase().includes("info")
    ) {
      responseText =
        `**Routa Coordinator**\n\n` +
        `Workspace: \`${session.workspaceId}\`\n` +
        `Session: \`${session.id}\`\n` +
        `Agent ID: \`${session.routaAgentId}\`\n` +
        `Agents: ${agents.length}\n\n` +
        `**Available tools:**\n` +
        `- \`list_agents\` - List all agents\n` +
        `- \`create_agent\` - Create a new agent (ROUTA/CRAFTER/GATE)\n` +
        `- \`delegate_task\` - Assign task to agent\n` +
        `- \`send_message_to_agent\` - Message between agents\n` +
        `- \`report_to_parent\` - Submit completion report\n` +
        `- \`get_agent_status\` - Check agent status\n` +
        `- \`get_agent_summary\` - Get agent summary\n` +
        `- \`subscribe_to_events\` - Subscribe to events`;
    } else {
      // General response
      responseText =
        `**Routa Coordinator** received your message.\n\n` +
        `> ${promptText}\n\n` +
        `Workspace has **${agents.length}** agent(s).\n\n` +
        `You can:\n` +
        `- "create agent named X" - create a new CRAFTER agent\n` +
        `- "list agents" - show all agents\n` +
        `- "status" - show coordinator info\n` +
        `- "/skill-name" - invoke a skill`;
    }

    messages.push({ role: "assistant", content: responseText });

    // Send via SSE too
    sendSessionUpdate(params.sessionId, {
      sessionUpdate: "agent_message_chunk",
      content: responseText,
    });
  }

  return jsonrpcResponse(id, {
    stopReason: "end_turn",
    messages,
  });
}

async function handleLoadSession(
  id: string | number,
  params: { sessionId: string }
) {
  const session = sessions.get(params.sessionId);
  if (!session) {
    return jsonrpcResponse(id, null, {
      code: -32602,
      message: `Session not found: ${params.sessionId}`,
    });
  }
  return jsonrpcResponse(id, { sessionId: session.id });
}

async function handleSkillsList(id: string | number) {
  const registry = getSkillRegistry();
  return jsonrpcResponse(id, {
    skills: registry.listSkills().map((s) => ({
      name: s.name,
      description: s.description,
      license: s.license,
      compatibility: s.compatibility,
      metadata: s.metadata,
    })),
  });
}

async function handleSkillLoad(
  id: string | number,
  params: { name: string }
) {
  const registry = getSkillRegistry();
  const skill = registry.getSkill(params.name);
  if (!skill) {
    return jsonrpcResponse(id, null, {
      code: -32602,
      message: `Skill not found: ${params.name}`,
    });
  }
  return jsonrpcResponse(id, {
    name: skill.name,
    description: skill.description,
    content: skill.content,
    license: skill.license,
    metadata: skill.metadata,
  });
}

async function handleAgentsList(
  id: string | number,
  params: { workspaceId?: string }
) {
  const system = getRoutaSystem();
  const result = await system.tools.listAgents(
    params?.workspaceId ?? "default"
  );
  return jsonrpcResponse(id, result.data);
}

async function handleToolCall(
  id: string | number,
  params: { name: string; arguments: Record<string, unknown> }
) {
  const system = getRoutaSystem();
  const tools = system.tools;
  const toolName = params.name;
  const args = params.arguments ?? {};

  try {
    let result;
    switch (toolName) {
      case "list_agents":
        result = await tools.listAgents(
          (args.workspaceId as string) ?? "default"
        );
        break;
      case "create_agent":
        result = await tools.createAgent({
          name: args.name as string,
          role: args.role as string,
          workspaceId: (args.workspaceId as string) ?? "default",
          parentId: args.parentId as string | undefined,
          modelTier: args.modelTier as string | undefined,
        });
        break;
      case "get_agent_status":
        result = await tools.getAgentStatus(args.agentId as string);
        break;
      case "get_agent_summary":
        result = await tools.getAgentSummary(args.agentId as string);
        break;
      case "delegate_task":
        result = await tools.delegate({
          agentId: args.agentId as string,
          taskId: args.taskId as string,
          callerAgentId: args.callerAgentId as string,
        });
        break;
      case "send_message_to_agent":
        result = await tools.messageAgent({
          fromAgentId: args.fromAgentId as string,
          toAgentId: args.toAgentId as string,
          message: args.message as string,
        });
        break;
      default:
        return jsonrpcResponse(id, null, {
          code: -32602,
          message: `Unknown tool: ${toolName}`,
        });
    }
    return jsonrpcResponse(id, result);
  } catch (err) {
    return jsonrpcResponse(id, null, {
      code: -32603,
      message: err instanceof Error ? err.message : "Tool execution failed",
    });
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function sendSessionUpdate(
  sessionId: string,
  update: Record<string, unknown>
) {
  const controller = sseClients.get(sessionId);
  if (controller) {
    const encoder = new TextEncoder();
    const event = `data: ${JSON.stringify({
      jsonrpc: "2.0",
      method: "session/update",
      params: { sessionId, ...update },
    })}\n\n`;
    try {
      controller.enqueue(encoder.encode(event));
    } catch {
      sseClients.delete(sessionId);
    }
  }
}

function jsonrpcResponse(
  id: string | number | null,
  result: unknown,
  error?: { code: number; message: string }
) {
  if (error) {
    return NextResponse.json({ jsonrpc: "2.0", id, error });
  }
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}
