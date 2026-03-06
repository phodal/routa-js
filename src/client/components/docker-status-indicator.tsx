"use client";

import { useCallback, useEffect, useState } from "react";

interface DockerStatusResponse {
  available: boolean;
  daemonRunning: boolean;
  version?: string;
  error?: string;
  checkedAt: string;
  image?: string;
  imageAvailable?: boolean;
}

export function DockerStatusIndicator() {
  const [status, setStatus] = useState<DockerStatusResponse | null>(null);
  const [loading, setLoading] = useState(true); // true on mount = "Checking..."

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/acp/docker/status", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as DockerStatusResponse);
    } catch {
      setStatus({
        available: false,
        daemonRunning: false,
        error: "Docker status check failed",
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const available = !!status?.available;
  const label = loading && !status
    ? "Checking Docker..."
    : available
      ? `Docker ${status?.version ?? "ready"}`
      : "Docker unavailable";

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] border ${
          loading && !status
            ? "border-gray-200 text-gray-500 bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:bg-gray-800/30"
            : available
            ? "border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-800/60 dark:text-emerald-300 dark:bg-emerald-900/20"
            : "border-amber-200 text-amber-700 bg-amber-50 dark:border-amber-800/60 dark:text-amber-300 dark:bg-amber-900/20"
        }`}
        title={status?.error ?? label}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${loading && !status ? "bg-gray-400 animate-pulse" : available ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="max-w-[140px] truncate">{label}</span>
      </span>
      <button
        type="button"
        onClick={() => void refresh()}
        className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#1c1f2e]"
        title="Refresh Docker status"
        disabled={loading}
      >
        {loading ? "..." : "Refresh"}
      </button>
    </div>
  );
}
