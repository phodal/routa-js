import type { Meta, StoryObj } from "@storybook/react";

import { TracesViewTabs } from "./traces-view-tabs";

const meta = {
  title: "Desktop Shell/TracesViewTabs",
  component: TracesViewTabs,
  tags: ["autodocs"],
  parameters: {
    desktopTheme: true,
    layout: "padded",
  },
  argTypes: {
    onTabChange: { action: "tab-changed" },
  },
  args: {
    activeTab: "chat",
  },
} satisfies Meta<typeof TracesViewTabs>;

export default meta;

type Story = StoryObj<typeof meta>;

export const ChatActive: Story = {};

export const TraceActive: Story = {
  args: {
    activeTab: "event-bridge",
  },
};

export const AgUiActive: Story = {
  args: {
    activeTab: "ag-ui",
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
  args: {
    activeTab: "event-bridge",
  },
};
