import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../../AppContext";
import { client, type SandboxPlatformStatus } from "../../api-client";
import { OnboardingVrmAvatar } from "./OnboardingVrmAvatar";

const SANDBOX_POLL_INTERVAL_MS = 3000;
const SANDBOX_START_MAX_ATTEMPTS = 20;

const inferPlatform = (): string => {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  if (navigator.platform.toLowerCase().includes("mac")) return "darwin";
  if (navigator.platform.toLowerCase().includes("win")) return "win32";
  if (navigator.platform.toLowerCase().includes("linux")) return "linux";
  return "unknown";
};

function mapSandboxPlatform(status: SandboxPlatformStatus): {
  installed: boolean;
  running: boolean;
  platform: string;
  appleContainerAvailable: boolean;
  engineRecommendation: string;
} {
  return {
    installed: Boolean(status.dockerInstalled ?? status.dockerAvailable),
    running: Boolean(status.dockerRunning),
    platform: status.platform ?? inferPlatform(),
    appleContainerAvailable: Boolean(status.appleContainerAvailable),
    engineRecommendation: status.recommended ?? "docker",
  };
}

export function DockerSetupStep({
  avatarVrmPath,
  avatarFallbackPreviewUrl,
}: {
  avatarVrmPath: string;
  avatarFallbackPreviewUrl: string;
}) {
  const { t } = useApp();
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [startMessage, setStartMessage] = useState("");
  const [dockerStatus, setDockerStatus] = useState<{
    installed: boolean;
    running: boolean;
    platform: string;
    appleContainerAvailable: boolean;
    engineRecommendation: string;
  } | null>(null);

  const checkDocker = useCallback(async () => {
    setChecking(true);
    try {
      const data = await client.getSandboxPlatform();
      setDockerStatus(mapSandboxPlatform(data));
    } catch {
      setDockerStatus({
        installed: false,
        running: false,
        platform: inferPlatform(),
        appleContainerAvailable: false,
        engineRecommendation: "docker",
      });
    }
    setChecking(false);
  }, []);

  // Auto-start Docker and poll until it's ready
  const handleStartDocker = async () => {
    setStarting(true);
    setStartMessage("starting docker...");
    try {
      const data = await client.startDocker();
      if (data.success) {
        setStartMessage(data.message || "starting up...");
        // Poll every 3 seconds until Docker is running
        for (let i = 0; i < SANDBOX_START_MAX_ATTEMPTS; i++) {
          await new Promise((r) => setTimeout(r, SANDBOX_POLL_INTERVAL_MS));
          setStartMessage(`waiting for docker to start... (${(i + 1) * 3}s)`);
          try {
            const status = await client.getSandboxPlatform();
            if (status.dockerRunning) {
              setDockerStatus((prev) =>
                prev
                  ? { ...prev, ...mapSandboxPlatform(status), running: true }
                  : prev,
              );
              setStartMessage("docker is running!");
              setStarting(false);
              return;
            }
          } catch {
            /* keep polling */
          }
        }
        setStartMessage(
          "docker is taking a while... try opening Docker Desktop manually",
        );
      } else {
        setStartMessage(data.message || "could not auto-start docker");
      }
    } catch (err) {
      setStartMessage(
        `failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }
    setStarting(false);
  };

  useEffect(() => {
    void checkDocker();
  }, [checkDocker]);

  const getInstallUrl = () => {
    if (!dockerStatus) return "https://docs.docker.com/get-docker/";
    switch (dockerStatus.platform) {
      case "darwin":
        return "https://docs.docker.com/desktop/install/mac-install/";
      case "win32":
        return "https://docs.docker.com/desktop/install/windows-install/";
      case "linux":
        return "https://docs.docker.com/engine/install/";
      default:
        return "https://docs.docker.com/get-docker/";
    }
  };

  const getPlatformName = () => {
    if (!dockerStatus) return "your computer";
    switch (dockerStatus.platform) {
      case "darwin":
        return "macOS";
      case "win32":
        return "Windows";
      case "linux":
        return "Linux";
      default:
        return "your computer";
    }
  };

  if (checking) {
    return (
      <div className="max-w-[520px] mx-auto mt-10 text-center font-body">
        <OnboardingVrmAvatar
          vrmPath={avatarVrmPath}
          fallbackPreviewUrl={avatarFallbackPreviewUrl}
          pulse
        />
        <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
          <p>{t("onboardingwizard.checkingUrMachine")}</p>
        </div>
      </div>
    );
  }

  const isInstalled = dockerStatus?.installed;
  const isRunning = dockerStatus?.running;
  const isReady = isInstalled && isRunning;
  const hasAppleContainer = dockerStatus?.appleContainerAvailable;

  return (
    <div className="max-w-[540px] mx-auto mt-10 text-center font-body">
      <OnboardingVrmAvatar
        vrmPath={avatarVrmPath}
        fallbackPreviewUrl={avatarFallbackPreviewUrl}
      />
      <div className="onboarding-speech bg-card border border-border rounded-xl px-5 py-4 mx-auto mb-6 max-w-[600px] relative text-[15px] text-txt leading-relaxed">
        {isReady ? (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              {hasAppleContainer
                ? "omg ur set up perfectly"
                : "nice, docker is ready"}
            </h2>
            <p className="text-[13px] opacity-70">
              {hasAppleContainer
                ? "found apple container on ur mac — thats the strongest isolation. each container gets its own tiny VM. very safe very cool"
                : "docker is installed and running. i'll use it to keep myself sandboxed so i cant accidentally mess up ur stuff"}
            </p>
          </>
        ) : isInstalled && !isRunning ? (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              {t("onboardingwizard.dockerIsInstalled")}
            </h2>
            <p className="text-[13px] opacity-70 mb-3">
              {t("onboardingwizard.iFoundDockerOnUr")}
            </p>
          </>
        ) : (
          <>
            <h2 className="text-[24px] font-normal mb-2 text-txt-strong">
              {t("onboardingwizard.needDockerForSand")}
            </h2>
            <p className="text-[13px] opacity-70 mb-3">
              {t("onboardingwizard.toRunMeInASandb")} {getPlatformName()}
              {t("onboardingwizard.ItSLikeALittle")}
            </p>
            {dockerStatus?.platform === "win32" && (
              <p className="text-[12px] opacity-60 mb-2">
                {t("onboardingwizard.onWindowsUAlsoNe")}
              </p>
            )}
            {dockerStatus?.platform === "darwin" && (
              <p className="text-[12px] opacity-60 mb-2">
                {t("onboardingwizard.proTipIfUrOnAp")}
              </p>
            )}
          </>
        )}
      </div>

      {/* Status indicators */}
      <div className="flex flex-col gap-2 max-w-[400px] mx-auto mb-4">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
            isInstalled
              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
              : "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200"
          }`}
        >
          <span>
            {isInstalled ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
          </span>
          <span>
            {t("onboardingwizard.Docker")}{" "}
            {isInstalled ? "installed" : "not found"}
          </span>
        </div>

        {isInstalled && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
              isRunning
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                : "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200"
            }`}
          >
            <span>
              {isRunning ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </span>
            <span>
              {t("onboardingwizard.DockerDaemon")}{" "}
              {isRunning ? "running" : "not running"}
            </span>
          </div>
        )}

        {dockerStatus?.platform === "darwin" && (
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm ${
              hasAppleContainer
                ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200"
                : "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200"
            }`}
          >
            <span>
              {hasAppleContainer ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </span>
            <span>
              {hasAppleContainer
                ? "Apple Virtualization available"
                : "Apple Virtualization not found (Rosetta needed)"}
            </span>
          </div>
        )}
      </div>

      {/* Action Area */}
      {!isInstalled ? (
        <a
          href={getInstallUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover transition-colors mt-2"
        >
          {t("onboardingwizard.DownloadDocker")}
        </a>
      ) : !isRunning ? (
        <div className="flex flex-col gap-3 mt-4 items-center">
          <button
            type="button"
            className="w-full max-w-[280px] px-6 py-2.5 border border-accent bg-accent text-accent-fg text-sm cursor-pointer rounded-full hover:bg-accent-hover transition-colors disabled:opacity-50"
            onClick={handleStartDocker}
            disabled={starting}
          >
            {starting ? startMessage : "start docker"}
          </button>
          {!starting && (
            <button
              type="button"
              className="text-xs text-accent bg-transparent border-0 cursor-pointer hover:underline"
              onClick={checkDocker}
            >
              {t("onboardingwizard.RefreshStatus")}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
