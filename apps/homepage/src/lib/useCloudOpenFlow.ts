import { useCallback, useEffect, useRef, useState } from "react";
import type { ManagedAgent } from "./AgentProvider";
import { CloudAgentsNotAvailableError, type CloudClient } from "./cloud-api";
import {
  redirectPopupToCloudAgent,
  renderPopupConnectingState,
  updatePopupMessage,
} from "./open-web-ui";

const PROVISION_TIMEOUT_MS = 180000;

export type CloudOpenState = "idle" | "preparing";
export type NoticeTone = "success" | "error" | "info";

export interface Notice {
  tone: NoticeTone;
  text: string;
}

interface CloudOpenFlowOptions {
  agents: ManagedAgent[];
  cloudClient: CloudClient | null;
  isAuthenticated: boolean;
  loginError: string | null;
  loginState: string;
  refresh: () => Promise<void>;
  setNotice: (notice: Notice | null) => void;
  signIn: () => Promise<void> | void;
}

interface CloudAgentCandidate {
  cloudAgentId: string;
  name: string;
  status: string;
}

function generateCloudAgentName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  const suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `milady-${suffix}`;
}

export function useCloudOpenFlow({
  agents,
  cloudClient,
  isAuthenticated,
  loginError,
  loginState,
  refresh,
  setNotice,
  signIn,
}: CloudOpenFlowOptions) {
  const [cloudOpenState, setCloudOpenState] = useState<CloudOpenState>("idle");
  const cloudPopupRef = useRef<Window | null>(null);
  const pendingCloudOpenRef = useRef(false);
  const cloudOpenTimeoutRef = useRef<number | null>(null);

  const closeCloudPopup = useCallback(() => {
    const popup = cloudPopupRef.current;
    cloudPopupRef.current = null;
    if (cloudOpenTimeoutRef.current !== null) {
      window.clearTimeout(cloudOpenTimeoutRef.current);
      cloudOpenTimeoutRef.current = null;
    }
    if (popup && !popup.closed) popup.close();
  }, []);

  const continueCloudOpen = useCallback(async () => {
    const popup = cloudPopupRef.current;
    if (!popup || popup.closed) {
      setCloudOpenState("idle");
      return;
    }
    if (!cloudClient) {
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: "cloud client not ready, try again.",
      });
      return;
    }

    try {
      let cloudAgentId: string | undefined;

      let cloudAgents: CloudAgentCandidate[] = agents
        .filter((agent) => agent.source === "cloud" && agent.cloudAgentId)
        .map((agent) => ({
          cloudAgentId: agent.cloudAgentId ?? "",
          name: agent.name,
          status: agent.status,
        }));
      if (cloudAgents.length === 0) {
        cloudAgents = (await cloudClient.listAgents()).map((agent) => ({
          cloudAgentId: agent.id,
          name: agent.name,
          status: agent.status,
        }));
      }
      const existingCloud =
        cloudAgents.find((agent) => agent.status === "running") ??
        cloudAgents.find((agent) => agent.status === "paused") ??
        null;
      if (existingCloud?.cloudAgentId) {
        cloudAgentId = existingCloud.cloudAgentId;
        updatePopupMessage(popup, `Opening ${existingCloud.name}...`);
      } else {
        updatePopupMessage(popup, "Creating your cloud agent...");
        const created = await cloudClient.createAgent({
          name: generateCloudAgentName(),
        });
        if (!created.id) {
          throw new Error("agent created but no id was returned.");
        }
        cloudAgentId = created.id;

        updatePopupMessage(popup, "Provisioning sandbox... (~45s)");
        const provResult = await cloudClient.provisionAgent(cloudAgentId);
        if (provResult.jobId) {
          const startedAt = Date.now();
          const provisioningStages: ReadonlyArray<{
            afterMs: number;
            text: string;
          }> = [
            { afterMs: 8000, text: "Booting your container..." },
            {
              afterMs: 16000,
              text: "Almost there... warming up dependencies.",
            },
            { afterMs: 24000, text: "Finishing the boot sequence..." },
            {
              afterMs: 32000,
              text: "Still booting, this is taking longer than usual...",
            },
          ];
          const rotateId = window.setInterval(() => {
            const live = cloudPopupRef.current;
            if (!live || live.closed) return;
            const elapsed = Date.now() - startedAt;
            let next = "Provisioning sandbox... (~45s)";
            for (const stage of provisioningStages) {
              if (elapsed >= stage.afterMs) next = stage.text;
            }
            updatePopupMessage(live, next);
          }, 1000);
          try {
            const job = await cloudClient.pollJobUntilDone(
              provResult.jobId,
              PROVISION_TIMEOUT_MS,
            );
            if (job.status === "failed") {
              throw new Error(job.error ?? "provisioning failed.");
            }
          } finally {
            window.clearInterval(rotateId);
          }
        }
        void refresh();
      }

      if (popup.closed) {
        setCloudOpenState("idle");
        cloudPopupRef.current = null;
        return;
      }
      if (!cloudAgentId) {
        throw new Error("cloud agent id missing.");
      }

      updatePopupMessage(popup, "Authenticating...");
      await redirectPopupToCloudAgent(
        popup,
        cloudAgentId,
        cloudClient.getToken(),
      );
      cloudPopupRef.current = null;
      setCloudOpenState("idle");
    } catch (err) {
      closeCloudPopup();
      setCloudOpenState("idle");
      if (err instanceof CloudAgentsNotAvailableError) {
        setNotice({
          tone: "error",
          text: "cloud agent hosting isn't deployed on this Eliza Cloud instance yet.",
        });
        return;
      }
      setNotice({
        tone: "error",
        text:
          err instanceof Error
            ? `cloud open failed: ${err.message}`
            : "cloud open failed.",
      });
    }
  }, [agents, cloudClient, closeCloudPopup, refresh, setNotice]);

  const handleOpenCloud = useCallback(() => {
    if (cloudOpenState === "preparing") return;
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice({
        tone: "error",
        text: "popup blocked. allow popups for this site and try again.",
      });
      return;
    }
    cloudPopupRef.current = popup;
    renderPopupConnectingState(popup, "Connecting to Eliza Cloud...");
    setCloudOpenState("preparing");

    if (!isAuthenticated) {
      pendingCloudOpenRef.current = true;
      updatePopupMessage(
        popup,
        "Sign in to Eliza Cloud in the other window...",
      );
      void signIn();
      return;
    }
    if (!cloudClient) {
      pendingCloudOpenRef.current = true;
      updatePopupMessage(popup, "Connecting to your account...");
      void refresh();
      cloudOpenTimeoutRef.current = window.setTimeout(() => {
        cloudOpenTimeoutRef.current = null;
        if (!pendingCloudOpenRef.current) return;
        pendingCloudOpenRef.current = false;
        closeCloudPopup();
        setCloudOpenState("idle");
        setNotice({
          tone: "error",
          text: "couldn't connect to your account. try refreshing.",
        });
      }, 10000);
      return;
    }
    void continueCloudOpen();
  }, [
    cloudOpenState,
    isAuthenticated,
    cloudClient,
    signIn,
    continueCloudOpen,
    refresh,
    closeCloudPopup,
    setNotice,
  ]);

  const handleCancelCloudOpen = useCallback(() => {
    closeCloudPopup();
    pendingCloudOpenRef.current = false;
    setCloudOpenState("idle");
    setNotice({ tone: "info", text: "cloud open cancelled." });
  }, [closeCloudPopup, setNotice]);

  useEffect(() => {
    if (
      isAuthenticated &&
      cloudClient &&
      pendingCloudOpenRef.current &&
      cloudPopupRef.current &&
      !cloudPopupRef.current.closed
    ) {
      pendingCloudOpenRef.current = false;
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
      void continueCloudOpen();
    }
  }, [isAuthenticated, cloudClient, continueCloudOpen]);

  useEffect(() => {
    if (cloudOpenState !== "preparing") return;
    const id = window.setInterval(() => {
      const popup = cloudPopupRef.current;
      if (!popup || popup.closed) {
        window.clearInterval(id);
        cloudPopupRef.current = null;
        pendingCloudOpenRef.current = false;
        setCloudOpenState("idle");
      }
    }, 800);
    return () => window.clearInterval(id);
  }, [cloudOpenState]);

  useEffect(
    () => () => {
      if (cloudOpenTimeoutRef.current !== null) {
        window.clearTimeout(cloudOpenTimeoutRef.current);
        cloudOpenTimeoutRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    if (loginState === "error" && pendingCloudOpenRef.current) {
      pendingCloudOpenRef.current = false;
      closeCloudPopup();
      setCloudOpenState("idle");
      setNotice({
        tone: "error",
        text: loginError ?? "sign-in failed.",
      });
    }
  }, [loginState, loginError, closeCloudPopup, setNotice]);

  return {
    cloudOpenState,
    handleCancelCloudOpen,
    handleOpenCloud,
  };
}
