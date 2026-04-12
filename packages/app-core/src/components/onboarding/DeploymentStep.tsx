/**
 * DeploymentStep — first onboarding step, absorbs the old splash server chooser.
 *
 * Presents three deployment options:
 * 1. Create Local Agent (desktop and development web)
 * 2. Manage Cloud Agents (Eliza Cloud login + agent list + provisioning)
 * 3. Connect to Remote Agent (manual URL entry)
 *
 * Also shows discovered local network gateways.
 */

import { Button, Card, CardContent, Input, Spinner } from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../api";
import type {
  CloudCompatAgent,
  CloudCompatJob,
} from "../../api/client-types-cloud";
import {
  discoverGatewayEndpoints,
  type GatewayDiscoveryEndpoint,
  gatewayEndpointToApiBase,
} from "../../bridge/gateway-discovery";
import { isDesktopPlatform } from "../../platform/init";
import {
  addAgentProfile,
  clearPersistedActiveServer,
  savePersistedActiveServer,
  useApp,
} from "../../state";

const MONO_FONT = "'Courier New', 'Courier', 'Monaco', monospace";

type SubView = "chooser" | "cloud" | "remote";

type CloudStage =
  | "login"
  | "loading"
  | "agent-list"
  | "creating"
  | "provisioning"
  | "connecting";

export function shouldShowLocalDeploymentOption(args: {
  isDesktop: boolean;
  isDevelopment: boolean;
}): boolean {
  return args.isDesktop || args.isDevelopment;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "running":
      return { label: "LIVE", className: "bg-green-600 text-white" };
    case "provisioning":
    case "queued":
      return { label: "STARTING", className: "bg-yellow-500 text-black" };
    case "stopped":
    case "suspended":
      return { label: "STOPPED", className: "bg-black/20 text-black/70" };
    case "failed":
      return { label: "FAILED", className: "bg-red-600 text-white" };
    default:
      return {
        label: status.toUpperCase(),
        className: "bg-black/10 text-black/60",
      };
  }
}

export function DeploymentStep() {
  const {
    setState,
    handleOnboardingNext,
    elizaCloudConnected,
    elizaCloudLoginBusy,
    handleCloudLogin,
    startupCoordinator,
    t,
  } = useApp();

  const [subView, setSubView] = useState<SubView>("chooser");
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveredGateways, setDiscoveredGateways] = useState<
    GatewayDiscoveryEndpoint[]
  >([]);

  // Cloud sub-view state
  const [cloudStage, setCloudStage] = useState<CloudStage>(
    elizaCloudConnected ? "loading" : "login",
  );
  const [agents, setAgents] = useState<CloudCompatAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newAgentName, setNewAgentName] = useState("");
  const [provisionStatus, setProvisionStatus] = useState("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Remote sub-view state
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteToken, setRemoteToken] = useState("");

  const showCreateLocal = shouldShowLocalDeploymentOption({
    isDesktop: isDesktopPlatform(),
    isDevelopment: import.meta.env.DEV,
  });

  // ── Gateway discovery ──────────────────────────────────────────────
  useEffect(() => {
    if (subView !== "chooser") return;
    let cancelled = false;
    setDiscoveryLoading(true);

    discoverGatewayEndpoints()
      .then((endpoints) => {
        if (!cancelled) setDiscoveredGateways(endpoints);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDiscoveryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subView]);

  // ── Cleanup poll on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Cloud: auto-advance from login when connected ──────────────────
  useEffect(() => {
    if (elizaCloudConnected && cloudStage === "login") {
      setCloudStage("loading");
    }
  }, [elizaCloudConnected, cloudStage]);

  // ── Cloud: fetch agents ────────────────────────────────────────────
  useEffect(() => {
    if (subView !== "cloud" || cloudStage !== "loading") return;
    let cancelled = false;

    (async () => {
      try {
        const res = await client.getCloudCompatAgents();
        if (cancelled) return;
        if (res.success) {
          setAgents(res.data);
          setCloudStage("agent-list");
        } else {
          setError("Failed to load agents");
          setCloudStage("agent-list");
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load agents",
        );
        setCloudStage("agent-list");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [subView, cloudStage]);

  // ── Handlers: chooser ──────────────────────────────────────────────

  const handleCreateLocal = useCallback(() => {
    client.setBaseUrl(null);
    client.setToken(null);
    clearPersistedActiveServer();
    setState("onboardingServerTarget", "local");
    // Dispatch SPLASH_CONTINUE to start the local agent runtime
    startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" });
    handleOnboardingNext();
  }, [setState, startupCoordinator, handleOnboardingNext]);

  const handleConnectGateway = useCallback(
    (gateway: GatewayDiscoveryEndpoint) => {
      const apiBase = gatewayEndpointToApiBase(gateway);
      client.setBaseUrl(apiBase);
      client.setToken(null);
      savePersistedActiveServer({
        id: `gateway:${gateway.stableId}`,
        kind: "remote",
        label: gateway.name,
        apiBase,
      });
      addAgentProfile({
        kind: "remote",
        label: gateway.name,
        apiBase,
      });
      setState("onboardingServerTarget", "remote");
      startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" });
      handleOnboardingNext();
    },
    [setState, startupCoordinator, handleOnboardingNext],
  );

  // ── Handlers: cloud ────────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    setError(null);
    await handleCloudLogin();
  }, [handleCloudLogin]);

  const connectToAgent = useCallback(
    (agent: CloudCompatAgent) => {
      setCloudStage("connecting");

      const apiBase = agent.web_ui_url ?? agent.webUiUrl ?? agent.bridge_url;
      savePersistedActiveServer({
        id: `cloud:${agent.agent_id}`,
        kind: "cloud",
        label: agent.agent_name,
        ...(apiBase ? { apiBase } : {}),
      });
      addAgentProfile({
        kind: "cloud",
        label: agent.agent_name,
        cloudAgentId: agent.agent_id,
        apiBase: apiBase ?? undefined,
      });

      if (apiBase) {
        client.setBaseUrl(apiBase);
      }
      setState("onboardingServerTarget", "elizacloud");
      startupCoordinator.dispatch({ type: "SPLASH_CLOUD_SKIP" });
      handleOnboardingNext();
    },
    [setState, startupCoordinator, handleOnboardingNext],
  );

  const handleCreate = useCallback(async () => {
    const name = newAgentName.trim();
    if (!name) return;

    setError(null);
    setCloudStage("creating");

    try {
      const createRes = await client.createCloudCompatAgent({
        agentName: name,
      });
      if (!createRes.success || !createRes.data) {
        setError("Failed to create agent");
        setCloudStage("agent-list");
        return;
      }

      const agentId = createRes.data.agentId;
      if (!agentId) {
        setError("Agent created but no ID returned");
        setCloudStage("agent-list");
        return;
      }

      setCloudStage("provisioning");
      setProvisionStatus("Starting provisioning...");
      const provRes = await client.provisionCloudCompatAgent(agentId);
      const jobId = provRes.data?.jobId;

      if (!jobId) {
        setProvisionStatus("Connecting...");
        const agentRes = await client.getCloudCompatAgent(agentId);
        if (agentRes.success) {
          connectToAgent(agentRes.data);
        } else {
          setError("Provisioning completed but agent not found");
          setCloudStage("agent-list");
        }
        return;
      }

      pollTimerRef.current = setInterval(async () => {
        try {
          const jobRes = await client.getCloudCompatJobStatus(jobId);
          if (!jobRes.success) return;

          const job: CloudCompatJob = jobRes.data;
          if (job.status === "completed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setProvisionStatus("Connecting...");
            const agentRes = await client.getCloudCompatAgent(agentId);
            if (agentRes.success) {
              connectToAgent(agentRes.data);
            } else {
              setError("Agent provisioned but not found");
              setCloudStage("agent-list");
            }
          } else if (job.status === "failed") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
            setError(job.error ?? "Provisioning failed");
            setCloudStage("agent-list");
          } else {
            setProvisionStatus(`Provisioning (${job.status})...`);
          }
        } catch {
          // Transient error — keep polling
        }
      }, 2500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create agent",
      );
      setCloudStage("agent-list");
    }
  }, [newAgentName, connectToAgent]);

  const handleRefresh = useCallback(() => {
    setError(null);
    setCloudStage("loading");
  }, []);

  // ── Handlers: remote ───────────────────────────────────────────────

  const handleRemoteConnect = useCallback(() => {
    const url = remoteUrl.trim();
    if (!url) return;

    client.setBaseUrl(url);
    const token = remoteToken.trim() || undefined;
    client.setToken(token ?? null);
    savePersistedActiveServer({
      id: `remote:${url}`,
      kind: "remote",
      label: url,
      apiBase: url,
      ...(token ? { accessToken: token } : {}),
    });
    addAgentProfile({
      kind: "remote",
      label: url,
      apiBase: url,
    });
    setState("onboardingServerTarget", "remote");
    startupCoordinator.dispatch({ type: "SPLASH_CONTINUE" });
    handleOnboardingNext();
  }, [remoteUrl, remoteToken, setState, startupCoordinator, handleOnboardingNext]);

  // ── Render: chooser ────────────────────────────────────────────────
  if (subView === "chooser") {
    return (
      <StepContainer>
        <StepHeader t={t} />

        <div className="mt-4 flex w-full flex-col gap-3 text-left">
          {/* Discovered gateways */}
          {discoveredGateways.length > 0 && (
            <div className="flex flex-col gap-2">
              {discoveredGateways.map((gateway) => (
                <Card
                  key={gateway.stableId}
                  className="border-2 border-black bg-white shadow-md"
                >
                  <CardContent className="flex items-center justify-between gap-3 px-3 py-3">
                    <div className="min-w-0">
                      <p
                        style={{ fontFamily: MONO_FONT }}
                        className="text-[9px] uppercase text-black/60"
                      >
                        {gateway.isLocal
                          ? t("startupshell.LocalNetworkAgent", {
                              defaultValue: "LAN agent",
                            })
                          : t("startupshell.NetworkAgent", {
                              defaultValue: "Network agent",
                            })}
                      </p>
                      <p className="truncate text-sm font-semibold text-black">
                        {gateway.name}
                      </p>
                      <p className="truncate text-[11px] text-black/70">
                        {gateway.host}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-2 border-black bg-white text-black font-semibold hover:bg-black hover:text-[#ffe600]"
                      onClick={() => handleConnectGateway(gateway)}
                    >
                      {t("startupshell.Connect", { defaultValue: "Connect" })}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Create Local Agent */}
          {showCreateLocal && (
            <Button
              type="button"
              variant="default"
              className="justify-start border-2 border-black bg-black px-3 py-5 text-left text-[#ffe600] font-semibold shadow-md hover:bg-[#ffe600] hover:text-black hover:border-black"
              onClick={handleCreateLocal}
            >
              <span className="flex flex-col items-start gap-1">
                <span
                  style={{ fontFamily: MONO_FONT }}
                  className="text-[9px] uppercase text-[#ffe600]/80"
                >
                  {t("startupshell.CreateAgentLabel", {
                    defaultValue: "New local agent",
                  })}
                </span>
                <span className="text-sm font-bold">
                  {t("startupshell.CreateLocalAgent", {
                    defaultValue: "Create Local Agent",
                  })}
                </span>
              </span>
            </Button>
          )}

          {/* Manage Cloud Agents */}
          <Button
            type="button"
            variant="default"
            className="justify-start border-2 border-black bg-white px-3 py-5 text-left text-black font-semibold shadow-md hover:bg-black hover:text-[#ffe600]"
            onClick={() => setSubView("cloud")}
          >
            <span className="flex flex-col items-start gap-1">
              <span
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] uppercase text-black/60"
              >
                {t("startupshell.ElizaCloudAgent", {
                  defaultValue: "Eliza Cloud",
                })}
              </span>
              <span className="text-sm font-bold">
                {t("startupshell.ManageCloudAgents", {
                  defaultValue: "Manage Cloud Agents",
                })}
              </span>
            </span>
          </Button>

          {/* Connect to Remote */}
          <Button
            type="button"
            variant="default"
            className="justify-start border-2 border-black bg-white px-3 py-5 text-left text-black font-semibold shadow-md hover:bg-black hover:text-[#ffe600]"
            onClick={() => setSubView("remote")}
          >
            <span className="flex flex-col items-start gap-1">
              <span
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] uppercase text-black/60"
              >
                {t("startupshell.RemoteAgentLabel", {
                  defaultValue: "Remote server",
                })}
              </span>
              <span className="text-sm font-bold">
                {t("startupshell.ConnectToRemote", {
                  defaultValue: "Connect to Remote Agent",
                })}
              </span>
            </span>
          </Button>
        </div>
      </StepContainer>
    );
  }

  // ── Render: cloud ──────────────────────────────────────────────────
  if (subView === "cloud") {
    return (
      <StepContainer>
        <StepHeader t={t} />

        {/* Login */}
        {cloudStage === "login" && (
          <div className="mt-4 flex w-full flex-col gap-3 text-left">
            <p
              style={{ fontFamily: MONO_FONT }}
              className="text-[9px] uppercase text-black/60"
            >
              {t("startupshell.CloudLogin", {
                defaultValue: "Sign in to Eliza Cloud",
              })}
            </p>
            <Button
              type="button"
              variant="default"
              className="justify-center border-2 border-black bg-black px-3 py-5 text-[#ffe600] font-semibold shadow-md hover:bg-[#ffe600] hover:text-black"
              onClick={handleLogin}
              disabled={elizaCloudLoginBusy}
            >
              {elizaCloudLoginBusy ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  {t("startupshell.WaitingForAuth", {
                    defaultValue: "Waiting for auth...",
                  })}
                </span>
              ) : (
                t("startupshell.SignInElizaCloud", {
                  defaultValue: "Sign in with Eliza Cloud",
                })
              )}
            </Button>
            {error && (
              <p
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] text-red-700"
              >
                {error}
              </p>
            )}
            <BackButton t={t} onClick={() => setSubView("chooser")} />
          </div>
        )}

        {/* Loading */}
        {cloudStage === "loading" && (
          <div className="mt-4 flex w-full flex-col items-center gap-3">
            <Spinner className="h-6 w-6 text-black/60" />
            <p
              style={{ fontFamily: MONO_FONT }}
              className="text-[9px] uppercase text-black/50"
            >
              {t("startupshell.LoadingAgents", {
                defaultValue: "Loading agents...",
              })}
            </p>
          </div>
        )}

        {/* Creating / Provisioning / Connecting */}
        {(cloudStage === "creating" ||
          cloudStage === "provisioning" ||
          cloudStage === "connecting") && (
          <div className="mt-4 flex w-full flex-col items-center gap-3">
            <Spinner className="h-6 w-6 text-black/60" />
            <p
              style={{ fontFamily: MONO_FONT }}
              className="text-[9px] uppercase text-black/50"
            >
              {cloudStage === "creating"
                ? t("startupshell.CreatingAgent", {
                    defaultValue: "Creating agent...",
                  })
                : cloudStage === "provisioning"
                  ? provisionStatus ||
                    t("startupshell.Provisioning", {
                      defaultValue: "Provisioning...",
                    })
                  : t("startupshell.Connecting", {
                      defaultValue: "Connecting...",
                    })}
            </p>
          </div>
        )}

        {/* Agent list */}
        {cloudStage === "agent-list" && (
          <div className="mt-4 flex w-full flex-col gap-3 text-left">
            <div className="flex items-center justify-between">
              <p
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] uppercase text-black/60"
              >
                {t("startupshell.YourCloudAgents", {
                  defaultValue: "Your cloud agents",
                })}
              </p>
              <button
                type="button"
                onClick={handleRefresh}
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] uppercase text-black/50 hover:text-black underline"
              >
                {t("startupshell.Refresh", { defaultValue: "Refresh" })}
              </button>
            </div>

            {error && (
              <p
                style={{ fontFamily: MONO_FONT }}
                className="text-[9px] text-red-700"
              >
                {error}
              </p>
            )}

            {agents.length > 0 && (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {agents.map((agent) => {
                  const badge = statusBadge(agent.status);
                  return (
                    <Card
                      key={agent.agent_id}
                      className="border-2 border-black bg-white shadow-md"
                    >
                      <CardContent className="flex items-center justify-between gap-3 px-3 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-black">
                              {agent.agent_name}
                            </p>
                            <span
                              className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-bold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          {agent.web_ui_url && (
                            <p
                              style={{ fontFamily: MONO_FONT }}
                              className="truncate text-[9px] text-black/50"
                            >
                              {agent.web_ui_url}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0 border-2 border-black bg-white text-black font-semibold hover:bg-black hover:text-[#ffe600]"
                          onClick={() => connectToAgent(agent)}
                          disabled={agent.status === "failed"}
                        >
                          {t("startupshell.Connect", {
                            defaultValue: "Connect",
                          })}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {agents.length === 0 && !error && (
              <p
                style={{ fontFamily: MONO_FONT }}
                className="text-[10px] text-black/50 text-center py-2"
              >
                {t("startupshell.NoCloudAgents", {
                  defaultValue: "No cloud agents yet",
                })}
              </p>
            )}

            {/* Inline create form */}
            <Card className="border-2 border-dashed border-black/40 bg-white/80">
              <CardContent className="flex items-center gap-2 px-3 py-2.5">
                <Input
                  placeholder={t("startupshell.AgentName", {
                    defaultValue: "Agent name",
                  })}
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  className="h-8 flex-1 border-black/30 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 border-2 border-black bg-black text-[#ffe600] font-semibold hover:bg-[#ffe600] hover:text-black"
                  onClick={handleCreate}
                  disabled={!newAgentName.trim()}
                >
                  {t("startupshell.CreateAgent", { defaultValue: "Create" })}
                </Button>
              </CardContent>
            </Card>

            <BackButton t={t} onClick={() => setSubView("chooser")} />
          </div>
        )}
      </StepContainer>
    );
  }

  // ── Render: remote ─────────────────────────────────────────────────
  return (
    <StepContainer>
      <StepHeader t={t} />

      <div className="mt-4 flex w-full flex-col gap-3 text-left">
        <p
          style={{ fontFamily: MONO_FONT }}
          className="text-[9px] uppercase text-black/60"
        >
          {t("onboarding.deployment.remoteLabel", {
            defaultValue: "Connect to a remote agent",
          })}
        </p>

        <Input
          placeholder={t("onboarding.deployment.remoteUrlPlaceholder", {
            defaultValue: "https://your-agent.example.com",
          })}
          value={remoteUrl}
          onChange={(e) => setRemoteUrl(e.target.value)}
          className="h-10 border-2 border-black/30 text-sm"
        />

        <Input
          placeholder={t("onboarding.deployment.remoteTokenPlaceholder", {
            defaultValue: "Access token (optional)",
          })}
          type="password"
          value={remoteToken}
          onChange={(e) => setRemoteToken(e.target.value)}
          className="h-10 border-2 border-black/30 text-sm"
        />

        <Button
          type="button"
          variant="default"
          className="justify-center border-2 border-black bg-black px-3 py-4 text-[#ffe600] font-semibold shadow-md hover:bg-[#ffe600] hover:text-black"
          onClick={handleRemoteConnect}
          disabled={!remoteUrl.trim()}
        >
          {t("startupshell.Connect", { defaultValue: "Connect" })}
        </Button>

        <BackButton t={t} onClick={() => setSubView("chooser")} />
      </div>
    </StepContainer>
  );
}

// ── Shared layout primitives ───────────────────────────────────────────

function StepContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="w-full max-w-sm px-4 text-center">{children}</div>
    </div>
  );
}

function StepHeader({
  t,
}: { t: (key: string, values?: Record<string, unknown>) => string }) {
  return (
    <div>
      <h2
        style={{ fontFamily: MONO_FONT }}
        className="text-lg font-bold text-black"
      >
        {t("onboarding.deployment.title", {
          defaultValue: "Choose your setup",
        })}
      </h2>
      <p
        style={{ fontFamily: MONO_FONT }}
        className="text-[10px] uppercase text-black/50 mt-1"
      >
        {t("onboarding.deployment.subtitle", {
          defaultValue: "Where should your agent run?",
        })}
      </p>
    </div>
  );
}

function BackButton({
  t,
  onClick,
}: {
  t: (key: string, values?: Record<string, unknown>) => string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ fontFamily: MONO_FONT }}
      className="mt-1 text-[9px] uppercase text-black/50 hover:text-black underline text-center"
    >
      {t("startupshell.Back", { defaultValue: "Back" })}
    </button>
  );
}
