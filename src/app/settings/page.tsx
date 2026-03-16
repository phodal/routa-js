"use client";

/**
 * Settings Page - /settings
 *
 * Provides a full-page UI for all Routa settings:
 * - Providers (default agent providers and model configurations)
 * - Specialists (custom agent configurations)
 * - Models (custom model definitions with aliases)
 * - Memory (memory monitoring and cleanup)
 * - MCP Servers (Model Context Protocol server management)
 * - Webhooks (GitHub webhook triggers)
 * - Schedules (cron-based scheduled triggers)
 *
 * This page wraps the SettingsPanel component in a full-page layout.
 * The SettingsPanel is designed as a modal, so we render it always open
 * and redirect to home when closed.
 */

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SettingsPanel } from "@/client/components/settings-panel";

interface ProviderOption {
  id: string;
  name: string;
  status?: string;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  // Fetch providers on mount
  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch("/api/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders(data.providers ?? []);
        }
      } catch (error) {
        console.error("Failed to fetch providers:", error);
      }
    };
    fetchProviders();
  }, []);

  // When the panel is closed, navigate back to home
  const handleClose = () => {
    const from = searchParams.get("from");
    if (from && from !== "/settings") {
      router.push(from);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  return (
    <div className="desktop-theme h-screen flex flex-col bg-[var(--dt-bg-primary)]">
      {/* Render SettingsPanel as always open */}
      <SettingsPanel
        open={true}
        onClose={handleClose}
        providers={providers}
      />
    </div>
  );
}
