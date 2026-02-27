"use client";

/**
 * HomeInput - Task-first input component
 *
 * An operational input that prioritizes the user's immediate intent:
 * - TiptapInput for rich text, skills (/), file mentions (@)
 * - Inline control bar: Agent dropdown, Workspace pill, Repo/Branch pill
 * - Agent selection is lightweight — a small dropdown, not separate cards
 * - Context (workspace/repo) is always visible but non-intrusive
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TiptapInput, type InputContext } from "./tiptap-input";
import { useAcp } from "../hooks/use-acp";
import { useSkills } from "../hooks/use-skills";
import { useWorkspaces, useCodebases } from "../hooks/use-workspaces";
import type { RepoSelection } from "./repo-picker";
import { storePendingPrompt } from "../utils/pending-prompt";

type AgentRole = "ROUTA" | "DEVELOPER";

interface HomeInputProps {
  /** Initial workspace ID (optional) */
  workspaceId?: string;
  /** Called when workspace selection changes */
  onWorkspaceChange?: (workspaceId: string | null) => void;
  onSessionCreated?: (sessionId: string) => void;
  /** Externally triggered skill (e.g. from grid card click) */
  externalPendingSkill?: string | null;
  /** Called after the external skill has been consumed */
  onExternalSkillConsumed?: () => void;
}

export function HomeInput({
  workspaceId: propWorkspaceId,
  onWorkspaceChange,
  onSessionCreated,
  externalPendingSkill,
  onExternalSkillConsumed,
}: HomeInputProps) {
  const router = useRouter();
  const acp = useAcp();
  const skillsHook = useSkills();
  const workspacesHook = useWorkspaces();

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(propWorkspaceId ?? null);
  const { codebases } = useCodebases(selectedWorkspaceId ?? "");

  const [selectedRole, setSelectedRole] = useState<AgentRole>("ROUTA");
  const [repoSelection, setRepoSelection] = useState<RepoSelection | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const [pendingSkill, setPendingSkill] = useState<string | null>(null);

  // Dropdown states
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const wsDropdownRef = useRef<HTMLDivElement>(null);

  // Sync with external workspaceId prop
  useEffect(() => {
    if (propWorkspaceId && propWorkspaceId !== selectedWorkspaceId) {
      setSelectedWorkspaceId(propWorkspaceId);
    }
  }, [propWorkspaceId]);

  // Auto-select first workspace if none selected
  useEffect(() => {
    if (!selectedWorkspaceId && workspacesHook.workspaces.length > 0) {
      const first = workspacesHook.workspaces[0].id;
      setSelectedWorkspaceId(first);
      onWorkspaceChange?.(first);
    }
  }, [workspacesHook.workspaces, selectedWorkspaceId, onWorkspaceChange]);

  const handleWorkspaceChange = useCallback(
    (wsId: string | null) => {
      setSelectedWorkspaceId(wsId);
      onWorkspaceChange?.(wsId);
      setShowWorkspaceDropdown(false);
    },
    [onWorkspaceChange],
  );

  // Auto-connect ACP
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
  }, [acp.connected, acp.loading, acp.connect]);

  // Load repo skills when selection changes
  useEffect(() => {
    if (repoSelection?.path) {
      skillsHook.loadRepoSkills(repoSelection.path);
    } else {
      skillsHook.clearRepoSkills();
    }
  }, [repoSelection?.path]);

  // Auto-select default codebase
  useEffect(() => {
    if (codebases.length === 0) return;
    const def = codebases.find((c) => c.isDefault) ?? codebases[0];
    setRepoSelection({
      path: def.repoPath,
      branch: def.branch ?? "",
      name: def.label ?? def.repoPath.split("/").pop() ?? "",
    });
  }, [codebases]);

  // Handle external pending skill from grid
  useEffect(() => {
    if (externalPendingSkill) {
      setPendingSkill(externalPendingSkill);
      onExternalSkillConsumed?.();
    }
  }, [externalPendingSkill, onExternalSkillConsumed]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setShowAgentDropdown(false);
      }
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setShowWorkspaceDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSend = useCallback(
    async (text: string, context: InputContext) => {
      if (!text.trim() || !acp.connected) return;
      if (isSubmittingRef.current) return;
      isSubmittingRef.current = true;
      setIsSubmitting(true);

      try {
        const idempotencyKey = `home-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const wsId = selectedWorkspaceId ?? undefined;
        const result = await acp.createSession(
          context.cwd ?? repoSelection?.path,
          context.provider,
          context.mode,
          selectedRole,
          wsId,
          context.model,
          idempotencyKey,
        );

        if (result?.sessionId) {
          const url = wsId ? `/${wsId}/${result.sessionId}` : `/${result.sessionId}`;
          storePendingPrompt(result.sessionId, text);
          onSessionCreated?.(result.sessionId);
          router.push(url);
        }
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [acp, repoSelection, selectedRole, selectedWorkspaceId, router, onSessionCreated],
  );

  const activeWorkspace = workspacesHook.workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Input container with ambient glow on focus */}
      <div className="group relative">
        {/* Glow effect */}
        <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 opacity-0 group-focus-within:opacity-100 blur-xl transition-opacity duration-500 pointer-events-none" />

        <div className="relative bg-white dark:bg-[#12141c] rounded-2xl border border-gray-200 dark:border-[#1c1f2e] shadow-sm dark:shadow-none overflow-hidden transition-colors group-focus-within:border-amber-400/50 dark:group-focus-within:border-amber-500/30">
          {/* TiptapInput */}
          <TiptapInput
            onSend={handleSend}
            placeholder="What are you working on? (@ files, / skills)"
            disabled={!acp.connected || isSubmitting}
            loading={isSubmitting}
            skills={skillsHook.skills}
            repoSkills={skillsHook.repoSkills}
            providers={acp.providers}
            selectedProvider={acp.selectedProvider}
            onProviderChange={acp.setProvider}
            repoSelection={repoSelection}
            onRepoChange={setRepoSelection}
            agentRole={selectedRole}
            onFetchModels={acp.listProviderModels}
            pendingSkill={pendingSkill}
            onSkillInserted={() => setPendingSkill(null)}
          />

          {/* ─── Bottom Control Bar ─────────────────────────────────── */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-t border-gray-100 dark:border-[#1c1f2e]">
            {/* Agent Role Selector — lightweight dropdown */}
            <div className="relative" ref={agentDropdownRef}>
              <button
                type="button"
                onClick={() => setShowAgentDropdown((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedRole === "ROUTA"
                    ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/40"
                    : "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold ${
                    selectedRole === "ROUTA"
                      ? "bg-amber-500 text-white"
                      : "bg-violet-500 text-white"
                  }`}
                >
                  {selectedRole === "ROUTA" ? "R" : "D"}
                </span>
                {selectedRole === "ROUTA" ? "Routa" : "Developer"}
                <svg
                  className="w-3 h-3 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAgentDropdown && (
                <div className="absolute bottom-full left-0 mb-1 w-56 rounded-xl border border-gray-200 dark:border-[#1c1f2e] bg-white dark:bg-[#181b26] shadow-xl z-50 overflow-hidden">
                  <div className="p-1">
                    <button
                      onClick={() => {
                        setSelectedRole("ROUTA");
                        setShowAgentDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors ${
                        selectedRole === "ROUTA"
                          ? "bg-amber-50 dark:bg-amber-900/15"
                          : "hover:bg-gray-50 dark:hover:bg-[#1f2233]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                          selectedRole === "ROUTA"
                            ? "bg-amber-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                        }`}
                      >
                        R
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Routa
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Orchestrate & plan tasks
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => {
                        setSelectedRole("DEVELOPER");
                        setShowAgentDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-3 transition-colors ${
                        selectedRole === "DEVELOPER"
                          ? "bg-violet-50 dark:bg-violet-900/15"
                          : "hover:bg-gray-50 dark:hover:bg-[#1f2233]"
                      }`}
                    >
                      <span
                        className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                          selectedRole === "DEVELOPER"
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                        }`}
                      >
                        D
                      </span>
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          Developer
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          Direct implementation & coding
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-4 bg-gray-200 dark:bg-[#1c1f2e]" />

            {/* Workspace Pill */}
            {workspacesHook.workspaces.length > 0 && (
              <div className="relative" ref={wsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowWorkspaceDropdown((v) => !v)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1c1f2e] border border-transparent hover:border-gray-200 dark:hover:border-[#2a2d3d] transition-all"
                >
                  <svg
                    className="w-3.5 h-3.5 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
                    />
                  </svg>
                  <span className="max-w-[120px] truncate">
                    {activeWorkspace?.title ?? "Workspace"}
                  </span>
                  <svg
                    className="w-2.5 h-2.5 opacity-40"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {showWorkspaceDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 w-52 rounded-xl border border-gray-200 dark:border-[#1c1f2e] bg-white dark:bg-[#181b26] shadow-xl z-50 overflow-hidden">
                    <div className="p-1 max-h-48 overflow-y-auto">
                      {workspacesHook.workspaces.map((ws) => (
                        <button
                          key={ws.id}
                          onClick={() => handleWorkspaceChange(ws.id)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                            ws.id === selectedWorkspaceId
                              ? "bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1f2233]"
                          }`}
                        >
                          <svg
                            className="w-3.5 h-3.5 opacity-50"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776"
                            />
                          </svg>
                          {ws.title}
                          {ws.id === selectedWorkspaceId && (
                            <svg
                              className="w-3.5 h-3.5 ml-auto text-amber-500"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Repo / Branch Pill */}
            {repoSelection && (
              <button
                type="button"
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1c1f2e] border border-transparent hover:border-gray-200 dark:hover:border-[#2a2d3d] transition-all"
                title={repoSelection.path}
              >
                <svg
                  className="w-3.5 h-3.5 opacity-50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                  />
                </svg>
                <span className="max-w-[100px] truncate">{repoSelection.name}</span>
                {repoSelection.branch && (
                  <>
                    <span className="text-gray-300 dark:text-gray-600">/</span>
                    <span className="max-w-[80px] truncate font-mono text-[11px]">
                      {repoSelection.branch}
                    </span>
                  </>
                )}
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Keyboard hint */}
            <span className="hidden sm:inline text-[11px] text-gray-400 dark:text-gray-500">
              <kbd className="px-1 py-0.5 rounded bg-gray-100 dark:bg-[#1c1f2e] font-mono text-[10px]">
                ⏎
              </kbd>{" "}
              send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

