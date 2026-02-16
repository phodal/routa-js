"use client";

/**
 * Agent Installation Settings Page - /settings/agents
 *
 * Provides a full-page UI for managing ACP agent installations.
 * Accessible from the Tauri menu "Install Agents".
 */

import { AgentInstallPanel } from "@/client/components/agent-install-panel";

export default function AgentSettingsPage() {
  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* Header */}
      <header className="shrink-0 px-5 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#13151d] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            title="Back to Home"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </a>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Agent Installation
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Install and manage ACP agents from the registry
            </p>
          </div>
        </div>
        <a
          href="https://agentclientprotocol.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          Learn about ACP →
        </a>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <AgentInstallPanel />
      </main>
    </div>
  );
}

