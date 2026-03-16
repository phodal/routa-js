"use client";

import { useSyncExternalStore } from "react";

import { DesktopHomePage } from "@/client/components/desktop-home-page";
import { WebHomePage } from "@/client/components/web-home-page";

function detectDesktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "electronAPI" in window;
}

function subscribe(): () => void {
  return () => {};
}

export default function HomePage() {
  const isDesktopRuntime = useSyncExternalStore(subscribe, detectDesktopRuntime, () => false);

  return isDesktopRuntime ? <DesktopHomePage /> : <WebHomePage />;
}
