"use client";

import { useState, useEffect, useCallback } from "react";
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

export interface DefaultProviderSettings {
  ROUTA?: string;
  CRAFTER?: string;
  GATE?: string;
  DEVELOPER?: string;
}

/**
 * Load default-provider settings from localStorage.
 */
export function loadDefaultProviders(): DefaultProviderSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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

type SettingsTab = "providers" | "specialists";

export function SettingsPanel({ open, onClose, providers }: SettingsPanelProps) {
  const [settings, setSettings] = useState<DefaultProviderSettings>({});
  const [activeTab, setActiveTab] = useState<SettingsTab>("providers");

  useEffect(() => {
    if (open) {
      setSettings(loadDefaultProviders());
    }
  }, [open]);

  const handleChange = useCallback(
    (role: AgentRoleKey, value: string) => {
      const next = { ...settings, [role]: value || undefined };
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
      <div className="relative bg-white dark:bg-[#1a1d2e] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-gray-200 dark:border-gray-700">
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
        </div>

        {/* Body */}
        {activeTab === "providers" ? (
          <div className="px-5 py-4 space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                Default Provider per Agent Type
              </h3>
              <div className="space-y-3">
                {AGENT_ROLES.map((role) => (
                  <div key={role} className="flex items-center gap-3">
                    <div className="min-w-[110px]">
                      <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{role}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500">{ROLE_DESCRIPTIONS[role]}</div>
                    </div>
                    <select
                      value={settings[role] ?? ""}
                      onChange={(e) => handleChange(role, e.target.value)}
                      className="flex-1 text-xs px-2 py-1.5 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1e2130] text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Auto (system default)</option>
                      {availableProviders.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {availableProviders.length === 0 && (
              <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                No providers available. Connect to load providers.
              </p>
            )}
          </div>
        ) : (
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
