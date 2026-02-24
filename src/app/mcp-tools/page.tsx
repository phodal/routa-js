"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

type ToolCategory = "Task" | "Agent" | "Note" | "Workspace" | "Git";

interface CategoryConfig {
  name: ToolCategory;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CATEGORIES: CategoryConfig[] = [
  { name: "Task", color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-50 dark:bg-blue-900/20", borderColor: "border-blue-200 dark:border-blue-800" },
  { name: "Agent", color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-50 dark:bg-purple-900/20", borderColor: "border-purple-200 dark:border-purple-800" },
  { name: "Note", color: "text-green-600 dark:text-green-400", bgColor: "bg-green-50 dark:bg-green-900/20", borderColor: "border-green-200 dark:border-green-800" },
  { name: "Workspace", color: "text-orange-600 dark:text-orange-400", bgColor: "bg-orange-50 dark:bg-orange-900/20", borderColor: "border-orange-200 dark:border-orange-800" },
  { name: "Git", color: "text-rose-600 dark:text-rose-400", bgColor: "bg-rose-50 dark:bg-rose-900/20", borderColor: "border-rose-200 dark:border-rose-800" },
];

/** Essential tools count (for display in UI toggle label) */
const ESSENTIAL_TOOLS_COUNT = 7;

/** Map tool names to categories */
function getToolCategory(name: string): ToolCategory {
  // Task tools
  if (name.includes("task") && !name.includes("agent")) return "Task";
  // Agent tools (includes delegate, report, subscribe, message)
  if (
    name.includes("agent") ||
    name === "delegate_task" ||
    name === "delegate_task_to_agent" ||
    name === "report_to_parent" ||
    name.includes("subscribe") ||
    name === "send_message_to_agent"
  ) return "Agent";
  // Note tools
  if (name.includes("note") || name === "get_my_task" || name === "convert_task_blocks") return "Note";
  // Git tools
  if (name.startsWith("git_")) return "Git";
  // Workspace tools
  if (name.includes("workspace") || name === "list_specialists") return "Workspace";
  // Default to Agent (coordination tools)
  return "Agent";
}

export default function McpToolsPage() {
  const [tools, setTools] = useState<McpToolDefinition[]>([]);
  const [selectedToolName, setSelectedToolName] = useState<string>("");
  const [argsJson, setArgsJson] = useState<string>("{}");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<ToolCategory>>(new Set());
  const [essentialMode, setEssentialMode] = useState(true); // Default: essential mode ON

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedToolName) ?? null,
    [tools, selectedToolName]
  );

  /** Tools are now fetched from API with mode param, no client-side filtering needed */
  const filteredTools = tools;

  const loadTools = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch current global mode from server
      const response = await fetch("/api/mcp/tools", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load tools: ${response.status}`);
      }
      const data = await response.json();
      const nextTools = Array.isArray(data?.tools) ? data.tools : [];
      setTools(nextTools);
      setLoadError("");
      setSelectedToolName((current) => current || nextTools[0]?.name || "");
      // Sync local state with server's global mode
      if (data.globalMode) {
        setEssentialMode(data.globalMode === "essential");
      }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load tools");
    } finally {
      setLoading(false);
    }
  }, []);

  /** Toggle essential mode and sync with server */
  const handleToggleMode = useCallback(async (checked: boolean) => {
    setEssentialMode(checked);
    const newMode = checked ? "essential" : "full";

    try {
      // Update global mode on server
      await fetch("/api/mcp/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: newMode }),
      });
      // Reload tools with new mode
      const response = await fetch("/api/mcp/tools", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setTools(Array.isArray(data?.tools) ? data.tools : []);
      }
    } catch (error) {
      console.error("Failed to toggle tool mode:", error);
    }
  }, []);

  useEffect(() => {
    loadTools();
  }, [loadTools]);

  const handleExecuteTool = async () => {
    if (!selectedTool) return;
    try {
      const args = JSON.parse(argsJson);
      const response = await fetch("/api/mcp/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: selectedTool.name, args }),
      });
      const data = await response.json();
      if (!response.ok) {
        setResult(JSON.stringify({ error: data?.error ?? "Tool execution failed" }, null, 2));
        return;
      }
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(
        JSON.stringify({ error: error instanceof Error ? error.message : "Invalid JSON" }, null, 2)
      );
    }
  };

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-[#0f1117]">
      <aside className="w-[320px] shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-sm font-semibold text-gray-900 dark:text-gray-100">MCP Tools</h1>
            <button
              type="button"
              onClick={() => loadTools()}
              disabled={loading}
              className="text-xs text-blue-600 dark:text-blue-400 disabled:opacity-40"
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {/* Essential Mode Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <div className="relative">
              <input
                type="checkbox"
                checked={essentialMode}
                onChange={(e) => handleToggleMode(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:bg-purple-500 transition-colors" />
              <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
            </div>
            <span className="text-[11px] text-gray-600 dark:text-gray-400">
              Essential ({ESSENTIAL_TOOLS_COUNT})
            </span>
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {loadError && (
            <div className="mb-2 rounded-md px-2 py-1 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20">
              {loadError}
            </div>
          )}
          {CATEGORIES.map((cat) => {
            const categoryTools = filteredTools.filter((t) => getToolCategory(t.name) === cat.name);
            if (categoryTools.length === 0) return null;
            const isCollapsed = collapsedCategories.has(cat.name);

            return (
              <div key={cat.name} className="mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(cat.name)) next.delete(cat.name);
                      else next.add(cat.name);
                      return next;
                    });
                  }}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-semibold ${cat.color} ${cat.bgColor} border ${cat.borderColor}`}
                >
                  <span>{cat.name} ({categoryTools.length})</span>
                  <span className="text-[10px]">{isCollapsed ? "▶" : "▼"}</span>
                </button>
                {!isCollapsed && (
                  <div className="mt-1 ml-1 border-l-2 pl-2" style={{ borderColor: "var(--tw-border-opacity, 1)" }}>
                    {categoryTools.map((tool) => {
                      const active = tool.name === selectedToolName;
                      return (
                        <button
                          key={tool.name}
                          type="button"
                          onClick={() => setSelectedToolName(tool.name)}
                          className={`w-full text-left rounded-md px-2 py-1.5 mb-0.5 transition-colors ${
                            active
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <div className="text-xs font-medium truncate">{tool.name}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-5 overflow-y-auto">
        {!selectedTool ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">No tool selected.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedTool.name}
              </h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {selectedTool.description}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Arguments (JSON)
              </label>
              <textarea
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                className="w-full h-36 p-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-xs font-mono text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExecuteTool}
                className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md"
              >
                Run Tool
              </button>
              <a
                href="/"
                className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
              >
                Back
              </a>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Tool Result
              </label>
              <pre className="w-full min-h-40 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#12141d] text-xs text-gray-800 dark:text-gray-200 overflow-auto">
                {result || "{}"}
              </pre>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Input Schema
              </label>
              <pre className="w-full min-h-24 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#12141d] text-xs text-gray-800 dark:text-gray-200 overflow-auto">
                {JSON.stringify(selectedTool.inputSchema ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
