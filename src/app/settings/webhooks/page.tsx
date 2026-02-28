"use client";

/**
 * GitHub Webhook Trigger Settings Page - /settings/webhooks
 *
 * Provides a full-page UI for configuring GitHub webhook event-driven triggers.
 * Agents (Claude Code, GLM, etc.) are automatically triggered when GitHub events occur.
 */

import { GitHubWebhookPanel } from "@/client/components/github-webhook-panel";

export default function WebhookSettingsPage() {
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
              GitHub Webhook Triggers
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Automatically trigger agents when GitHub events occur (issues, PRs, CI)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Webhook URL:</span>
            <code className="text-xs text-amber-600 dark:text-amber-300 font-mono">
              /api/webhooks/github
            </code>
          </div>
          <a
            href="https://github.com/phodal/routa/issues/43"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            See Issue #43 →
          </a>
        </div>
      </header>

      {/* Info banner */}
      <div className="shrink-0 px-5 py-2.5 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30">
        <p className="text-xs text-blue-700 dark:text-blue-400">
          <span className="font-semibold">How it works:</span>{" "}
          Configure a GitHub repository webhook pointing to <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded font-mono">{"<your-domain>/api/webhooks/github"}</code>.
          When events arrive, the selected agent is automatically triggered via a background task.
          Suggested agents: <span className="font-medium">claude-code</span> (implementation) or <span className="font-medium">glm-4</span> (analysis/search).
        </p>
      </div>

      {/* Main Content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <GitHubWebhookPanel />
      </main>
    </div>
  );
}
