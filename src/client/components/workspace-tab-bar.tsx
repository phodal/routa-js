"use client";

import React from "react";

export type WorkspaceOverviewTab = "overview" | "notes" | "activity";

interface WorkspaceTabBarProps {
  activeTab: WorkspaceOverviewTab;
  notesCount: number;
  activityCount: number;
  onTabChange: (tab: WorkspaceOverviewTab) => void;
  className?: string;
}

export function WorkspaceTabBar({
  activeTab,
  notesCount,
  activityCount,
  onTabChange,
  className,
}: WorkspaceTabBarProps) {
  return (
    <div
      className={`flex items-center gap-0 border-b border-desktop-border ${className ?? ""}`.trim()}
      data-testid="workspace-tab-bar"
    >
      <WorkspaceTabButton active={activeTab === "overview"} onClick={() => onTabChange("overview")}>
        Overview
      </WorkspaceTabButton>
      <WorkspaceTabButton active={activeTab === "notes"} onClick={() => onTabChange("notes")}>
        Notes {notesCount > 0 && <span className="ml-1 text-[10px] opacity-60" data-testid="workspace-tab-count">({notesCount})</span>}
      </WorkspaceTabButton>
      <WorkspaceTabButton active={activeTab === "activity"} onClick={() => onTabChange("activity")}>
        Activity {activityCount > 0 && <span className="ml-1 text-[10px] opacity-60" data-testid="workspace-tab-count">({activityCount})</span>}
      </WorkspaceTabButton>
    </div>
  );
}

function WorkspaceTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "border-b-2 border-b-desktop-accent bg-desktop-bg-active text-desktop-accent"
          : "text-desktop-text-secondary hover:bg-desktop-bg-active/70 hover:text-desktop-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
