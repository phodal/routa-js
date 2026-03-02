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
import { useRouter } from "next/navigation";
import { SettingsPanel } from "@/client/components/settings-panel";

interface ProviderOption {
  id: string;
  name: string;
  status?: string;
}

export default function SettingsPage() {
  const router = useRouter();
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
    router.push("/");
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-[#0f1117]">
      {/* Render SettingsPanel as always open */}
      <SettingsPanel
        open={true}
        onClose={handleClose}
        providers={providers}
      />
    </div>
  );
}

