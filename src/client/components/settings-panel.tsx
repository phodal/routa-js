"use client";

import { useState, useEffect, useCallback } from "react";
import { desktopAwareFetch } from "../utils/diagnostics";
import { SpecialistManager } from "./specialist-manager";

/**
 * Agent roles that can have default providers configured.
 */
const AGENT_ROLES = ["ROUTA", "CRAFTER", "GATE", "DEVELOPER"] as const;
type AgentRoleKey = (typeof AGENT_ROLES)[number];

const ROLE_DESCRIPTIONS: Record<AgentRoleKey, string> = {
  ROUTA: "Coordinator – plans & delegates",
  CRAFTER: "Implementation – writes code",
  GATE: "Verification – reviews code",
  DEVELOPER: "Solo – plans, implements & verifies",
};

const STORAGE_KEY = "routa.defaultProviders";

/**
 * Memory statistics interface from /api/memory
 */
interface MemoryStats {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  rssMB: number;
  arrayBuffersMB: number;
  usagePercentage: number;
  level: "normal" | "warning" | "critical";
  timestamp: string;
}

interface MemoryResponse {
  current: MemoryStats;
  peaks: {
    heapUsedMB: number;
    rssMB: number;
  };
  growthRateMBPerMinute: number;
  sessionStore: {
    sessionCount: number;
    activeSseCount: number;
    streamingCount: number;
    totalHistoryMessages: number;
    totalPendingNotifications: number;
    staleSessionCount: number;
  };
  recommendations: string[];
}

/** Per-agent provider + model configuration (stored in localStorage). */
export interface AgentModelConfig {
  provider?: string;
  model?: string;
  maxTurns?: number;
}

export interface DefaultProviderSettings {
  ROUTA?: AgentModelConfig;
  CRAFTER?: AgentModelConfig;
  GATE?: AgentModelConfig;
  DEVELOPER?: AgentModelConfig;
}

/**
 * Load default-provider settings from localStorage.
 * Normalises the legacy string format (just provider ID) → AgentModelConfig.
 */
export function loadDefaultProviders(): DefaultProviderSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: Record<string, unknown> = JSON.parse(raw);
    const normalized: DefaultProviderSettings = {};
    for (const role of AGENT_ROLES) {
      const v = parsed[role];
      if (!v) continue;
      // Legacy: stored as bare provider-id string
      normalized[role] = typeof v === "string" ? { provider: v } : (v as AgentModelConfig);
    }
    return normalized;
  } catch {
    return {};
  }
}

/**
 * Save default-provider settings to localStorage.
 */
export function saveDefaultProviders(settings: DefaultProviderSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

interface ProviderOption {
  id: string;
  name: string;
  status?: string;
}

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  providers: ProviderOption[];
}

type SettingsTab = "providers" | "specialists" | "memory";

export function SettingsPanel({ open, onClose, providers }: SettingsPanelProps) {
  const [settings, setSettings] = useState<DefaultProviderSettings>({});
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");
  const [memoryStats, setMemoryStats] = useState<MemoryResponse | null>(null);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSettings(loadDefaultProviders());
      if (activeTab === "memory") {
        fetchMemoryData();
      }
    }
  }, [open, activeTab]);

  const fetchMemoryData = useCallback(async () => {
    setMemoryLoading(true);
    try {
      const res = await desktopAwareFetch("/api/memory?history=true");
      if (res.ok) {
        const data = await res.json();
        setMemoryStats(data);
        setCleanupResult(null);
      }
    } catch {
      // Ignore errors
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const triggerCleanup = useCallback(async (aggressive = false) => {
    setMemoryLoading(true);
    try {
      const res = await desktopAwareFetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aggressive }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemoryStats({
          current: data.memoryAfter,
          peaks: data.memoryAfter.peaks || { heapUsedMB: 0, rssMB: 0 },
          growthRateMBPerMinute: 0,
          sessionStore: data.sessionStoreAfter,
          recommendations: [],
        });
        setCleanupResult(
          `Cleaned up: ${data.cleanup.sessionStore.sessionsRemoved} sessions removed, ` +
          `GC ${data.cleanup.gc.gcTriggered ? "triggered" : "not available"}`
        );
        // Clear success message after 3 seconds
        setTimeout(() => setCleanupResult(null), 3000);
      }
    } finally {
      setMemoryLoading(false);
    }
  }, []);

  const handleChange = useCallback(
    (role: AgentRoleKey, field: "provider" | "model", value: string) => {
      const current: AgentModelConfig = settings[role] ?? {};
      const updated: AgentModelConfig = { ...current, [field]: value || undefined };
      // Remove key entirely if both fields are empty
      const isEmpty = !updated.provider && !updated.model;
      const next: DefaultProviderSettings = { ...settings, [role]: isEmpty ? undefined : updated };
      setSettings(next);
      saveDefaultProviders(next);
    },
    [settings],
  );

  if (!open) return null;

  const availableProviders = providers.filter((p) => p.status === "available");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-[#1a1d2e] rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden border border-gray-200 dark:border-gray-700" style={{maxHeight: '90vh'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab("providers")}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "providers"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Providers
          </button>
          <button
            onClick={() => setActiveTab("specialists")}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "specialists"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Specialists
          </button>
          <button
            onClick={() => setActiveTab("memory")}
            className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === "memory"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Memory
          </button>
        </div>

        {/* Body */}
        {activeTab === "providers" ? (
          <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{maxHeight: 'calc(90vh - 140px)'}}>
            <div>
              {/* Column headers */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-[90px]" />
                <div className="w-[160px] text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Provider</div>
                <div className="flex-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Model override</div>
              </div>
              <div className="space-y-2.5">
                {AGENT_ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-3">
                    <div className="w-[90px] shrink-0">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{role}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">{ROLE_DESCRIPTIONS[role]}</div>
                    </div>
                    {/* Provider select */}
                    <select
                      value={settings[role]?.provider ?? ""}
                      onChange={(e) => handleChange(role, "provider", e.target.value)}
                      className="w-[160px] shrink-0 text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Auto</option>
                      {availableProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    {/* Model text input */}
                    <input
                      type="text"
                      value={settings[role]?.model ?? ""}
                      onChange={(e) => handleChange(role, "model", e.target.value)}
                      placeholder="e.g. claude-3-5-haiku-20241022"
                      className="flex-1 text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            {availableProviders.length === 0 && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                No providers available. Connect to load providers.
              </p>
            )}

            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              Leave model blank to use the provider&apos;s default. Example: set CRAFTER to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">claude-3-5-haiku-20241022</code> for low-cost tasks.
            </p>
          </div>
        ) : activeTab === "specialists" ? (
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Agent Specialists
              </h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                Manage custom agent configurations
              </p>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
              Configure custom specialists for different agent roles. Changes are stored in the database and shared across all sessions.
            </p>
            <button
              onClick={() => {
                // Open specialist manager in a separate modal
                const event = new CustomEvent('open-specialist-manager');
                window.dispatchEvent(event);
              }}
              className="w-full px-3 py-2 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              Manage Specialists
            </button>
          </div>
        ) : (
          // Memory tab
          <div className="px-5 py-4 space-y-4 max-h-96 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Memory Monitor
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchMemoryData}
                  disabled={memoryLoading}
                  className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <svg className={`w-3.5 h-3.5 ${memoryLoading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {memoryStats ? (
              <>
                {/* Memory Level Indicator */}
                <div className={`p-3 rounded-lg border ${
                  memoryStats.current.level === "critical"
                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : memoryStats.current.level === "warning"
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
                    : "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        memoryStats.current.level === "critical"
                          ? "bg-red-500"
                          : memoryStats.current.level === "warning"
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`} />
                      <span className={`text-xs font-medium ${
                        memoryStats.current.level === "critical"
                          ? "text-red-700 dark:text-red-400"
                          : memoryStats.current.level === "warning"
                          ? "text-yellow-700 dark:text-yellow-400"
                          : "text-green-700 dark:text-green-400"
                      }`}>
                        {memoryStats.current.level.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {memoryStats.current.heapUsedMB} / {memoryStats.current.heapTotalMB} MB
                    </span>
                  </div>
                  {/* Memory bar */}
                  <div className="mt-2 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        memoryStats.current.level === "critical"
                          ? "bg-red-500"
                          : memoryStats.current.level === "warning"
                          ? "bg-yellow-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${memoryStats.current.usagePercentage}%` }}
                    />
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Heap Used</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memoryStats.current.heapUsedMB} MB</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">RSS</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memoryStats.current.rssMB} MB</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">Sessions</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memoryStats.sessionStore.sessionCount}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 uppercase">SSE Conns</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{memoryStats.sessionStore.activeSseCount}</div>
                  </div>
                </div>

                {/* Session Store Details */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400">Total Messages</span>
                    <span className="text-gray-900 dark:text-gray-100">{memoryStats.sessionStore.totalHistoryMessages}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400">Stale Sessions</span>
                    <span className="text-gray-900 dark:text-gray-100">{memoryStats.sessionStore.staleSessionCount}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400">Growth Rate</span>
                    <span className={memoryStats.growthRateMBPerMinute > 50 ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-gray-100"}>
                      {memoryStats.growthRateMBPerMinute > 0 ? `+${memoryStats.growthRateMBPerMinute}` : "0"} MB/min
                    </span>
                  </div>
                </div>

                {/* Recommendations */}
                {memoryStats.recommendations.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <div className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 uppercase mb-1.5">Recommendations</div>
                    <ul className="space-y-1">
                      {memoryStats.recommendations.map((rec, i) => (
                        <li key={i} className="text-[11px] text-blue-600 dark:text-blue-300">
                          • {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Cleanup Result */}
                {cleanupResult && (
                  <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-[11px] text-green-700 dark:text-green-300">{cleanupResult}</span>
                    </div>
                  </div>
                )}

                {/* Cleanup Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => triggerCleanup(false)}
                    disabled={memoryLoading}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Cleanup
                  </button>
                  <button
                    onClick={() => triggerCleanup(true)}
                    disabled={memoryLoading}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Aggressive
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {memoryLoading ? "Loading..." : "Click refresh to load memory stats"}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* Specialist Manager Modal */}
      <SpecialistManager
        open={false}
        onClose={() => {}}
      />
    </div>
  );
}
