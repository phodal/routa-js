"use client";

import React from "react";

export type TraceViewTab = "chat" | "event-bridge" | "ag-ui";

interface TracesViewTabsProps {
  activeTab: TraceViewTab;
  onTabChange: (tab: TraceViewTab) => void;
  className?: string;
}

const TAB_DEFINITIONS: Array<{ key: TraceViewTab; label: string; color: string }> = [
  { key: "chat", label: "Chat", color: "bg-desktop-trace-chat" },
  { key: "event-bridge", label: "Trace", color: "bg-desktop-trace-event-bridge" },
  { key: "ag-ui", label: "Trace(AG-UI)", color: "bg-desktop-trace-ag-ui" },
];

export function TracesViewTabs({ activeTab, onTabChange, className }: TracesViewTabsProps) {
  return (
    <div className={className ?? ""}>
      <div
        className="inline-flex items-center rounded-md border border-desktop-border bg-desktop-bg-secondary p-0.5"
        data-testid="traces-view-tabs"
      >
        {TAB_DEFINITIONS.map(({ key, label, color }) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={`px-3 py-1.5 rounded-sm text-[11px] font-semibold tracking-wide transition-all ${
              activeTab === key
                ? `${color} text-desktop-accent-text`
                : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
