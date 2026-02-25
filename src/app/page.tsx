"use client";

/**
 * Routa JS - Main Page
 *
 * Full-screen layout:
 *   - Top bar: Logo, Agent selector, protocol badges
 *   - Left sidebar: Provider selector, Sessions, Skills
 *   - Right area: Chat panel
 *   - Right sidebar (resizable): Task panel / CRAFTERs view
 */

import {useCallback, useEffect, useRef, useState} from "react";
import {SkillPanel} from "@/client/components/skill-panel";
import {ChatPanel} from "@/client/components/chat-panel";
import {SessionPanel} from "@/client/components/session-panel";
import {type CrafterAgent, TaskPanel} from "@/client/components/task-panel";
import {CollaborativeTaskEditor} from "@/client/components/collaborative-task-editor";
import {AgentInstallPanel} from "@/client/components/agent-install-panel";
import {WorkspaceSwitcher} from "@/client/components/workspace-switcher";
import {CodebasePicker} from "@/client/components/codebase-picker";
import {useWorkspaces, useCodebases} from "@/client/hooks/use-workspaces";
import {useAcp} from "@/client/hooks/use-acp";
import {useSkills} from "@/client/hooks/use-skills";
import {useNotes} from "@/client/hooks/use-notes";
import type {RepoSelection} from "@/client/components/repo-picker";
import type {ParsedTask} from "@/client/utils/task-block-parser";
import {ProtocolBadge} from "@/app/protocol-badge";

type AgentRole = "CRAFTER" | "ROUTA" | "GATE" | "DEVELOPER";

export default function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentRole>("CRAFTER");
  const [showAgentToast, setShowAgentToast] = useState(false);
  const [repoSelection, setRepoSelection] = useState<RepoSelection | null>(null);
  const [routaTasks, setRoutaTasks] = useState<ParsedTask[]>([]);

  // ── Workspace state ───────────────────────────────────────────────────
  const workspacesHook = useWorkspaces();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const { codebases } = useCodebases(activeWorkspaceId ?? "");

  // Auto-select first workspace on load
  useEffect(() => {
    if (!activeWorkspaceId && workspacesHook.workspaces.length > 0) {
      setActiveWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [workspacesHook.workspaces, activeWorkspaceId]);

  // Auto-select default codebase as repo when workspace changes
  useEffect(() => {
    if (codebases.length === 0) return;
    const def = codebases.find((c) => c.isDefault) ?? codebases[0];
    setRepoSelection({ path: def.repoPath, branch: def.branch ?? "", name: def.label ?? def.repoPath.split("/").pop() ?? "" });
  }, [codebases]);

  const handleCodebaseSelect = useCallback((repoPath: string) => {
    const codebase = codebases.find((c) => c.repoPath === repoPath);
    if (codebase) {
      setRepoSelection({ path: codebase.repoPath, branch: codebase.branch ?? "", name: codebase.label ?? codebase.repoPath.split("/").pop() ?? "" });
    }
  }, [codebases]);

  const handleWorkspaceSelect = useCallback((wsId: string) => {
    setActiveWorkspaceId(wsId);
    setActiveSessionId(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const ws = await workspacesHook.createWorkspace(title);
    if (ws) handleWorkspaceSelect(ws.id);
  }, [workspacesHook, handleWorkspaceSelect]);

  const acp = useAcp();
  const skillsHook = useSkills();
  const notesHook = useNotes(activeWorkspaceId ?? "");

  // ── Collaborative editing panel view ──────────────────────────────────
  const [taskPanelMode, setTaskPanelMode] = useState<"tasks" | "collab">("tasks");

  // ── Resizable right sidebar state ────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(0);

  // ── Resizable left sidebar state ──────────────────────────────────
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(280);
  const [isLeftResizing, setIsLeftResizing] = useState(false);
  const leftResizeStartXRef = useRef(0);
  const leftResizeStartWidthRef = useRef(0);

  // ── Mobile sidebar toggle ──────────────────────────────────────────
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showAgentInstallPopup, setShowAgentInstallPopup] = useState(false);
  const agentInstallCloseRef = useRef<HTMLButtonElement>(null);
  const installAgentsButtonRef = useRef<HTMLButtonElement>(null);

  // ── CRAFTERs view state ──────────────────────────────────────────────
  const [crafterAgents, setCrafterAgents] = useState<CrafterAgent[]>([]);
  const [activeCrafterId, setActiveCrafterId] = useState<string | null>(null);
  const [concurrency, setConcurrency] = useState(1);

  // ── Tool mode state ──────────────────────────────────────────────────
  const [toolMode, setToolMode] = useState<"essential" | "full">("essential");

  // Track last processed update index for child agent routing
  const lastChildUpdateIndexRef = useRef(0);

  // Auto-connect on mount so providers are loaded immediately
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load global tool mode on mount
  useEffect(() => {
    fetch("/api/mcp/tools")
      .then((res) => res.json())
      .then((data) => {
        if (data?.globalMode) {
          setToolMode(data.globalMode);
        }
      })
      .catch(() => {});
  }, []);

  // Toggle tool mode handler
  const handleToolModeToggle = useCallback(async (checked: boolean) => {
    const newMode = checked ? "essential" : "full";
    setToolMode(newMode);
    try {
      await fetch("/api/mcp/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
    } catch (error) {
      console.error("Failed to toggle tool mode:", error);
    }
  }, []);


  // Load repo skills when repo selection changes
  useEffect(() => {
    if (repoSelection?.path) {
      skillsHook.loadRepoSkills(repoSelection.path);
    } else {
      skillsHook.clearRepoSkills();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoSelection?.path]);

  // Agent Install popup: body scroll lock + Escape to close
  useEffect(() => {
    if (!showAgentInstallPopup) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowAgentInstallPopup(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showAgentInstallPopup]);

  // Agent Install popup: focus close button when open, restore focus when close
  const prevAgentPopupRef = useRef(false);
  useEffect(() => {
    if (showAgentInstallPopup) {
      prevAgentPopupRef.current = true;
      const t = requestAnimationFrame(() => agentInstallCloseRef.current?.focus());
      return () => cancelAnimationFrame(t);
    }
    if (prevAgentPopupRef.current) {
      prevAgentPopupRef.current = false;
      installAgentsButtonRef.current?.focus({ preventScroll: true });
    }
  }, [showAgentInstallPopup]);

  // ── Resize handlers (right sidebar) ──────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartXRef.current = e.clientX;
    resizeStartWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartXRef.current - e.clientX;
      const newWidth = Math.max(280, Math.min(700, resizeStartWidthRef.current + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizing]);

  // ── Resize handlers (left sidebar) ──────────────────────────────────

  const handleLeftResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsLeftResizing(true);
    leftResizeStartXRef.current = e.clientX;
    leftResizeStartWidthRef.current = leftSidebarWidth;
  }, [leftSidebarWidth]);

  useEffect(() => {
    if (!isLeftResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - leftResizeStartXRef.current;
      const newWidth = Math.max(200, Math.min(450, leftResizeStartWidthRef.current + delta));
      setLeftSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsLeftResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isLeftResizing]);

  // ── Route child agent SSE updates to crafter agents ──────────────────

  useEffect(() => {
    const updates = acp.updates;
    if (!updates.length) {
      lastChildUpdateIndexRef.current = 0;
      return;
    }

    const startIndex =
      lastChildUpdateIndexRef.current > updates.length
        ? 0
        : lastChildUpdateIndexRef.current;
    const pending = updates.slice(startIndex);
    if (!pending.length) return;
    lastChildUpdateIndexRef.current = updates.length;

    setCrafterAgents((prev) => {
      let updated = [...prev];
      let changed = false;

      for (const notification of pending) {
        const raw = notification as Record<string, unknown>;
        const update = (raw.update ?? raw) as Record<string, unknown>;
        const childAgentId = (update.childAgentId ?? raw.childAgentId) as string | undefined;

        if (!childAgentId) continue;

        const agentIdx = updated.findIndex((a) => a.id === childAgentId);
        if (agentIdx < 0) continue;

        const agent = { ...updated[agentIdx] };
        const messages = [...agent.messages];
        const kind = update.sessionUpdate as string | undefined;

        if (!kind) continue;
        changed = true;

        const extractText = (): string => {
          const content = update.content as { type: string; text?: string } | undefined;
          if (content?.text) return content.text;
          if (typeof update.text === "string") return update.text as string;
          return "";
        };

        switch (kind) {
          case "agent_message_chunk": {
            const text = extractText();
            if (!text) break;
            // Find or create streaming message
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && !lastMsg.toolName) {
              messages[messages.length - 1] = { ...lastMsg, content: lastMsg.content + text };
            } else {
              messages.push({
                id: crypto.randomUUID(),
                role: "assistant",
                content: text,
                timestamp: new Date(),
              });
            }
            break;
          }

          case "agent_thought_chunk": {
            const text = extractText();
            if (!text) break;
            const lastMsg = messages[messages.length - 1];
            if (lastMsg && lastMsg.role === "thought") {
              messages[messages.length - 1] = { ...lastMsg, content: lastMsg.content + text };
            } else {
              messages.push({
                id: crypto.randomUUID(),
                role: "thought",
                content: text,
                timestamp: new Date(),
              });
            }
            break;
          }

          case "tool_call": {
            const toolCallId = update.toolCallId as string | undefined;
            const title = (update.title as string) ?? "tool";
            const status = (update.status as string) ?? "running";
            messages.push({
              id: toolCallId ?? crypto.randomUUID(),
              role: "tool",
              content: title,
              timestamp: new Date(),
              toolName: title,
              toolStatus: status,
            });
            break;
          }

          case "tool_call_update": {
            const toolCallId = update.toolCallId as string | undefined;
            const status = update.status as string | undefined;
            if (toolCallId) {
              const idx = messages.findIndex((m) => m.id === toolCallId || (m.role === "tool" && m.toolName === (update.title as string)));
              if (idx >= 0) {
                messages[idx] = {
                  ...messages[idx],
                  toolStatus: status ?? messages[idx].toolStatus,
                };
              }
            }
            break;
          }

          case "completed":
          case "ended": {
            agent.status = "completed";
            break;
          }

          default:
            break;
        }

        agent.messages = messages;
        updated[agentIdx] = agent;
      }

      return changed ? updated : prev;
    });
  }, [acp.updates]);

  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const ensureConnected = useCallback(async () => {
    if (!acp.connected) {
      await acp.connect();
    }
  }, [acp]);

  // Check if a session is empty (only has session_start event or no messages)
  const isSessionEmpty = useCallback(async (sessionId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/history`);
      const data = await res.json();
      const history = data?.history ?? [];
      
      // Empty if no history or only has session_start notification
      if (history.length === 0) return true;
      
      // Check if only session_start exists (no user messages)
      const hasUserMessage = history.some((item: any) => 
        item?.update?.sessionUpdate === "user_message"
      );
      
      return !hasUserMessage;
    } catch (e) {
      console.error("Failed to check session emptiness", e);
      return false;
    }
  }, []);

  // Delete empty session if it exists
  const deleteEmptySession = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return;
    
    const isEmpty = await isSessionEmpty(sessionId);
    if (isEmpty) {
      console.log(`[deleteEmptySession] Deleting empty session: ${sessionId}`);
      try {
        await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      } catch (e) {
        console.error("Failed to delete empty session", e);
      }
    }
  }, [isSessionEmpty]);

  const handleCreateSession = useCallback(
    async (provider: string) => {
      await ensureConnected();
      
      // Delete previous empty session before creating new one
      await deleteEmptySession(activeSessionId);
      
      const cwd = repoSelection?.path ?? undefined;
      // Always pass the selected role - don't skip CRAFTER
      const role = selectedAgent;
      console.log(`[handleCreateSession] Creating session: provider=${provider}, role=${role}`);
      const result = await acp.createSession(cwd, provider, undefined, role, activeWorkspaceId ?? undefined);
      if (result?.sessionId) {
        setActiveSessionId(result.sessionId);
        // Clear tasks when creating a new session
        setRoutaTasks([]);
        bumpRefresh();
      }
    },
    [acp, ensureConnected, bumpRefresh, repoSelection, selectedAgent, activeSessionId, deleteEmptySession, activeWorkspaceId]
  );

  const handleSelectSession = useCallback(
    async (sessionId: string) => {
      await ensureConnected();
      
      // Delete previous empty session before switching
      await deleteEmptySession(activeSessionId);
      
      acp.selectSession(sessionId);
      setActiveSessionId(sessionId);
      // Don't clear tasks here - let onTasksDetected update them when history loads
      // This prevents the right sidebar from disappearing during session switch
      bumpRefresh();
    },
    [acp, ensureConnected, bumpRefresh, activeSessionId, deleteEmptySession]
  );

  const ensureSessionForChat = useCallback(async (cwd?: string, provider?: string, modeId?: string): Promise<string | null> => {
    await ensureConnected();
    if (activeSessionId) return activeSessionId;
    // Always pass the selected role
    const role = selectedAgent;
    console.log(`[ensureSessionForChat] Creating session: provider=${provider ?? acp.selectedProvider}, role=${role}`);
    const result = await acp.createSession(cwd, provider ?? acp.selectedProvider, modeId, role, activeWorkspaceId ?? undefined);
    if (result?.sessionId) {
      setActiveSessionId(result.sessionId);
      bumpRefresh();
      return result.sessionId;
    }
    return null;
  }, [acp, activeSessionId, ensureConnected, bumpRefresh, selectedAgent, activeWorkspaceId]);

  const handleLoadSkill = useCallback(async (name: string): Promise<string | null> => {
    const skill = await skillsHook.loadSkill(name, repoSelection?.path);
    return skill?.content ?? null;
  }, [skillsHook, repoSelection?.path]);

  const handleAgentChange = useCallback((role: AgentRole) => {
    console.log(`[handleAgentChange] Changing agent role to: ${role}`);
    setSelectedAgent(role);
    if (role === "ROUTA") {
      setShowAgentToast(true);
      setTimeout(() => setShowAgentToast(false), 2500);
    }
  }, []);

  // ── Routa Task Panel Handlers ─────────────────────────────────────────

  const handleTasksDetected = useCallback(async (tasks: ParsedTask[]) => {
    setRoutaTasks(tasks);

    // Auto-save tasks to Notes system for collaborative editing
    for (const task of tasks) {
      try {
        await notesHook.createNote({
          noteId: `task-${task.id}`,
          title: task.title,
          content: [
            task.objective && `## Objective\n${task.objective}`,
            task.scope && `## Scope\n${task.scope}`,
            task.definitionOfDone && `## Definition of Done\n${task.definitionOfDone}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
          type: "task",
          metadata: { taskStatus: "PENDING" },
        });
      } catch {
        // Note may already exist, try updating
        await notesHook.updateNote(`task-${task.id}`, {
          title: task.title,
          content: [
            task.objective && `## Objective\n${task.objective}`,
            task.scope && `## Scope\n${task.scope}`,
            task.definitionOfDone && `## Definition of Done\n${task.definitionOfDone}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        });
      }
    }

    // Auto-switch to collab mode when tasks are detected
    if (tasks.length > 0) {
      setTaskPanelMode("collab");
    }
  }, [notesHook]);

  /**
   * Call a Routa MCP tool via the /api/mcp endpoint.
   */
  const mcpSessionRef = useRef<string | null>(null);

  const callMcpTool = useCallback(async (toolName: string, args: Record<string, unknown>) => {
    if (!mcpSessionRef.current) {
      const initRes = await fetch("/api/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "routa-ui", version: "0.1.0" },
          },
        }),
      });
      const sessionId = initRes.headers.get("mcp-session-id");
      if (sessionId) {
        mcpSessionRef.current = sessionId;
        console.log(`[MCP] Session initialized: ${sessionId}`);
      }
    }

    const res = await fetch("/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        ...(mcpSessionRef.current ? { "Mcp-Session-Id": mcpSessionRef.current } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: { name: toolName, arguments: args },
      }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "MCP tool call failed");
    return data.result;
  }, []);

  const handleConfirmAllTasks = useCallback(() => {
    setRoutaTasks((prev) =>
      prev.map((t) => (t.status === "pending" ? { ...t, status: "confirmed" as const } : t))
    );
  }, []);

  const handleConfirmTask = useCallback((taskId: string) => {
    setRoutaTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "confirmed" as const } : t))
    );
  }, []);

  const handleEditTask = useCallback((taskId: string, updated: Partial<ParsedTask>) => {
    setRoutaTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updated } : t))
    );
  }, []);

  /**
   * Execute a single task by creating it in the MCP task store
   * and delegating to a CRAFTER agent.
   * Returns the created CrafterAgent info.
   */
  const handleExecuteTask = useCallback(async (taskId: string): Promise<CrafterAgent | null> => {
    const task = routaTasks.find((t) => t.id === taskId);
    if (!task) return null;

    // Mark as running
    setRoutaTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: "running" as const } : t))
    );

    try {
      // 1. Create task in MCP task store
      const createResult = await callMcpTool("create_task", {
        title: task.title,
        objective: task.objective,
        scope: task.scope || undefined,
        acceptanceCriteria: task.definitionOfDone
          ? task.definitionOfDone.split("\n").filter(Boolean).map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
          : undefined,
      });

      // Extract created taskId from result
      const resultText = createResult?.content?.[0]?.text ?? "{}";
      let mcpTaskId: string | undefined;
      try {
        const parsed = JSON.parse(resultText);
        mcpTaskId = parsed.taskId ?? parsed.id;
      } catch {
        const m = resultText.match(/"(?:taskId|id)"\s*:\s*"([^"]+)"/);
        mcpTaskId = m?.[1];
      }

      let agentId: string | undefined;
      let childSessionId: string | undefined;

      if (!mcpTaskId) {
        console.warn("[TaskPanel] Could not extract taskId from create_task result:", resultText);
        if (activeSessionId) {
          await acp.prompt(
            `Execute task: "${task.title}"\nObjective: ${task.objective}\nScope: ${task.scope}\nDone when: ${task.definitionOfDone}`
          );
        }
      } else {
        // 2. Delegate to a CRAFTER agent
        try {
          const delegateResult = await callMcpTool("delegate_task_to_agent", {
            taskId: mcpTaskId,
            callerAgentId: "routa-ui",
            callerSessionId: activeSessionId, // Pass parent session ID for SSE notification routing
            specialist: "CRAFTER",
          });

          // Extract agent info from delegation result
          const delegateText = delegateResult?.content?.[0]?.text ?? "{}";
          try {
            const parsed = JSON.parse(delegateText);
            agentId = parsed.agentId;
            childSessionId = parsed.sessionId;
          } catch {
            const agentMatch = delegateText.match(/"agentId"\s*:\s*"([^"]+)"/);
            const sessionMatch = delegateText.match(/"sessionId"\s*:\s*"([^"]+)"/);
            agentId = agentMatch?.[1];
            childSessionId = sessionMatch?.[1];
          }
        } catch (delegateErr) {
          console.warn("[TaskPanel] delegate_task_to_agent failed, falling back to prompt:", delegateErr);
          if (activeSessionId) {
            await acp.prompt(
              `Task "${task.title}" has been created (ID: ${mcpTaskId}). Please delegate it to a CRAFTER agent and execute it.`
            );
          }
        }
      }

      // 3. Create CrafterAgent record
      const crafterAgent: CrafterAgent = {
        id: agentId ?? `crafter-${taskId}`,
        sessionId: childSessionId ?? "",
        taskId,
        taskTitle: task.title,
        status: "running",
        messages: [],
      };

      setCrafterAgents((prev) => [...prev, crafterAgent]);

      // Auto-select this agent if concurrency is 1
      if (concurrency === 1) {
        setActiveCrafterId(crafterAgent.id);
      } else if (!activeCrafterId) {
        setActiveCrafterId(crafterAgent.id);
      }

      // Mark completed (the orchestrator will handle the actual completion)
      setRoutaTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "completed" as const } : t))
      );

      return crafterAgent;
    } catch (err) {
      console.error("[TaskPanel] Task execution failed:", err);
      setRoutaTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: "confirmed" as const } : t))
      );
      return null;
    }
  }, [routaTasks, activeSessionId, acp, callMcpTool, concurrency, activeCrafterId]);

  /**
   * Execute all confirmed tasks with configurable concurrency.
   * concurrency=1: sequential, auto-switch view to running agent
   * concurrency=2: up to 2 tasks in parallel
   */
  const handleExecuteAllTasks = useCallback(async (requestedConcurrency: number) => {
    const confirmedTasks = routaTasks.filter((t) => t.status === "confirmed");
    if (confirmedTasks.length === 0) return;

    const effectiveConcurrency = Math.min(requestedConcurrency, confirmedTasks.length);

    if (effectiveConcurrency <= 1) {
      // Sequential execution - auto-switch to each agent's view
      for (const task of confirmedTasks) {
        const agent = await handleExecuteTask(task.id);
        if (agent) {
          setActiveCrafterId(agent.id);
        }
      }
    } else {
      // Parallel execution with concurrency limit
      const queue = [...confirmedTasks];
      const runBatch = async () => {
        const batch = queue.splice(0, effectiveConcurrency);
        const promises = batch.map((task) => handleExecuteTask(task.id));
        const results = await Promise.allSettled(promises);
        // Select the first agent from the batch
        for (const result of results) {
          if (result.status === "fulfilled" && result.value) {
            setActiveCrafterId(result.value.id);
            break;
          }
        }
      };

      while (queue.length > 0) {
        await runBatch();
      }
    }
  }, [routaTasks, handleExecuteTask]);

  const handleSelectCrafter = useCallback((agentId: string) => {
    setActiveCrafterId(agentId);
  }, []);

  const handleConcurrencyChange = useCallback((n: number) => {
    setConcurrency(n);
  }, []);

  const hasCollabNotes = notesHook.notes.some((n) => n.metadata.type === "task" || n.metadata.type === "spec");
  const showTaskPanel = true; // Always show right sidebar

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* ─── Top Bar ──────────────────────────────────────────────── */}
      <header className="h-[52px] shrink-0 bg-white dark:bg-[#161922] border-b border-gray-200 dark:border-gray-800 flex items-center px-3 md:px-4 gap-2 md:gap-4 z-10">
        {/* Mobile hamburger */}
        <button
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {showMobileSidebar ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <img
            src="/logo.svg"
            alt="Routa"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 hidden sm:inline">
            Routa
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden md:block" />

        {/* Workspace switcher */}
        <WorkspaceSwitcher
          workspaces={workspacesHook.workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onSelect={handleWorkspaceSelect}
          onCreate={handleWorkspaceCreate}
          loading={workspacesHook.loading}
        />

        {/* Codebase picker (top bar, only when multiple codebases) */}
        {codebases.length > 1 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden md:block" />
            <CodebasePicker
              codebases={codebases}
              selectedRepoPath={repoSelection?.path ?? null}
              onSelect={(path) => {
                const cb = codebases.find((c) => c.repoPath === path);
                setRepoSelection({ path, branch: cb?.branch ?? "", name: cb?.label ?? path.split("/").pop() ?? "" });
              }}
            />
          </>
        )}

        {/* Separator */}
        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 hidden md:block" />

        {/* Agent selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 hidden md:inline">Agent:</span>
          <div className="relative">
            <select
              value={selectedAgent}
              onChange={(e) => handleAgentChange(e.target.value as AgentRole)}
              className="appearance-none pl-3 pr-7 py-1 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 cursor-pointer focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="CRAFTER">CRAFTER</option>
              <option value="ROUTA">ROUTA</option>
              <option value="GATE">GATE</option>
              <option value="DEVELOPER">DEVELOPER</option>
            </select>
            <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Protocol badges (hidden on small screens) */}
        <div className="hidden lg:flex items-center gap-2">
          <ProtocolBadge name="MCP" endpoint="/api/mcp" />
          <ProtocolBadge name="ACP" endpoint="/api/acp" />
        </div>

        {/* Tool Mode Toggle */}
        <label className="hidden md:flex items-center gap-1.5 cursor-pointer select-none" title={`Tool Mode: ${toolMode === "essential" ? "Essential (7 tools)" : "Full (34 tools)"}`}>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Full</span>
          <div className="relative">
            <input
              type="checkbox"
              checked={toolMode === "essential"}
              onChange={(e) => handleToolModeToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-7 h-3.5 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-purple-500 transition-colors" />
            <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform peer-checked:translate-x-3.5" />
          </div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">Essential</span>
        </label>

        {/* MCP Tools link */}
        <a
          href="/mcp-tools"
          className="hidden md:inline-flex px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-[11px] font-medium text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
        >
          MCP Tools
        </a>

        {/* Traces link */}
        <a
          href="/traces"
          className="hidden md:inline-flex px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-[11px] font-medium text-purple-600 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
        >
          Traces
        </a>
      </header>

      {/* ─── Main Area ────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Mobile sidebar overlay */}
        {showMobileSidebar && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setShowMobileSidebar(false)}
          />
        )}

        {/* ─── Empty workspace onboarding ──────────────────────────── */}
        {!workspacesHook.loading && workspacesHook.workspaces.length === 0 && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-50/90 dark:bg-[#0f1117]/90 backdrop-blur-sm">
            <div className="bg-white dark:bg-[#161922] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl p-8 max-w-sm w-full mx-4 text-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Create your first workspace</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">A workspace organizes your sessions, notes, and codebases for a project.</p>
              <button
                type="button"
                onClick={() => handleWorkspaceCreate("My Workspace")}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
              >
                Create Workspace
              </button>
            </div>
          </div>
        )}

        {/* ─── Left Sidebar ──────────────────────────────────────── */}
        <aside
          className={`shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col relative
            ${showMobileSidebar ? "fixed inset-y-[52px] left-0 z-40 shadow-2xl overflow-y-auto" : "hidden md:flex overflow-hidden"}
          `}
          style={{ width: `${leftSidebarWidth}px` }}
        >
          {/* Workspace section */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-800">
            <div className="px-1 mb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Workspace</div>
            <WorkspaceSwitcher
              workspaces={workspacesHook.workspaces}
              activeWorkspaceId={activeWorkspaceId}
              onSelect={handleWorkspaceSelect}
              onCreate={handleWorkspaceCreate}
              loading={workspacesHook.loading}
            />
            {codebases.length > 0 && (
              <div className="mt-1">
                <div className="px-1 mb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Repository</div>
                <CodebasePicker
                  codebases={codebases}
                  selectedRepoPath={repoSelection?.path ?? null}
                  onSelect={handleCodebaseSelect}
                />
              </div>
            )}
          </div>

          {/* Sessions header + New Session */}
          <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Sessions</span>
            <button
              onClick={() => handleCreateSession(acp.selectedProvider)}
              disabled={acp.providers.length === 0 || !acp.selectedProvider}
              className="px-2 py-0.5 text-[11px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + New
            </button>
          </div>

          {/* Sessions + Skills */}
          <div className="flex-1 overflow-y-auto">
            <SessionPanel
              selectedSessionId={activeSessionId}
              onSelect={handleSelectSession}
              refreshKey={refreshKey}
              workspaceId={activeWorkspaceId ?? undefined}
              onSessionDeleted={(deletedId) => {
                if (activeSessionId === deletedId) {
                  setActiveSessionId(null);
                }
              }}
            />

            {/* Divider */}
            <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-800" />

            {/* Skills */}
            <SkillPanel
              skillsHook={skillsHook}
            />
          </div>

          {/* Bottom actions */}
          <div className="p-2 border-t border-gray-100 dark:border-gray-800 space-y-1">
            <button
              ref={installAgentsButtonRef}
              onClick={() => setShowAgentInstallPopup(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Install Agents
            </button>
            <button
              type="button"
              onClick={() => setShowAgentInstallPopup(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage Providers
            </button>
          </div>

          {/* Left sidebar resize handle */}
          <div
            className="left-resize-handle hidden md:block"
            onMouseDown={handleLeftResizeStart}
          >
            <div className="resize-indicator" />
          </div>
        </aside>

        {/* ─── Chat Area ──────────────────────────────────────────── */}
        <main className="flex-1 min-w-0">
          <ChatPanel
            acp={acp}
            activeSessionId={activeSessionId}
            onEnsureSession={ensureSessionForChat}
            onSelectSession={handleSelectSession}
            skills={skillsHook.skills}
            repoSkills={skillsHook.repoSkills}
            onLoadSkill={handleLoadSkill}
            repoSelection={repoSelection}
            onRepoChange={setRepoSelection}
            onTasksDetected={handleTasksDetected}
            agentRole={selectedAgent}
          />
        </main>

        {/* ─── Right Panel: Routa Sub-Tasks (Resizable) ───────────── */}
        {showTaskPanel && (
          <aside
            className="shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col overflow-hidden relative"
            style={{ width: `${sidebarWidth}px` }}
          >
            {/* Resize handle */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 hover:bg-indigo-500/30 active:bg-indigo-500/50 transition-colors group"
              onMouseDown={handleResizeStart}
            >
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-gray-300 dark:bg-gray-600 group-hover:bg-indigo-400 group-active:bg-indigo-500 transition-colors" />
            </div>

            {/* When collaborative notes exist, show Collab Edit directly; otherwise show TaskPanel */}
            {hasCollabNotes ? (
              <CollaborativeTaskEditor
                notes={notesHook.notes}
                connected={notesHook.connected}
                onUpdateNote={notesHook.updateNote}
                onDeleteNote={notesHook.deleteNote}
                workspaceId={activeWorkspaceId ?? ""}
              />
            ) : (
              <TaskPanel
                tasks={routaTasks}
                onConfirmAll={handleConfirmAllTasks}
                onExecuteAll={handleExecuteAllTasks}
                onConfirmTask={handleConfirmTask}
                onEditTask={handleEditTask}
                onExecuteTask={handleExecuteTask}
                crafterAgents={crafterAgents}
                activeCrafterId={activeCrafterId}
                onSelectCrafter={handleSelectCrafter}
                concurrency={concurrency}
                onConcurrencyChange={handleConcurrencyChange}
              />
            )}
          </aside>
        )}
      </div>

      {/* ─── Resize overlay (prevents iframe/content interference) ─── */}
      {(isResizing || isLeftResizing) && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}

      {/* ─── Agent Install Popup ─────────────────────────────────────── */}
      {showAgentInstallPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-install-title"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAgentInstallPopup(false)}
            aria-hidden="true"
          />
          <div
            className="relative w-full max-w-5xl h-[80vh] bg-white dark:bg-[#161922] border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-11 px-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div id="agent-install-title" className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Install Agents
                </div>
                <a
                  href="/settings/agents"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  Open in new tab
                </a>
              </div>
              <button
                ref={agentInstallCloseRef}
                type="button"
                onClick={() => setShowAgentInstallPopup(false)}
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Close (Esc)"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[calc(80vh-44px)]">
              <AgentInstallPanel />
            </div>
          </div>
        </div>
      )}

      {/* ─── Agent Toast ──────────────────────────────────────────── */}
      {showAgentToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium shadow-lg animate-fade-in">
          ROUTA mode: Coordinator will plan, delegate to CRAFTER agents, and verify with GATE.
        </div>
      )}
    </div>
  );
}
