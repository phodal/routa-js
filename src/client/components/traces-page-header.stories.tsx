import type { Meta, StoryObj } from "@storybook/react";

import { TracesPageHeader } from "./traces-page-header";

const meta = {
  title: "Desktop Shell/TracesPageHeader",
  component: TracesPageHeader,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "padded",
  },
  argTypes: {
    onCopyCurrentUrl: { action: "copy-link" },
    onToggleSidebar: { action: "toggle-sidebar" },
    onRefresh: { action: "refresh" },
  },
  args: {
    selectedSessionId: "session-12345678-abcdef",
    showSidebar: true,
    loading: false,
  },
} satisfies Meta<typeof TracesPageHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoSessionSelected: Story = {
  args: {
    selectedSessionId: null,
  },
};

export const SidebarHidden: Story = {
  args: {
    showSidebar: false,
  },
};

export const RefreshLoading: Story = {
  args: {
    loading: true,
  },
};

export const FocusState: Story = {
  play: async ({ canvasElement }) => {
    const copyButton = canvasElement.querySelector('button[title="Copy shareable URL"]');
    if (copyButton instanceof HTMLElement) {
      copyButton.focus();
    }
  },
};

export const DarkMode: Story = {
  globals: {
    colorMode: "dark",
  },
};
