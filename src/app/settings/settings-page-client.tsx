"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { SettingsPanel } from "@/client/components/settings-panel";

interface ProviderOption {
  id: string;
  name: string;
  status?: string;
}

interface SettingsPageClientProps {
  from?: string;
}

export function SettingsPageClient({ from }: SettingsPageClientProps) {
  const router = useRouter();
  const [providers, setProviders] = useState<ProviderOption[]>([]);

  useEffect(() => {
    const fetchProviders = async () => {
      try {
        const res = await fetch("/api/providers");
        if (res.ok) {
          const data = await res.json();
          setProviders(data.providers ?? []);
        }
      } catch {
        setProviders([]);
      }
    };

    void fetchProviders();
  }, []);

  const handleClose = () => {
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
      <SettingsPanel
        open={true}
        onClose={handleClose}
        providers={providers}
      />
    </div>
  );
}
