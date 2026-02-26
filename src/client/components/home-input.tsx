"use client";

/**
 * HomeInput - Landing page input component
 *
 * A hero-style input for the home page that:
 * - Uses TiptapInput internally for skills, file mentions, etc.
 * - Provides mode selection (ROUTA vs CRAFTER)
 * - Shows provider/model selection
 * - Creates session and navigates to workspace
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TiptapInput, type InputContext } from "./tiptap-input";
import { useAcp } from "../hooks/use-acp";
import { useSkills } from "../hooks/use-skills";
import { useWorkspaces, useCodebases } from "../hooks/use-workspaces";
import type { RepoSelection } from "./repo-picker";
import { storePendingPrompt } from "../utils/pending-prompt";

type AgentRole = "CRAFTER" | "ROUTA" | "GATE" | "DEVELOPER";

interface HomeInputProps {
  /** Initial workspace ID (optional) */
  workspaceId?: string;
  /** Called when workspace selection changes */
  onWorkspaceChange?: (workspaceId: string | null) => void;
  onSessionCreated?: (sessionId: string) => void;
}

export function HomeInput({ workspaceId: propWorkspaceId, onWorkspaceChange, onSessionCreated }: HomeInputProps) {
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

  const handleWorkspaceChange = useCallback((wsId: string | null) => {
    setSelectedWorkspaceId(wsId);
    onWorkspaceChange?.(wsId);
  }, [onWorkspaceChange]);

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
          idempotencyKey
        );

        if (result?.sessionId) {
          const url = wsId
            ? `/${wsId}/${result.sessionId}`
            : `/${result.sessionId}`;

          // Store the prompt for the session page to send after navigation
          // This avoids ACP request cancellation during page transition
          storePendingPrompt(result.sessionId, text);

          onSessionCreated?.(result.sessionId);
          router.push(url);
          // Don't send prompt here - it will be sent by the session page
        }
      } finally {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }
    },
    [acp, repoSelection, selectedRole, selectedWorkspaceId, router, onSessionCreated]
  );

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Hero title */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          What would you like to build?
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Describe your task and let the agents help you.
        </p>
      </div>

      {/* Skills chip list */}
      {skillsHook.allSkills.length > 0 && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Skills:</span>
          {skillsHook.allSkills.map((skill) => (
            <button
              key={skill.name}
              type="button"
              onClick={() => setPendingSkill(skill.name)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                pendingSkill === skill.name
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white dark:bg-[#1a1f2e] text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600"
              }`}
              title={skill.description}
            >
              /{skill.name}
            </button>
          ))}
        </div>
      )}

      {/* Mode selection cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ModeCard
          active={selectedRole === "ROUTA"}
          onClick={() => setSelectedRole("ROUTA")}
          icon="R"
          name="Routa"
          description="Task orchestration & planning. Generates specs and coordinates workflow."
          color="indigo"
          recommended
        />
        <ModeCard
          active={selectedRole === "CRAFTER"}
          onClick={() => setSelectedRole("CRAFTER")}
          icon="C"
          name="Crafter"
          description="Direct implementation. Focuses on coding and execution."
          color="violet"
        />
      </div>

      {/* TiptapInput */}
      <div className="bg-white dark:bg-[#1a1f2e] rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden focus-within:border-indigo-400 dark:focus-within:border-indigo-600 transition-colors">
        <TiptapInput
          onSend={handleSend}
          placeholder="Describe your task, question, or goal... (use @ for files, / for skills)"
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
      </div>

      {/* Workspace selector */}
      {workspacesHook.workspaces.length > 0 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <label className="text-xs text-gray-500 dark:text-gray-400">Workspace:</label>
          <select
            value={selectedWorkspaceId ?? ""}
            onChange={(e) => handleWorkspaceChange(e.target.value || null)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            {workspacesHook.workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>{ws.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-3 text-center text-xs text-gray-400 dark:text-gray-500">
        Press <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono">Enter</kbd> to send
      </div>
    </div>
  );
}

// ─── Mode Card Component ───────────────────────────────────────────────

interface ModeCardProps {
  active: boolean;
  onClick: () => void;
  icon: string;
  name: string;
  description: string;
  color: "indigo" | "violet";
  recommended?: boolean;
}

function ModeCard({
  active,
  onClick,
  icon,
  name,
  description,
  color,
  recommended,
}: ModeCardProps) {
  const colorClasses = {
    indigo: {
      active: "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/25",
      icon: "bg-indigo-600 text-white",
      iconInactive: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
      text: "text-indigo-700 dark:text-indigo-300",
      badge: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400",
    },
    violet: {
      active: "border-violet-500 bg-violet-50 dark:bg-violet-900/25",
      icon: "bg-violet-600 text-white",
      iconInactive: "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
      text: "text-violet-700 dark:text-violet-300",
      badge: "bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400",
    },
  };

  const c = colorClasses[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-4 rounded-xl border-2 text-left transition-all duration-150 ${
        active
          ? `${c.active} shadow-md`
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1f2e] hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
            active ? c.icon : c.iconInactive
          }`}
        >
          {icon}
        </div>
        <span
          className={`font-semibold ${
            active ? c.text : "text-gray-800 dark:text-gray-200"
          }`}
        >
          {name}
        </span>
        {recommended && active && (
          <span className={`ml-auto text-[10px] font-medium ${c.badge} px-2 py-0.5 rounded-full`}>
            Recommended
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
        {description}
      </p>
    </button>
  );
}

