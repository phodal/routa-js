import type { Meta, StoryObj } from "@storybook/react";

import { WorkspaceTabBar } from "./workspace-tab-bar";

const meta = {
  title: "Desktop Shell/WorkspaceTabBar",
  component: WorkspaceTabBar,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "padded",
  },
  argTypes: {
    onTabChange: { action: "tab-changed" },
  },
  args: {
    activeTab: "overview",
    notesCount: 4,
    activityCount: 2,
  },
} satisfies Meta<typeof WorkspaceTabBar>;

export default meta;

type Story = StoryObj<typeof meta>;

export const OverviewActive: Story = {};

export const NotesActive: Story = {
  args: {
    activeTab: "notes",
  },
};

export const ActivityActive: Story = {
  args: {
    activeTab: "activity",
  },
};

export const ZeroCounts: Story = {
  args: {
    notesCount: 0,
    activityCount: 0,
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const button = canvasElement.querySelector("button");
    if (button instanceof HTMLElement) {
      button.focus();
    }
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
