"use client";

/**
 * Messages Page - Notification & PR Agent Execution History
 * 
 * Shows:
 * - All notifications with filtering
 * - PR Agent execution history from background tasks
 * - Webhook trigger logs
 */

import { useState, useEffect } from "react";

interface BackgroundTask {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  type: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface TriggerLog {
  id: string;
  configId: string;
  eventType: string;
  eventAction?: string;
  backgroundTaskId?: string;
  signatureValid: boolean;
  outcome: "triggered" | "skipped" | "error";
  errorMessage?: string;
  createdAt: string;
}

export default function MessagesPage() {
  const [tab, setTab] = useState<"tasks" | "logs">("tasks");
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [logs, setLogs] = useState<TriggerLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [tasksRes, logsRes] = await Promise.all([
          fetch("/api/background-tasks?limit=50"),
          fetch("/api/webhooks/logs?limit=50"),
        ]);
        if (tasksRes.ok) setTasks((await tasksRes.json()).tasks ?? []);
        if (logsRes.ok) setLogs((await logsRes.json()).logs ?? []);
      } catch { /* ignore */ }
      setLoading(false);
    };
    fetchData();
  }, []);

  const formatTime = (ts: string) => new Date(ts).toLocaleString();

  const getStatusBadge = (status: BackgroundTask["status"]) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      cancelled: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[status] ?? colors.pending}`}>{status}</span>;
  };

  const getOutcomeBadge = (outcome: TriggerLog["outcome"]) => {
    const colors: Record<string, string> = {
      triggered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      skipped: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors[outcome] ?? ""}`}>{outcome}</span>;
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0c12]">
      {/* Header */}
      <header className="h-12 border-b border-gray-100 dark:border-[#151720] flex items-center px-5 sticky top-0 bg-[#fafafa]/90 dark:bg-[#0a0c12]/90 backdrop-blur-sm z-10">
        <a href="/" className="flex items-center gap-2.5 mr-6">
          <img src="/logo.svg" alt="Routa" width={22} height={22} className="rounded-md" />
          <span className="text-[13px] font-semibold text-gray-800 dark:text-gray-200">Messages</span>
        </a>
        <div className="flex gap-1">
          <button
            onClick={() => setTab("tasks")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "tasks" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
          >
            Background Tasks
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "logs" ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}
          >
            Webhook Logs
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto p-6">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading...</div>
        ) : tab === "tasks" ? (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">PR Agent & Background Tasks</h2>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No background tasks yet</p>
            ) : (
              tasks.map((t) => (
                <div key={t.id} className="p-4 bg-white dark:bg-[#12141c] border border-gray-100 dark:border-[#1c1f2e] rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{t.name}</span>
                    {getStatusBadge(t.status)}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-gray-500">
                    <span>Type: {t.type}</span>
                    <span>Created: {formatTime(t.createdAt)}</span>
                    {t.completedAt && <span>Completed: {formatTime(t.completedAt)}</span>}
                  </div>
                  {t.error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{t.error}</p>}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Webhook Trigger Logs</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No webhook logs yet</p>
            ) : (
              logs.map((l) => (
                <div key={l.id} className="p-4 bg-white dark:bg-[#12141c] border border-gray-100 dark:border-[#1c1f2e] rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{l.eventType}{l.eventAction ? `:${l.eventAction}` : ""}</span>
                    {getOutcomeBadge(l.outcome)}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-gray-500">
                    <span>Config: {l.configId.slice(0, 8)}</span>
                    <span>Signature: {l.signatureValid ? "✓" : "✗"}</span>
                    <span>{formatTime(l.createdAt)}</span>
                  </div>
                  {l.errorMessage && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{l.errorMessage}</p>}
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  );
}

