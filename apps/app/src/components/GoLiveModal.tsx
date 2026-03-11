import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp, type GoLiveLaunchMode } from "../AppContext.js";
import { client } from "../api-client.js";
import { configRenderModeForTheme } from "./shared/configRenderMode.js";
import {
  buildStream555StatusSummary,
  isStream555PrimaryPlugin,
  STREAM555_DESTINATION_SPECS,
} from "./PluginOperatorPanels.js";
import { paramsToSchema } from "./PluginsView.js";
import { ConfigRenderer, defaultRegistry } from "./config-renderer.js";
import { SelectablePillGrid } from "./SelectablePillGrid.js";
import { Stream555ChannelIcon } from "./Stream555ChannelIcon.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Dialog } from "./ui/Dialog.js";
import {
  BroadcastIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectionIcon,
  PlayIcon,
  SparkIcon,
  VideoIcon,
} from "./ui/Icons.js";

type GoLiveStep =
  | "setup-required"
  | "channel-selection"
  | "segment-selection"
  | "review-and-launch";

const GO_LIVE_SETUP_KEYS = new Set([
  "STREAM555_AGENT_API_KEY",
  "STREAM555_AGENT_TOKEN",
  "STREAM_API_BEARER_TOKEN",
]);

function serializeConfigValue(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const joined = value.map((entry) => String(entry)).join(", ").trim();
    return joined.length > 0 ? joined : null;
  }
  return null;
}

function layoutModeForLaunchMode(mode: GoLiveLaunchMode) {
  return mode === "screen-share" || mode === "play-games"
    ? "camera-hold"
    : "camera-full";
}

function labelForLaunchMode(mode: GoLiveLaunchMode) {
  switch (mode) {
    case "camera":
      return "Camera";
    case "radio":
      return "Lo-fi Radio";
    case "screen-share":
      return "Screen Share";
    case "play-games":
      return "Play Games";
    case "reaction":
      return "Reaction";
    default:
      return "Camera";
  }
}

export function GoLiveModal() {
  const {
    currentTheme,
    goLiveModalOpen,
    closeGoLiveModal,
    launchGoLive,
    plugins,
    loadPlugins,
    handlePluginConfigSave,
    pluginSaving,
  } = useApp();

  const [step, setStep] = useState<GoLiveStep>("setup-required");
  const [launchMode, setLaunchMode] = useState<GoLiveLaunchMode>("camera");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [draftConfig, setDraftConfig] = useState<Record<string, unknown>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{
    tone: "success" | "warning" | "error";
    message: string;
  } | null>(null);

  const streamPlugin = useMemo(
    () => plugins.find((plugin) => isStream555PrimaryPlugin(plugin.id)) ?? null,
    [plugins],
  );
  const summary = useMemo(
    () => buildStream555StatusSummary(streamPlugin?.parameters ?? []),
    [streamPlugin?.parameters],
  );
  const setupRequired =
    !streamPlugin ||
    summary.authState !== "connected" ||
    summary.readyDestinations === 0;
  const configRenderMode = configRenderModeForTheme(currentTheme);

  const setupParams = useMemo(() => {
    if (!streamPlugin) return [];
    const destinationKeys = new Set(
      STREAM555_DESTINATION_SPECS.flatMap((spec) => [
        spec.enabledKey,
        spec.streamKeyKey,
        spec.urlKey,
      ]),
    );
    return (streamPlugin.parameters ?? []).filter(
      (param) => GO_LIVE_SETUP_KEYS.has(param.key) || destinationKeys.has(param.key),
    );
  }, [streamPlugin]);

  const initialValues = useMemo(() => {
    const values: Record<string, unknown> = {};
    for (const param of setupParams) {
      if (param.currentValue != null && String(param.currentValue).trim().length > 0) {
        values[param.key] = param.currentValue;
        continue;
      }
      if (param.default != null && String(param.default).trim().length > 0) {
        values[param.key] = param.default;
      }
    }
    return values;
  }, [setupParams]);

  const mergedValues = useMemo(
    () => ({ ...initialValues, ...draftConfig }),
    [draftConfig, initialValues],
  );

  const setKeys = useMemo(
    () => new Set(setupParams.filter((param) => param.isSet).map((param) => param.key)),
    [setupParams],
  );

  const { schema, hints } = useMemo(() => {
    if (!streamPlugin || setupParams.length === 0) {
      return { schema: null, hints: {} as Record<string, unknown> };
    }
    const generated = paramsToSchema(setupParams, streamPlugin.id);
    if (streamPlugin.configUiHints) {
      for (const [key, serverHint] of Object.entries(streamPlugin.configUiHints)) {
        generated.hints[key] = { ...generated.hints[key], ...serverHint };
      }
    }
    return generated;
  }, [setupParams, streamPlugin]);

  const readyChannels = useMemo(
    () =>
      summary.destinations.filter((destination) => destination.enabled && destination.streamKeySet),
    [summary.destinations],
  );

  useEffect(() => {
    if (!goLiveModalOpen) return;
    setLaunchMode("camera");
    setInlineNotice(null);
    setDraftConfig({});
    const defaultChannels = readyChannels.map((destination) => destination.id);
    setSelectedChannels(defaultChannels);
    setStep(setupRequired ? "setup-required" : "channel-selection");
  }, [goLiveModalOpen, readyChannels, setupRequired]);

  const executeStreamSetupAction = useCallback(
    async (
      key: string,
      toolName: string,
      params: Record<string, unknown>,
      successMessage: string,
      errorMessage: string,
    ) => {
      if (busyAction) return false;
      setBusyAction(key);
      setInlineNotice(null);
      try {
        const response = await client.executeAutonomyPlan({
          plan: {
            id: `go-live-modal-${toolName.toLowerCase()}`,
            steps: [{ id: "1", toolName, params }],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        });
        const stepResult = response.results?.[0] as
          | { success?: boolean; result?: { message?: string }; error?: string }
          | undefined;
        const success = stepResult?.success === true;
        const message =
          stepResult?.result?.message ||
          stepResult?.error ||
          (success ? successMessage : errorMessage);
        setInlineNotice({
          tone: success ? "success" : "error",
          message,
        });
        await loadPlugins();
        return success;
      } catch (err) {
        setInlineNotice({
          tone: "error",
          message: err instanceof Error ? err.message : errorMessage,
        });
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, loadPlugins],
  );

  const handleSaveSetup = useCallback(async () => {
    if (!streamPlugin) return;
    const patch: Record<string, string> = {};
    for (const param of setupParams) {
      const serialized = serializeConfigValue(mergedValues[param.key]);
      if (serialized !== null) {
        patch[param.key] = serialized;
      }
    }
    if (Object.keys(patch).length === 0) {
      setInlineNotice({
        tone: "warning",
        message: "Add or update at least one configuration value before saving.",
      });
      return;
    }
    try {
      await handlePluginConfigSave(streamPlugin.id, patch);
      await loadPlugins();
      setInlineNotice({
        tone: "success",
        message: "555 Stream configuration saved. Refreshing readiness…",
      });
    } catch (err) {
      setInlineNotice({
        tone: "error",
        message: err instanceof Error ? err.message : "Failed to save 555 Stream configuration.",
      });
    }
  }, [handlePluginConfigSave, loadPlugins, mergedValues, setupParams, streamPlugin]);

  const handleContinueFromSetup = useCallback(async () => {
    try {
      const refreshed = await client.getPlugins();
      await loadPlugins();
      const refreshedPlugin =
        refreshed.plugins.find((plugin) => isStream555PrimaryPlugin(plugin.id)) ?? null;
      if (!refreshedPlugin) {
        setInlineNotice({
          tone: "error",
          message: "555 Stream is unavailable on this runtime.",
        });
        return;
      }
      const refreshedSummary = buildStream555StatusSummary(
        refreshedPlugin.parameters ?? [],
      );
      if (
        refreshedSummary.authState !== "connected" ||
        refreshedSummary.readyDestinations === 0
      ) {
        setInlineNotice({
          tone: "warning",
          message:
            "Authenticate and enable at least one ready destination before continuing.",
        });
        return;
      }
      setStep("channel-selection");
    } catch (err) {
      setInlineNotice({
        tone: "error",
        message:
          err instanceof Error
            ? err.message
            : "Failed to refresh 555 Stream readiness.",
      });
    }
  }, [loadPlugins]);

  const channelOptions = useMemo(
    () =>
      summary.destinations
        .filter((destination) => destination.enabled || destination.streamKeySet)
        .map((destination) => ({
          ...destination,
          selectable: destination.enabled && destination.streamKeySet,
        })),
    [summary.destinations],
  );

  const handleToggleChannel = useCallback((channelId: string) => {
    setSelectedChannels((current) =>
      current.includes(channelId)
        ? current.filter((entry) => entry !== channelId)
        : [...current, channelId],
    );
  }, []);

  const handleLaunch = useCallback(async () => {
    const resolvedLayoutMode = layoutModeForLaunchMode(launchMode);
    if (selectedChannels.length === 0) {
      setInlineNotice({
        tone: "warning",
        message: "Select at least one ready channel for this launch.",
      });
      return;
    }
    setLaunching(true);
    setInlineNotice(null);
    try {
      const result = await launchGoLive({
        channels: selectedChannels,
        launchMode,
        layoutMode: resolvedLayoutMode,
      });
      if (!result.ok) {
        setInlineNotice({
          tone: result.tone,
          message: result.message,
        });
      }
    } finally {
      setLaunching(false);
    }
  }, [launchGoLive, launchMode, selectedChannels]);

  const modeOptions = useMemo(
    () => [
      {
        value: "camera" as const,
        label: "Camera",
        description: "Alice on stage with the cleanest live launch.",
      },
      {
        value: "radio" as const,
        label: "Lo-fi Radio",
        description: "Live audio-first session with ambient programming mood.",
      },
      {
        value: "screen-share" as const,
        label: "Screen Share",
        description: "Broadcast the operator surface with Alice in hold.",
      },
      {
        value: "play-games" as const,
        label: "Play Games",
        description: "Launch gameplay and route it to the stream with Alice in hold.",
      },
      {
        value: "reaction" as const,
        label: "Reaction",
        description: "Start live with reaction orchestration ready.",
      },
    ],
    [],
  );

  const reviewRows = useMemo(
    () => [
      {
        label: "Launch mode",
        value: labelForLaunchMode(launchMode),
      },
      {
        label: "Channels",
        value:
          channelOptions
            .filter((channel) => selectedChannels.includes(channel.id))
            .map((channel) => channel.label)
            .join(", ") || "None selected",
      },
      {
        label: "Alice layout",
        value:
          layoutModeForLaunchMode(launchMode) === "camera-hold"
            ? "Camera hold"
            : "Camera full",
      },
    ],
    [channelOptions, launchMode, selectedChannels],
  );

  const renderSetupState = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="rounded-[24px] border-white/10 bg-white/[0.04] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Auth</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {summary.authState === "connected"
              ? "Connected"
              : summary.authState === "wallet_enabled"
                ? "Wallet auth ready"
                : "Authentication required"}
          </div>
          <div className="mt-1 text-sm text-white/58">{summary.authMode}</div>
        </Card>
        <Card className="rounded-[24px] border-white/10 bg-white/[0.04] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Ready channels</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {summary.readyDestinations}/{summary.enabledDestinations || summary.destinations.length}
          </div>
          <div className="mt-1 text-sm text-white/58">
            {summary.savedDestinations} destination keys saved
          </div>
        </Card>
        <Card className="rounded-[24px] border-white/10 bg-white/[0.04] p-4">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">Preferred chain</div>
          <div className="mt-2 text-lg font-semibold text-white">
            {summary.preferredChain === "evm" ? "Ethereum fallback" : "Solana"}
          </div>
          <div className="mt-1 text-sm text-white/58">
            {summary.walletProvisionAllowed ? "Provision allowed" : "Provision disabled"}
          </div>
        </Card>
      </div>

      <Card className="rounded-[28px] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Setup Required</Badge>
          {streamPlugin ? <Badge variant="outline">{streamPlugin.name}</Badge> : null}
        </div>
        <div className="mt-3 text-sm leading-relaxed text-white/68">
          Configure authentication and at least one ready destination here. You do not need to leave the stage to finish Stream555 onboarding.
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-full"
            disabled={Boolean(busyAction)}
            onClick={() =>
              void executeStreamSetupAction(
                "wallet-login",
                "STREAM555_AUTH_WALLET_LOGIN",
                {},
                "Wallet authentication completed.",
                "Wallet authentication failed.",
              )
            }
          >
            <ConnectionIcon className="h-3.5 w-3.5" />
            {busyAction === "wallet-login" ? "Authenticating..." : "Authenticate"}
          </Button>
          {summary.walletProvisionAllowed ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={Boolean(busyAction)}
              onClick={() =>
                void executeStreamSetupAction(
                  "wallet-provision",
                  "STREAM555_AUTH_WALLET_PROVISION_LINKED",
                  { targetChain: summary.preferredChain },
                  `Linked wallet provisioned for ${summary.preferredChain}.`,
                  "Linked wallet provisioning failed.",
                )
              }
            >
              {busyAction === "wallet-provision" ? "Provisioning..." : "Provision via sw4p"}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={Boolean(busyAction)}
            onClick={() => void loadPlugins()}
          >
            Refresh status
          </Button>
        </div>

        {inlineNotice ? (
          <div
            className={`mt-4 rounded-[20px] border px-4 py-3 text-sm ${
              inlineNotice.tone === "success"
                ? "border-ok/25 bg-ok/10 text-ok"
                : inlineNotice.tone === "warning"
                  ? "border-warn/25 bg-warn/10 text-warn"
                  : "border-danger/25 bg-danger/10 text-danger"
            }`}
          >
            {inlineNotice.message}
          </div>
        ) : null}

        {schema ? (
          <div className="mt-5 rounded-[24px] border border-white/8 bg-black/24 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/42">
                  Configure Now
                </div>
                <div className="mt-1 text-sm text-white/62">
                  Save only the onboarding fields needed for auth and channel readiness.
                </div>
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-full"
                disabled={!streamPlugin || pluginSaving.has(streamPlugin.id)}
                onClick={() => void handleSaveSetup()}
              >
                {streamPlugin && pluginSaving.has(streamPlugin.id) ? "Saving..." : "Save setup"}
              </Button>
            </div>
            <ConfigRenderer
              schema={schema}
              hints={hints}
              values={mergedValues}
              setKeys={setKeys}
              registry={defaultRegistry}
              pluginId={streamPlugin?.id}
              onChange={(key, value) =>
                setDraftConfig((current) => ({ ...current, [key]: value }))
              }
              renderMode={configRenderMode}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );

  const renderChannelSelectionState = () => (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {channelOptions.map((channel) => {
          const active = selectedChannels.includes(channel.id);
          return (
            <button
              key={channel.id}
              type="button"
              disabled={!channel.selectable}
              onClick={() => handleToggleChannel(channel.id)}
              className={`rounded-[24px] border px-4 py-4 text-left transition ${
                active
                  ? "border-accent/30 bg-accent/12 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/74"
              } ${!channel.selectable ? "cursor-not-allowed opacity-55" : "hover:border-white/18 hover:bg-white/[0.06]"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/22">
                    <Stream555ChannelIcon fieldKey={STREAM555_DESTINATION_SPECS.find((spec) => spec.id === channel.id)?.enabledKey ?? ""} />
                  </span>
                  <div>
                    <div className="text-base font-medium text-white">{channel.label}</div>
                    <div className="mt-1 text-sm text-white/54">
                      {channel.selectable
                        ? "Ready for this launch"
                        : channel.enabled
                          ? "Enabled but missing stream key"
                          : "Not enabled for launch"}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full border ${
                    active
                      ? "border-accent/30 bg-accent/18 text-accent"
                      : "border-white/10 bg-black/18 text-white/48"
                  }`}
                >
                  {active ? <CheckIcon className="h-4 w-4" /> : null}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      {inlineNotice ? (
        <div className="rounded-[20px] border border-warn/25 bg-warn/10 px-4 py-3 text-sm text-warn">
          {inlineNotice.message}
        </div>
      ) : null}
    </div>
  );

  const renderSegmentState = () => (
    <div className="space-y-4">
      <SelectablePillGrid
        value={launchMode}
        onChange={setLaunchMode}
        options={modeOptions}
      />
      <Card className="rounded-[24px] border-white/10 bg-white/[0.04] p-4">
        <div className="flex items-center gap-3 text-white">
          {layoutModeForLaunchMode(launchMode) === "camera-hold" ? (
            <VideoIcon className="h-5 w-5 text-accent" />
          ) : (
            <CameraIcon className="h-5 w-5 text-accent" />
          )}
          <div>
            <div className="text-sm font-medium">
              {layoutModeForLaunchMode(launchMode) === "camera-hold"
                ? "Alice camera moves to hold"
                : "Alice stays camera-full"}
            </div>
            <div className="mt-1 text-sm text-white/56">
              {layoutModeForLaunchMode(launchMode) === "camera-hold"
                ? "Game and screen launches keep the hero feed large and move Alice into hold."
                : "Camera-first launches keep Alice as the primary hero frame."}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );

  const renderReviewState = () => (
    <div className="space-y-4">
      <Card className="rounded-[28px] border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/42">
          <BroadcastIcon className="h-4 w-4" />
          Ready to launch
        </div>
        <div className="mt-4 space-y-3">
          {reviewRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 rounded-[20px] border border-white/8 bg-black/20 px-4 py-3"
            >
              <span className="text-sm text-white/56">{row.label}</span>
              <span className="text-sm font-medium text-white">{row.value}</span>
            </div>
          ))}
        </div>
      </Card>
      {inlineNotice ? (
        <div
          className={`rounded-[20px] border px-4 py-3 text-sm ${
            inlineNotice.tone === "success"
              ? "border-ok/25 bg-ok/10 text-ok"
              : inlineNotice.tone === "warning"
                ? "border-warn/25 bg-warn/10 text-warn"
                : "border-danger/25 bg-danger/10 text-danger"
          }`}
        >
          {inlineNotice.message}
        </div>
      ) : null}
    </div>
  );

  if (currentTheme !== "milady-os") return null;

  return (
    <Dialog
      open={goLiveModalOpen}
      onClose={closeGoLiveModal}
      className="max-w-5xl overflow-hidden bg-[#060a11]/96"
      ariaLabel="Go live"
    >
      <div className="milady-drawer-scope max-h-[88dvh] overflow-hidden rounded-[28px]">
        <div className="sticky top-0 z-10 border-b border-white/8 bg-[linear-gradient(180deg,rgba(10,14,22,0.96),rgba(10,14,22,0.88))] px-6 py-5 backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/42">
                <BroadcastIcon className="h-4 w-4" />
                Programming Stream
              </div>
              <div className="mt-2 text-[28px] font-semibold leading-none text-white">
                Go Live
              </div>
              <div className="mt-2 max-w-2xl text-sm leading-relaxed text-white/62">
                Authenticate, choose channels, pick the launch format, and send Alice live without leaving the stage.
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={closeGoLiveModal}
              aria-label="Close go live modal"
            >
              <CloseIcon className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={step === "setup-required" ? "accent" : "outline"}>Setup</Badge>
            <Badge variant={step === "channel-selection" ? "accent" : "outline"}>Channels</Badge>
            <Badge variant={step === "segment-selection" ? "accent" : "outline"}>Mode</Badge>
            <Badge variant={step === "review-and-launch" ? "accent" : "outline"}>Review</Badge>
          </div>
        </div>

        <div className="max-h-[calc(88dvh-11rem)] overflow-y-auto px-6 py-6">
          {step === "setup-required"
            ? renderSetupState()
            : step === "channel-selection"
              ? renderChannelSelectionState()
              : step === "segment-selection"
                ? renderSegmentState()
                : renderReviewState()}
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 bg-[linear-gradient(180deg,rgba(10,14,22,0.8),rgba(10,14,22,0.96))] px-6 py-4 backdrop-blur-2xl">
          <div className="flex items-center gap-2 text-sm text-white/52">
            {streamPlugin ? (
              <>
                <Badge variant={setupRequired ? "warning" : "success"}>
                  {setupRequired ? "Setup required" : "Ready"}
                </Badge>
                <span>{streamPlugin.name}</span>
              </>
            ) : (
              <Badge variant="danger">555 Stream unavailable</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {step !== "setup-required" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() =>
                  setStep((current) =>
                    current === "review-and-launch"
                      ? "segment-selection"
                      : current === "segment-selection"
                        ? "channel-selection"
                        : "setup-required"
                  )
                }
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
                Back
              </Button>
            ) : null}

            {step === "setup-required" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => void handleContinueFromSetup()}
              >
                Continue
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {step === "channel-selection" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-full"
                disabled={selectedChannels.length === 0}
                onClick={() => setStep("segment-selection")}
              >
                Next
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {step === "segment-selection" ? (
              <Button
                type="button"
                variant="default"
                size="sm"
                className="rounded-full"
                onClick={() => setStep("review-and-launch")}
              >
                Review Launch
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </Button>
            ) : null}

            {step === "review-and-launch" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                disabled={
                  launching ||
                  selectedChannels.length === 0 ||
                  !streamPlugin
                }
                onClick={() => void handleLaunch()}
              >
                {launching ? <SparkIcon className="h-3.5 w-3.5 animate-pulse" /> : <PlayIcon className="h-3.5 w-3.5" />}
                {launching ? "Launching..." : "Go Live"}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
