"use client";

/**
 * QuickStartInput - A reusable component for starting new conversations
 *
 * Features:
 * - Large textarea for task description
 * - Provider selection dropdown (grouped by builtin/registry)
 * - Model selection (for supported providers)
 * - Workspace selection
 * - Repository selection
 * - Agent/Mode selection (ROUTA vs CRAFTER)
 * - ⌘↵ keyboard shortcut to start
 *
 * Designed to work both on the home page and in workspace contexts.
 */

import React, { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { createPortal } from "react-dom";
import { useAcp } from "../hooks/use-acp";
import { useWorkspaces, useCodebases } from "../hooks/use-workspaces";
import { RepoPicker, type RepoSelection } from "./repo-picker";
import { useRouter } from "next/navigation";

type AgentRole = "CRAFTER" | "ROUTA" | "GATE" | "DEVELOPER";

interface QuickStartInputProps {
  /** Optional pre-selected workspace */
  workspaceId?: string;
  /** Optional pre-selected repository */
  repoSelection?: RepoSelection | null;
  /** Optional pre-selected agent role */
  defaultRole?: AgentRole;
  /** Callback when session is created - returns the new session URL */
  onSessionCreated?: (sessionId: string) => void;
  /** Compact mode for smaller displays */
  compact?: boolean;
  /** Hide workspace selector (useful when already in a workspace) */
  hideWorkspace?: boolean;
}

export function QuickStartInput({
  workspaceId: propWorkspaceId,
  repoSelection: propRepoSelection,
  defaultRole = "ROUTA",
  onSessionCreated,
  compact = false,
  hideWorkspace = false,
}: QuickStartInputProps) {
  const router = useRouter();
  const acp = useAcp();
  const workspacesHook = useWorkspaces();
  const [isPending, startTransition] = useTransition();

  // Input state
  const [input, setInput] = useState("");

  // Workspace & codebase state
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(propWorkspaceId ?? null);
  const { codebases } = useCodebases(selectedWorkspaceId ?? "");
  const [repoSelection, setRepoSelection] = useState<RepoSelection | null>(propRepoSelection ?? null);

  // Auto-select first workspace on load
  useEffect(() => {
    if (!selectedWorkspaceId && !hideWorkspace && workspacesHook.workspaces.length > 0) {
      setSelectedWorkspaceId(workspacesHook.workspaces[0].id);
    }
  }, [workspacesHook.workspaces, selectedWorkspaceId, hideWorkspace]);

  // Auto-select default codebase when workspace changes
  useEffect(() => {
    if (codebases.length === 0) return;
    const def = codebases.find((c) => c.isDefault) ?? codebases[0];
    setRepoSelection({
      path: def.repoPath,
      branch: def.branch ?? "",
      name: def.label ?? def.repoPath.split("/").pop() ?? "",
    });
  }, [codebases]);

  // Agent role state
  const [selectedRole, setSelectedRole] = useState<AgentRole>(defaultRole);

  // Provider dropdown state
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const providerButtonRef = useRef<HTMLButtonElement>(null);
  const [providerDropdownPos, setProviderDropdownPos] = useState<{ left: number; bottom: number } | null>(null);

  // Model dropdown state
  const [model, setModel] = useState("");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [modelModels, setModelModels] = useState<string[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelFilter, setModelFilter] = useState("");
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const [modelDropdownPos, setModelDropdownPos] = useState<{ left: number; bottom: number } | null>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!providerDropdownOpen && !modelDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      // Provider dropdown
      if (providerDropdownOpen && providerButtonRef.current) {
        if (!providerButtonRef.current.contains(event.target as Node)) {
          setProviderDropdownOpen(false);
        }
      }
      // Model dropdown
      if (modelDropdownOpen && modelBtnRef.current) {
        if (!modelBtnRef.current.contains(event.target as Node)) {
          setModelDropdownOpen(false);
          setModelFilter("");
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [providerDropdownOpen, modelDropdownOpen]);

  // Reset model when provider changes
  useEffect(() => {
    setModel("");
    setModelModels([]);
  }, [acp.selectedProvider]);

  // Handle start session
  const handleStart = useCallback(async () => {
    if (!input.trim() || !acp.connected) return;

    const cwd = repoSelection?.path;
    const wsId = selectedWorkspaceId ?? undefined;

    // Create session
    const result = await acp.createSession(cwd, undefined, undefined, selectedRole, wsId, model || undefined);

    if (result?.sessionId) {
      // Send the initial prompt
      await acp.prompt(input);

      // Navigate to the new session
      const url = wsId ? `/${wsId}/${result.sessionId}` : `/${result.sessionId}`;
      startTransition(() => {
        router.push(url);
      });

      onSessionCreated?.(result.sessionId);
      setInput("");
    }
  }, [input, acp, repoSelection, selectedWorkspaceId, selectedRole, model, router, onSessionCreated, startTransition]);

  const selectedProviderInfo = acp.providers.find((p) => p.id === acp.selectedProvider);

  // Group providers by source and availability (same as tiptap-input)
  // Use optional chaining and coalescing for safety
  const builtinAvailable = acp.providers.filter((p) => p.source === "static" && p.status === "available");
  const builtinUnavailable = acp.providers.filter((p) => p.source === "static" && (p.status === "unavailable" || p.status === "checking"));
  const registryAvailable = acp.providers.filter((p) => p.source === "registry" && p.status === "available");
  const registryUnavailable = acp.providers.filter((p) => p.source === "registry" && (p.status === "unavailable" || p.status === "checking"));

  return (
    <div className={`flex flex-col gap-4 ${compact ? "max-w-xl" : "max-w-2xl"} mx-auto`}>
      {/* Header */}
      <div className="text-center">
        <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-blue-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">What would you like to work on?</h2>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">Describe your task and choose your mode.</p>
      </div>

      {/* Input */}
      <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-[#1a1f2e] shadow-sm overflow-hidden focus-within:border-indigo-400 dark:focus-within:border-indigo-600 transition-colors">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleStart();
            }
          }}
          placeholder="Describe your task, question, or goal..."
          rows={compact ? 3 : 4}
          className="w-full px-5 py-3.5 text-base text-gray-900 dark:text-gray-100 bg-transparent resize-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 leading-relaxed"
          autoFocus
        />
        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-800/60 bg-gray-50/40 dark:bg-gray-900/20">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-1">⌘↵</span>

            {/* Provider selector */}
            <div>
              <button
                ref={providerButtonRef}
                type="button"
                onClick={() => {
                  if (providerDropdownOpen) {
                    setProviderDropdownOpen(false);
                  } else {
                    const rect = providerButtonRef.current?.getBoundingClientRect();
                    if (rect) {
                      setProviderDropdownPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
                    }
                    setProviderDropdownOpen(true);
                  }
                }}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-transparent transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedProviderInfo?.status === "available" ? "bg-green-500" : "bg-gray-400"}`} />
                <span className="truncate max-w-[120px]">{selectedProviderInfo?.name ?? "Select..."}</span>
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${providerDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Provider dropdown */}
              {providerDropdownOpen && providerDropdownPos && typeof document !== "undefined" &&
                createPortal(
                  <div
                    className="fixed w-72 max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] shadow-xl z-[9999]"
                    style={{ left: providerDropdownPos.left, bottom: providerDropdownPos.bottom }}
                  >
                    {/* Builtin Available */}
                    {builtinAvailable.length > 0 && (
                      <div className="py-1">
                        <div className="px-3 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Built-in ({builtinAvailable.length})
                        </div>
                        {builtinAvailable.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              acp.setProvider(p.id);
                              setProviderDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors ${
                              p.id === acp.selectedProvider
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            <span className="font-medium truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[140px]">{p.command}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Registry Available */}
                    {registryAvailable.length > 0 && (
                      <div className={`py-1 ${builtinAvailable.length > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}`}>
                        <div className="px-3 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          ACP Registry ({registryAvailable.length})
                        </div>
                        {registryAvailable.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              acp.setProvider(p.id);
                              setProviderDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors ${
                              p.id === acp.selectedProvider
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                            <span className="font-medium truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[140px]">{p.command}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Builtin Unavailable */}
                    {builtinUnavailable.length > 0 && (
                      <div className={`py-1 ${(builtinAvailable.length > 0 || registryAvailable.length > 0) ? "border-t border-gray-100 dark:border-gray-800" : ""}`}>
                        <div className="px-3 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Built-in - Not Installed ({builtinUnavailable.length})
                        </div>
                        {builtinUnavailable.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              acp.setProvider(p.id);
                              setProviderDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors opacity-60 ${
                              p.id === acp.selectedProvider
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                            <span className="font-medium truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[140px]">{p.command}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Registry Unavailable */}
                    {registryUnavailable.length > 0 && (
                      <div className="py-1 border-t border-gray-100 dark:border-gray-800">
                        <div className="px-3 py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          ACP Registry - Not Installed ({registryUnavailable.length})
                        </div>
                        {registryUnavailable.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              acp.setProvider(p.id);
                              setProviderDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-xs transition-colors opacity-60 ${
                              p.id === acp.selectedProvider
                                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                            <span className="font-medium truncate flex-1">{p.name}</span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[140px]">{p.command}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Loading or empty state */}
                    {acp.providers.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-400 text-center">
                        Connecting to providers...
                      </div>
                    )}

                    {/* No available providers message */}
                    {acp.providers.length > 0 && builtinAvailable.length === 0 && registryAvailable.length === 0 && (
                      <div className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                        {builtinUnavailable.length > 0 || registryUnavailable.length > 0 ? (
                          <>
                            <p className="font-medium mb-1">No providers available</p>
                            <p className="text-[10px] opacity-75">
                              {acp.providers.some((p) => p.id === "opencode-sdk")
                                ? "Configure OPENCODE_SERVER_URL environment variable to use OpenCode SDK"
                                : "Install a provider to get started"}
                            </p>
                          </>
                        ) : (
                          "Loading providers..."
                        )}
                      </div>
                    )}
                  </div>,
                  document.body
                )}
            </div>

            {/* Model selector */}
            {(acp.selectedProvider === "opencode" || acp.selectedProvider === "gemini") && (
              <div>
                <button
                  ref={modelBtnRef}
                  type="button"
                  onClick={async () => {
                    if (!modelDropdownOpen && modelBtnRef.current) {
                      const rect = modelBtnRef.current.getBoundingClientRect();
                      setModelDropdownPos({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
                    }
                    if (!modelDropdownOpen && modelModels.length === 0) {
                      setModelLoading(true);
                      try {
                        const models = await acp.listProviderModels(acp.selectedProvider);
                        setModelModels(models);
                      } catch (e) {
                        console.error("Failed to load models:", e);
                      } finally {
                        setModelLoading(false);
                      }
                    }
                    setModelDropdownOpen((v) => !v);
                    setModelFilter("");
                  }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-transparent transition-colors"
                >
                  <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate max-w-[120px]">{model ? model.split("/").pop() : "Default model"}</span>
                  {modelLoading
                    ? <span className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                    : <svg className={`w-3 h-3 text-gray-400 transition-transform ${modelDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                  }
                </button>
                {modelDropdownOpen && modelDropdownPos && typeof document !== "undefined" &&
                  createPortal(
                    <div
                      className="fixed w-72 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] shadow-xl z-[9999] flex flex-col"
                      style={{ left: modelDropdownPos.left, bottom: modelDropdownPos.bottom, maxHeight: "320px" }}
                    >
                      {/* Search */}
                      <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                        <input
                          autoFocus
                          type="text"
                          value={modelFilter}
                          onChange={(e) => setModelFilter(e.target.value)}
                          placeholder="Filter models..."
                          className="w-full px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-transparent outline-none focus:ring-1 focus:ring-indigo-500 text-gray-800 dark:text-gray-200"
                        />
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {/* Default option */}
                        <button
                          type="button"
                          onClick={() => { setModel(""); setModelDropdownOpen(false); }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            !model
                              ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className="font-medium">Default model</span>
                        </button>
                        {modelModels
                          .filter((m) => !modelFilter || m.toLowerCase().includes(modelFilter.toLowerCase()))
                          .map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => { setModel(m); setModelDropdownOpen(false); setModelFilter(""); }}
                              className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                                m === model
                                  ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              <span className="text-gray-400 dark:text-gray-500 font-mono text-[10px] shrink-0">
                                {m.split("/")[0]}
                              </span>
                              <span className="font-medium truncate">{m.split("/").slice(1).join("/") || m}</span>
                            </button>
                          ))
                        }
                        {modelModels.length === 0 && !modelLoading && (
                          <div className="px-3 py-3 text-xs text-gray-400 text-center">No models found</div>
                        )}
                      </div>
                    </div>,
                    document.body
                  )
                }
              </div>
            )}
          </div>

          <button
            onClick={handleStart}
            disabled={!input.trim() || !acp.connected || isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            开始
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Workspace + Repository */}
      <div className={`grid gap-3 items-end ${hideWorkspace ? "grid-cols-1" : "grid-cols-2"}`}>
        {!hideWorkspace && (
          <div>
            <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Workspace</label>
            <select
              value={selectedWorkspaceId ?? ""}
              onChange={(e) => setSelectedWorkspaceId(e.target.value || null)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              {workspacesHook.workspaces.length > 0 ? workspacesHook.workspaces.map((ws) => (
                <option key={ws.id} value={ws.id}>{ws.title}</option>
              )) : <option value="">No workspaces</option>}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Repository</label>
          <RepoPicker value={repoSelection} onChange={setRepoSelection} />
        </div>
      </div>

      {/* Agent Selection */}
      <div>
        <label className="block text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Mode</label>
        <div className="grid grid-cols-2 gap-3">
          {/* Routa Card */}
          <button
            type="button"
            onClick={() => setSelectedRole("ROUTA")}
            className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
              selectedRole === "ROUTA"
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/25 shadow-sm"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                selectedRole === "ROUTA" ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}>R</div>
              <span className={`font-semibold text-sm ${selectedRole === "ROUTA" ? "text-indigo-700 dark:text-indigo-300" : "text-gray-800 dark:text-gray-200"}`}>
                Routa
              </span>
              {selectedRole === "ROUTA" && (
                <span className="ml-auto text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full">推荐</span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              负责任务编排与规划。会生成执行规格（spec），并协调后续工作流。
            </p>
          </button>

          {/* CRAFTER Card */}
          <button
            type="button"
            onClick={() => setSelectedRole("CRAFTER")}
            className={`p-3.5 rounded-xl border-2 text-left transition-all duration-150 ${
              selectedRole === "CRAFTER"
                ? "border-violet-500 bg-violet-50 dark:bg-violet-900/25 shadow-sm"
                : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] hover:border-violet-300 dark:hover:border-violet-700 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                selectedRole === "CRAFTER" ? "bg-violet-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}>C</div>
              <span className={`font-semibold text-sm ${selectedRole === "CRAFTER" ? "text-violet-700 dark:text-violet-300" : "text-gray-800 dark:text-gray-200"}`}>
                CRAFTER
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              专注于具体实现与代码生成。根据任务描述直接进行实现。
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
