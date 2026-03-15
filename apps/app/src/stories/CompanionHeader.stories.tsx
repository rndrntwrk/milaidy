import type { UiLanguage } from "@milady/app-core/i18n";
import type { UiTheme } from "@milady/app-core/state";
import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { CompanionHeader } from "../components/companion/CompanionHeader";

const meta = {
  title: "Companion/CompanionHeader",
  component: CompanionHeader,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    name: "Eliza",
    agentState: "idle",
    stateColor: "text-ok border-ok",
    lifecycleBusy: false,
    restartBusy: false,

    handleRestart: fn(),
    miladyCloudEnabled: true,
    miladyCloudConnected: false,
    miladyCloudCredits: 100,
    creditColor: "text-ok border-ok",
    miladyCloudTopUpUrl:
      "https://www.miladycloud.ai/dashboard/settings?tab=billing",
    evmShort: "0x12...34ab",
    solShort: null,
    handleSwitchToNativeShell: fn(),
    uiLanguage: "en-US" as UiLanguage,
    setUiLanguage: fn(),
    uiTheme: "dark" as UiTheme,
    setUiTheme: fn(),
    t: (key: string) => key,
  },
} satisfies Meta<typeof CompanionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DefaultRunning: Story = {};

export const Thinking: Story = {
  args: {
    agentState: "thinking",
    stateColor: "bg-blue-500",
    miladyCloudEnabled: true,
    miladyCloudConnected: true,
    miladyCloudCredits: 100,
    miladyCloudTopUpUrl:
      "https://www.miladycloud.ai/dashboard/settings?tab=billing",
  },
};

export const DisconnectedWithoutCredits: Story = {
  args: {
    miladyCloudConnected: false,
    miladyCloudCredits: null,
  },
};

export const MobileView: Story = {
  parameters: {
    viewport: {
      defaultViewport: "iphonex",
    },
  },
};

export const TabletView: Story = {
  parameters: {
    viewport: {
      defaultViewport: "ipad",
    },
  },
};
