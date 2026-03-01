"use client";

/**
 * GitHub Webhook Configuration Panel
 *
 * Allows users to:
 * - View and manage GitHub webhook trigger configurations
 * - Create configs (repo, events, trigger agent, token, secret)
 * - Register the webhook directly on GitHub via the API
 * - View recent trigger logs
 */

import { useState, useEffect, useCallback } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface WebhookConfig {
  id: string;
  name: string;
  repo: string;
  githubToken: string;
  webhookSecret: string;
  eventTypes: string[];
  labelFilter: string[];
  triggerAgentId: string;
  workspaceId?: string;
  enabled: boolean;
  promptTemplate?: string;
  createdAt: string;
  updatedAt: string;
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

interface FormState {
  name: string;
  repo: string;
  githubToken: string;
  webhookSecret: string;
  eventTypes: string[];
  labelFilter: string;
  triggerAgentId: string;
  enabled: boolean;
  promptTemplate: string;
}

const SUPPORTED_EVENTS = [
  { value: "issues", label: "Issues", description: "opened, labeled, closed, etc." },
  { value: "pull_request", label: "Pull Requests", description: "opened, synchronize, merged, etc." },
  { value: "pull_request_review", label: "PR Reviews", description: "approved, changes_requested, commented" },
  { value: "pull_request_review_comment", label: "PR Review Comments", description: "Comments on PR diffs" },
  { value: "check_run", label: "Check Runs", description: "Build success/failure events" },
  { value: "check_suite", label: "Check Suites", description: "Suite of checks completed" },
  { value: "workflow_run", label: "Workflow Runs", description: "GitHub Actions workflow events" },
  { value: "workflow_job", label: "Workflow Jobs", description: "Individual job events" },
  { value: "push", label: "Push", description: "Code pushed to branches" },
  { value: "create", label: "Create", description: "Branch or tag created" },
  { value: "delete", label: "Delete", description: "Branch or tag deleted" },
  { value: "issue_comment", label: "Issue Comments", description: "Comments on issues/PRs" },
];

const DEFAULT_AGENTS = [
  { value: "claude-code", label: "Claude Code (Recommended)" },
  { value: "opencode", label: "OpenCode" },
  { value: "glm-4", label: "GLM-4 (BigModel)" },
];

const EMPTY_FORM: FormState = {
  name: "",
  repo: "",
  githubToken: "",
  webhookSecret: "",
  eventTypes: ["issues"],
  labelFilter: "",
  triggerAgentId: "claude-code",
  enabled: true,
  promptTemplate: "",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function GitHubWebhookPanel() {
  const [configs, setConfigs] = useState<WebhookConfig[]>([]);
  const [logs, setLogs] = useState<TriggerLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"configs" | "logs">("configs");

  // Detect server URL for webhook registration
  useEffect(() => {
    setServerUrl(window.location.origin);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [cfgRes, logRes] = await Promise.all([
        fetch("/api/webhooks/configs"),
        fetch("/api/webhooks/webhook-logs?limit=50"),
      ]);
      if (cfgRes.ok) {
        const data = await cfgRes.json();
        setConfigs(data.configs ?? []);
      }
      if (logRes.ok) {
        const data = await logRes.json();
        setLogs(data.logs ?? []);
      }
    } catch (err) {
      console.error("Failed to load webhook data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openCreate() {
    setForm({ ...EMPTY_FORM, githubToken: process.env.NEXT_PUBLIC_GITHUB_TOKEN ?? "" });
    setEditId(null);
    setShowForm(true);
    setError(null);
  }

  function openEdit(config: WebhookConfig) {
    setForm({
      name: config.name,
      repo: config.repo,
      githubToken: "", // don't expose masked token; user must re-enter to change
      webhookSecret: config.webhookSecret,
      eventTypes: config.eventTypes,
      labelFilter: (config.labelFilter ?? []).join(", "),
      triggerAgentId: config.triggerAgentId,
      enabled: config.enabled,
      promptTemplate: config.promptTemplate ?? "",
    });
    setEditId(config.id);
    setShowForm(true);
    setError(null);
  }

  function toggleEvent(ev: string) {
    setForm((prev) => ({
      ...prev,
      eventTypes: prev.eventTypes.includes(ev)
        ? prev.eventTypes.filter((e) => e !== ev)
        : [...prev.eventTypes, ev],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.repo || !form.triggerAgentId || form.eventTypes.length === 0) {
      setError("Please fill in all required fields and select at least one event.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...(editId ? { id: editId } : {}),
        name: form.name,
        repo: form.repo,
        ...(form.githubToken ? { githubToken: form.githubToken } : {}),
        webhookSecret: form.webhookSecret,
        eventTypes: form.eventTypes,
        labelFilter: form.labelFilter
          ? form.labelFilter.split(",").map((l) => l.trim()).filter(Boolean)
          : [],
        triggerAgentId: form.triggerAgentId,
        enabled: form.enabled,
        promptTemplate: form.promptTemplate || undefined,
      };

      const res = await fetch("/api/webhooks/configs", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }

      setSuccess(editId ? "Webhook config updated." : "Webhook config created.");
      setShowForm(false);
      setEditId(null);
      await loadData();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this webhook configuration?")) return;
    try {
      const res = await fetch(`/api/webhooks/configs?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSuccess("Webhook config deleted.");
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRegister(config: WebhookConfig) {
    const tokenToUse = window.prompt(
      `Enter GitHub personal access token for ${config.repo} to register the webhook:\n(needs repo webhook admin scope)`,
      ""
    );
    if (!tokenToUse) return;

    setRegistering(config.id);
    setError(null);
    try {
      const webhookUrl = `${serverUrl}/api/webhooks/github`;
      const res = await fetch("/api/webhooks/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenToUse,
          repo: config.repo,
          webhookUrl,
          secret: config.webhookSecret,
          events: config.eventTypes,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSuccess(
        `Webhook registered on GitHub! Hook ID: ${data.hook?.id}. URL: ${webhookUrl}`
      );
    } catch (err) {
      setError(`Failed to register webhook: ${err}`);
    } finally {
      setRegistering(null);
    }
  }

  async function handleToggleEnabled(config: WebhookConfig) {
    try {
      const res = await fetch("/api/webhooks/configs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: config.id, enabled: !config.enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadData();
    } catch (err) {
      setError(String(err));
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Alerts */}
      {error && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-400 text-sm flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {success && (
        <div className="mx-4 mt-3 px-4 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 text-sm flex items-start gap-2">
          <span className="shrink-0 mt-0.5">✓</span>
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto shrink-0 text-green-400 hover:text-green-600">✕</button>
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {(["configs", "logs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                activeTab === tab
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab === "configs" ? "Configurations" : "Trigger Logs"}
            </button>
          ))}
        </div>

        {activeTab === "configs" && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Trigger
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {activeTab === "configs" && (
          <>
            {showForm && (
              <WebhookConfigForm
                form={form}
                setForm={setForm}
                editId={editId}
                saving={saving}
                onSubmit={handleSubmit}
                onCancel={() => { setShowForm(false); setEditId(null); setError(null); }}
                toggleEvent={toggleEvent}
              />
            )}

            {!showForm && (
              <>
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin mr-2" />
                    Loading…
                  </div>
                ) : configs.length === 0 ? (
                  <EmptyState onAdd={openCreate} />
                ) : (
                  <div className="space-y-3 mt-2">
                    {configs.map((config) => (
                      <WebhookConfigCard
                        key={config.id}
                        config={config}
                        onEdit={() => openEdit(config)}
                        onDelete={() => handleDelete(config.id)}
                        onRegister={() => handleRegister(config)}
                        onToggle={() => handleToggleEnabled(config)}
                        registering={registering === config.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {activeTab === "logs" && (
          <TriggerLogsTable logs={logs} configs={configs} onRefresh={loadData} />
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
        </svg>
      </div>
      <h3 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-1">No webhook triggers configured</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-4">
        Connect a GitHub repository to automatically trigger agents when issues are created, PRs are opened, or builds complete.
      </p>
      <button
        onClick={onAdd}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
      >
        Add Your First Trigger
      </button>
    </div>
  );
}

interface WebhookConfigFormProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editId: string | null;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  toggleEvent: (ev: string) => void;
}

function WebhookConfigForm({ form, setForm, editId, saving, onSubmit, onCancel, toggleEvent }: WebhookConfigFormProps) {
  return (
    <form onSubmit={onSubmit} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mt-2 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {editId ? "Edit Webhook Trigger" : "New Webhook Trigger"}
      </h3>

      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          data-testid="webhook-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          placeholder="e.g. Issue Handler — data-mesh-spike"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          required
        />
      </div>

      {/* Repository */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          GitHub Repository <span className="text-red-500">*</span>
          <span className="ml-1 text-gray-400 font-normal">(owner/repo)</span>
        </label>
        <input
          data-testid="webhook-repo"
          type="text"
          value={form.repo}
          onChange={(e) => setForm((p) => ({ ...p, repo: e.target.value }))}
          placeholder="phodal-archive/data-mesh-spike"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          required
        />
      </div>

      {/* GitHub Token */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          GitHub Token <span className="text-red-500">{editId ? "" : "*"}</span>
          {editId && <span className="ml-1 text-gray-400 font-normal">(leave blank to keep existing)</span>}
        </label>
        <input
          data-testid="webhook-token"
          type="password"
          value={form.githubToken}
          onChange={(e) => setForm((p) => ({ ...p, githubToken: e.target.value }))}
          placeholder={editId ? "Leave blank to keep existing token" : "github_pat_..."}
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          required={!editId}
        />
      </div>

      {/* Webhook Secret */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Webhook Secret
          <span className="ml-1 text-gray-400 font-normal">(used to verify payloads)</span>
        </label>
        <input
          data-testid="webhook-secret"
          type="text"
          value={form.webhookSecret}
          onChange={(e) => setForm((p) => ({ ...p, webhookSecret: e.target.value }))}
          placeholder="routa-webhook-secret-2026"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
        />
      </div>

      {/* Events */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Events to Subscribe <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          {SUPPORTED_EVENTS.map((ev) => (
            <label
              key={ev.value}
              className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                form.eventTypes.includes(ev.value)
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-500"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <input
                type="checkbox"
                data-testid={`event-${ev.value}`}
                checked={form.eventTypes.includes(ev.value)}
                onChange={() => toggleEvent(ev.value)}
                className="mt-0.5 accent-blue-600"
              />
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100">{ev.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{ev.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Label filter */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Label Filter
          <span className="ml-1 text-gray-400 font-normal">(comma-separated; only trigger for issues with these labels)</span>
        </label>
        <input
          data-testid="webhook-label-filter"
          type="text"
          value={form.labelFilter}
          onChange={(e) => setForm((p) => ({ ...p, labelFilter: e.target.value }))}
          placeholder="feature, enhancement, bug"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
        />
      </div>

      {/* Trigger Agent */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Trigger Agent <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <select
            value={DEFAULT_AGENTS.some(a => a.value === form.triggerAgentId) ? form.triggerAgentId : "__custom__"}
            onChange={(e) => {
              if (e.target.value !== "__custom__") {
                setForm((p) => ({ ...p, triggerAgentId: e.target.value }));
              }
            }}
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
          >
            {DEFAULT_AGENTS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
          <input
            data-testid="webhook-agent"
            type="text"
            value={form.triggerAgentId}
            onChange={(e) => setForm((p) => ({ ...p, triggerAgentId: e.target.value }))}
            placeholder="agent ID"
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100"
            required
          />
        </div>
      </div>

      {/* Prompt Template */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Prompt Template
          <span className="ml-1 text-gray-400 font-normal">(optional; use {`{{event}}`}, {`{{action}}`}, {`{{repo}}`}, {`{{context}}`})</span>
        </label>
        <textarea
          data-testid="webhook-prompt"
          value={form.promptTemplate}
          onChange={(e) => setForm((p) => ({ ...p, promptTemplate: e.target.value }))}
          rows={3}
          placeholder="Leave blank for default prompt…"
          className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-100 resize-none"
        />
      </div>

      {/* Enabled */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          data-testid="webhook-enabled"
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
          className="accent-blue-600"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
      </label>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          data-testid="webhook-submit"
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
        >
          {saving ? "Saving…" : editId ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

interface WebhookConfigCardProps {
  config: WebhookConfig;
  onEdit: () => void;
  onDelete: () => void;
  onRegister: () => void;
  onToggle: () => void;
  registering: boolean;
}

function WebhookConfigCard({ config, onEdit, onDelete, onRegister, onToggle, registering }: WebhookConfigCardProps) {
  return (
    <div className={`bg-white dark:bg-gray-800/50 border rounded-xl p-4 transition-colors ${
      config.enabled
        ? "border-gray-200 dark:border-gray-700"
        : "border-gray-100 dark:border-gray-800 opacity-60"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${config.enabled ? "bg-green-500" : "bg-gray-400"}`} />
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{config.name}</h4>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 ml-4">
            <span className="font-medium text-gray-700 dark:text-gray-300">{config.repo}</span>
            {" → "}
            <span className="inline-flex items-center gap-1">
              <span className="w-3.5 h-3.5 inline-block">🤖</span>
              {config.triggerAgentId}
            </span>
          </p>
          <div className="ml-4 flex flex-wrap gap-1">
            {config.eventTypes.map((ev) => (
              <span key={ev} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                {ev}
              </span>
            ))}
            {(config.labelFilter ?? []).length > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                labels: {config.labelFilter.join(", ")}
              </span>
            )}
          </div>
        </div>

        {/* Enabled toggle */}
        <button
          onClick={onToggle}
          title={config.enabled ? "Disable" : "Enable"}
          className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          {config.enabled ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 12.728M5.636 5.636A9 9 0 0118.364 18.364M5.636 5.636L18.364 18.364" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="9" />
            </svg>
          )}
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={onRegister}
          disabled={registering}
          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-300 rounded-md transition-colors disabled:opacity-50"
        >
          {registering ? (
            <span className="w-3 h-3 border border-white dark:border-gray-900 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          )}
          Register on GitHub
        </button>

        <button
          onClick={onEdit}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Edit
        </button>

        <button
          onClick={onDelete}
          className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors ml-auto"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  );
}

interface TriggerLogsTableProps {
  logs: TriggerLog[];
  configs: WebhookConfig[];
  onRefresh: () => void;
}

function TriggerLogsTable({ logs, configs, onRefresh }: TriggerLogsTableProps) {
  const configMap = Object.fromEntries(configs.map((c) => [c.id, c.name]));

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">{logs.length} recent events</p>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">No webhook events received yet.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Events will appear here once GitHub sends webhook payloads.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                log.outcome === "triggered" ? "bg-green-500" :
                log.outcome === "skipped" ? "bg-yellow-400" : "bg-red-500"
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                  {log.eventType}{log.eventAction ? ` · ${log.eventAction}` : ""}
                  <span className="ml-1.5 text-gray-400 font-normal">
                    {configMap[log.configId] ?? log.configId}
                  </span>
                </p>
                {log.errorMessage && (
                  <p className="text-xs text-red-500 truncate">{log.errorMessage}</p>
                )}
                {log.backgroundTaskId && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Task: {log.backgroundTaskId}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-400">
                {new Date(log.createdAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
