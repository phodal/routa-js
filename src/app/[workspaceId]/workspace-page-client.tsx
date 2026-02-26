"use client";

/**
 * Workspace Page
 *
 * This page is shown when navigating to a workspace without a specific session.
 * It's essentially the same as the home page but with the workspace pre-selected.
 *
 * Route: /[workspaceId]
 *
 * From here users can:
 * 1. Start a new conversation in this workspace
 * 2. Browse and resume recent sessions from this workspace
 * 3. Select a different repository/codebase
 */

import { useCallback, useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { QuickStartInput } from "@/client/components/quick-start-input";
import { useWorkspaces, useCodebases } from "@/client/hooks/use-workspaces";
import { useAcp } from "@/client/hooks/use-acp";
import { WorkspaceSwitcher } from "@/client/components/workspace-switcher";
import { SessionPanel } from "@/client/components/session-panel";
import { SkillPanel } from "@/client/components/skill-panel";
import { AgentInstallPanel } from "@/client/components/agent-install-panel";
import { ProtocolBadge } from "@/app/protocol-badge";

export function WorkspacePageClient() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  const workspacesHook = useWorkspaces();
  const acp = useAcp();
  const { codebases } = useCodebases(workspaceId);

  const [refreshKey, setRefreshKey] = useState(0);
  const [showAgentInstallPopup, setShowAgentInstallPopup] = useState(false);
  const agentInstallCloseRef = useRef<HTMLButtonElement>(null);
  const installAgentsButtonRef = useRef<HTMLButtonElement>(null);

  // Auto-connect on mount
  useEffect(() => {
    if (!acp.connected && !acp.loading) {
      acp.connect();
    }
  }, [acp.connected, acp.loading]);

  // Verify workspace exists, redirect to home if not
  // Allow "default" as a special workspace ID that always exists
  const workspace = workspacesHook.workspaces.find((w) => w.id === workspaceId);
  const isDefaultWorkspace = workspaceId === "default";

  useEffect(() => {
    // Don't redirect if:
    // - Still loading workspaces
    // - Workspace found in list
    // - Using "default" workspace (always allowed)
    if (!workspacesHook.loading && !workspace && !isDefaultWorkspace) {
      router.push("/");
    }
  }, [workspace, workspacesHook.loading, router, isDefaultWorkspace]);

  const handleWorkspaceSelect = useCallback((wsId: string) => {
    router.push(`/${wsId}`);
  }, [router]);

  const handleWorkspaceCreate = useCallback(async (title: string) => {
    const ws = await workspacesHook.createWorkspace(title);
    if (ws) router.push(`/${ws.id}`);
  }, [workspacesHook, router]);

  const handleSessionClick = useCallback((sessionId: string) => {
    router.push(`/${workspaceId}/${sessionId}`);
  }, [workspaceId, router]);

  const handleSessionDeleted = useCallback((deletedId: string) => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Show loading state while workspaces are loading
  // But don't block if using "default" workspace
  if (workspacesHook.loading && !isDefaultWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
        <div className="text-gray-400 dark:text-gray-500">Loading...</div>
      </div>
    );
  }

  // For non-default workspaces, require workspace to exist
  if (!workspace && !isDefaultWorkspace) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
        <div className="text-gray-400 dark:text-gray-500">Loading...</div>
      </div>
    );
  }

  // Create a fallback workspace object for "default"
  const effectiveWorkspace = workspace ?? {
    id: "default",
    title: "Default Workspace",
    status: "active" as const,
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* Top Bar */}
      <header className="h-[52px] shrink-0 bg-white dark:bg-[#161922] border-b border-gray-200 dark:border-gray-800 flex items-center px-4 gap-4 z-10">
        {/* Logo - links back to home */}
        <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img
            src="/logo.svg"
            alt="Routa"
            width={28}
            height={28}
            className="rounded-lg"
          />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Routa
          </span>
        </a>

        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />

        {/* Workspace Selector */}
        <div className="flex items-center gap-2">
          <svg className="w-3.5 h-3.5 text-indigo-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[150px]">
            {effectiveWorkspace.title}
          </span>
          <WorkspaceSwitcher
            workspaces={workspacesHook.workspaces}
            activeWorkspaceId={workspaceId}
            onSelect={handleWorkspaceSelect}
            onCreate={handleWorkspaceCreate}
            loading={workspacesHook.loading}
            compact
          />
        </div>

        {/* Codebase indicator */}
        {codebases.length > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <span>{codebases.length} codebase{codebases.length !== 1 ? "s" : ""}</span>
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Protocol badges */}
        <div className="hidden lg:flex items-center gap-2">
          <ProtocolBadge name="MCP" endpoint="/api/mcp" />
          <ProtocolBadge name="ACP" endpoint="/api/acp" />
        </div>

        {/* Install Agents Button */}
        <button
          ref={installAgentsButtonRef}
          onClick={() => setShowAgentInstallPopup(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Install Agents
        </button>

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

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left/Center - Quick Start Input */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-5 py-12">
            <QuickStartInput
              workspaceId={workspaceId}
              hideWorkspace
              onSessionCreated={(sessionId) => {
                setRefreshKey((k) => k + 1);
              }}
            />
          </div>
        </main>

        {/* Right Sidebar - Recent Sessions & Skills */}
        <aside className="w-80 shrink-0 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex flex-col overflow-y-auto hidden lg:flex">
          {/* Recent Sessions */}
          <div className="flex-1">
            <SessionPanel
              selectedSessionId={null}
              onSelect={handleSessionClick}
              refreshKey={refreshKey}
              workspaceId={workspaceId}
              onSessionDeleted={handleSessionDeleted}
            />
          </div>

          {/* Divider */}
          <div className="mx-3 my-1 border-t border-gray-100 dark:border-gray-800" />

          {/* Skills */}
          <div className="flex-1">
            <SkillPanel />
          </div>
        </aside>
      </div>

      {/* Agent Install Popup */}
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
    </div>
  );
}

import { useRef } from "react";
