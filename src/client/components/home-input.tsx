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
import { loadProviderConnectionConfig, getModelDefinitionByAlias } from "./settings-panel";

type AgentRole = "ROUTA" | "DEVELOPER";

interface SpecialistSummary { id: string; name: string; description?: string; role?: string; }

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
  /** Skills to display as subtle suggestion pills below the input */
  displaySkills?: Array<{ name: string; description: string }>;
  /** Called when a skill pill is clicked */
  onSkillPillClick?: (name: string) => void;
}

export function HomeInput({
  workspaceId: propWorkspaceId,
  onWorkspaceChange,
  onSessionCreated,
  externalPendingSkill,
  onExternalSkillConsumed,
  displaySkills,
  onSkillPillClick,
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

  // Specialists
  const [specialists, setSpecialists] = useState<SpecialistSummary[]>([]);
  const [selectedSpecialistId, setSelectedSpecialistId] = useState<string | null>(null);
  const [showSpecialistDropdown, setShowSpecialistDropdown] = useState(false);
  const specialistDropdownRef = useRef<HTMLDivElement>(null);

  // Dropdown states
  const [showWorkspaceDropdown, setShowWorkspaceDropdown] = useState(false);
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

  // Load specialists
  useEffect(() => {
    fetch("/api/specialists")
      .then((r) => r.ok ? r.json() : { specialists: [] })
      .then((data) => setSpecialists(data.specialists ?? []))
      .catch(() => {});
  }, []);

  // Close specialist dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (specialistDropdownRef.current && !specialistDropdownRef.current.contains(e.target as Node)) {
        setShowSpecialistDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  // Click outside to close workspace dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
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
        const effectiveProvider = context.provider ?? acp.selectedProvider;
        const conn = loadProviderConnectionConfig(effectiveProvider);
        const modelAliasOrName = context.model ?? conn.model;
        const def = modelAliasOrName ? getModelDefinitionByAlias(modelAliasOrName) : undefined;
        const result = await acp.createSession(
          context.cwd ?? repoSelection?.path,
          context.provider,
          context.mode,
          selectedRole,
          wsId,
          def ? def.modelName : modelAliasOrName,
          idempotencyKey,
          selectedSpecialistId ?? undefined,
          def?.baseUrl ?? conn.baseUrl,
          def?.apiKey ?? conn.apiKey,
        );

        if (result?.sessionId) {
          const url = wsId ? `/workspace/${wsId}/sessions/${result.sessionId}` : `/workspace/${result.sessionId}`;
          const promptText = context.skill ? `/${context.skill} ${text}` : text;
          storePendingPrompt(result.sessionId, promptText);
          onSessionCreated?.(result.sessionId);
          router.push(url);
        }
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [acp, repoSelection, selectedRole, selectedWorkspaceId, selectedSpecialistId, router, onSessionCreated],
  );

  const activeWorkspace = workspacesHook.workspaces.find((w) => w.id === selectedWorkspaceId);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Input container with ambient glow on focus */}
      <div className="group relative" id="home-input-container">
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
            {/* Agent Role — segmented control */}
            <div
              className="flex items-center rounded-lg bg-gray-100 dark:bg-[#1a1d2a] p-0.5 gap-0.5"
              role="group"
              aria-label="Agent mode"
            >
              <button
                type="button"
                onClick={() => setSelectedRole("ROUTA")}
                title="Multi-agent orchestration — spawns specialized agents for complex multi-step tasks (Routa)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedRole === "ROUTA"
                    ? "bg-white dark:bg-[#1f2233] shadow-sm text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {/* nodes/network icon */}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={selectedRole === "ROUTA" ? 2.5 : 2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1M4.22 4.22l.707.707m13.857 13.857l.707.707M1 12h1m20 0h1M4.22 19.78l.707-.707m13.857-13.857l.707-.707"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" />
                </svg>
                Multi-Agent
              </button>
              <button
                type="button"
                onClick={() => setSelectedRole("DEVELOPER")}
                title="Single-agent direct coding — best for focused, simple tasks (Developer)"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedRole === "DEVELOPER"
                    ? "bg-white dark:bg-[#1f2233] shadow-sm text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                {/* lightning bolt for direct/fast */}
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={selectedRole === "DEVELOPER" ? 2.5 : 2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                </svg>
                Direct
              </button>
            </div>

            <div className="w-px h-4 bg-gray-200 dark:bg-[#1c1f2e]" />

            {/* Specialist Picker */}
            {specialists.length > 0 && (
              <div className="relative" ref={specialistDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowSpecialistDropdown((v) => !v)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs border transition-all ${
                    selectedSpecialistId
                      ? "text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#1c1f2e] border-transparent hover:border-gray-200 dark:hover:border-[#2a2d3d]"
                  }`}
                  title="Select a specialist agent"
                >
                  <svg className="w-3.5 h-3.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  <span className="max-w-[96px] truncate">
                    {selectedSpecialistId
                      ? (specialists.find((s) => s.id === selectedSpecialistId)?.name ?? "Specialist")
                      : "Specialist"}
                  </span>
                  {selectedSpecialistId && (
                    <span
                      role="button"
                      aria-label="Clear specialist"
                      onClick={(e) => { e.stopPropagation(); setSelectedSpecialistId(null); }}
                      className="ml-0.5 text-violet-400 hover:text-violet-600 dark:hover:text-violet-200 cursor-pointer"
                    >
                      ×
                    </span>
                  )}
                  {!selectedSpecialistId && (
                    <svg className="w-2.5 h-2.5 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>

                {showSpecialistDropdown && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 rounded-xl border border-gray-200 dark:border-[#1c1f2e] bg-white dark:bg-[#181b26] shadow-xl z-50 overflow-hidden">
                    <div className="px-2 pt-2 pb-1">
                      <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide px-1 mb-1">Specialists</p>
                      <button
                        onClick={() => { setSelectedSpecialistId(null); setShowSpecialistDropdown(false); }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                          !selectedSpecialistId
                            ? "bg-amber-50 dark:bg-amber-900/15 text-amber-700 dark:text-amber-400"
                            : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-[#1f2233]"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Default
                      </button>
                    </div>
                    <div className="border-t border-gray-100 dark:border-[#1c1f2e] p-1 max-h-48 overflow-y-auto">
                      {specialists.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { setSelectedSpecialistId(s.id); setShowSpecialistDropdown(false); }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                            s.id === selectedSpecialistId
                              ? "bg-violet-50 dark:bg-violet-900/15 text-violet-700 dark:text-violet-300"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#1f2233]"
                          }`}
                        >
                          <div className="font-medium truncate">{s.name}</div>
                          {s.description && (
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{s.description}</div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {specialists.length > 0 && <div className="w-px h-4 bg-gray-200 dark:bg-[#1c1f2e]" />}

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

      {/* ─── Mode Tips ──────────────────────────────────────────────── */}
      <div className="mt-2 px-1 min-h-[44px]">
        {selectedRole === "ROUTA" ? (
          <div className="flex items-start gap-2 text-[11px] text-gray-400 dark:text-gray-500 animate-fade-in-up">
            <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="w-2 h-2 text-amber-500" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 leading-relaxed">
              <span className="text-gray-500 dark:text-gray-400">适合复杂任务</span>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span>自动拆解需求并分配给多个专属 Agent</span>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="italic opacity-70">e.g. "实现一个完整的登录模块"</span>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-[11px] text-gray-400 dark:text-gray-500 animate-fade-in-up">
            <span className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <svg className="w-2 h-2 text-violet-500" fill="currentColor" viewBox="0 0 8 8">
                <circle cx="4" cy="4" r="3" />
              </svg>
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 leading-relaxed">
              <span className="text-gray-500 dark:text-gray-400">适合简单快速任务</span>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span>单 Agent 直接执行，无编排开销</span>
              <span className="text-gray-300 dark:text-gray-700">·</span>
              <span className="italic opacity-70">e.g. "修复这个 bug" / "解释这段代码"</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Skills — compact cards with name + description ── */}
      {displaySkills && displaySkills.length > 0 && (
        <div className="mt-2.5 px-0.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {displaySkills.slice(0, 9).map((skill) => (
              <button
                key={skill.name}
                type="button"
                onClick={() => setPendingSkill(skill.name)}
                className="group flex flex-col gap-0.5 px-2.5 py-2 rounded-lg text-left bg-gray-50 dark:bg-[#12141c] border border-gray-100 dark:border-[#1c1f2e] hover:border-amber-300/60 dark:hover:border-amber-700/40 hover:bg-white dark:hover:bg-[#151720] transition-all"
              >
                <span className="text-[11px] font-mono font-medium text-gray-500 dark:text-gray-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  /{skill.name}
                </span>
                {skill.description && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-600 leading-snug line-clamp-1">
                    {skill.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

