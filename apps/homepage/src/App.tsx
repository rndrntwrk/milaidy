import { type ReactNode, useEffect, useState } from "react";
import { ConnectionModal } from "./components/dashboard/ConnectionModal";
import { useCloudLogin } from "./components/dashboard/useCloudLogin";
import { releaseData } from "./generated/release-data";
import {
  AgentProvider,
  type ManagedAgent,
  useAgents,
} from "./lib/AgentProvider";
import { resolveHomepageAssetUrl } from "./lib/asset-url";
import { formatShortDate, formatSourceUrl, formatUptime } from "./lib/format";
import { openWebUI, openWebUIDirect } from "./lib/open-web-ui";
import { CLOUD_BASE, LOCAL_AGENT_BASE } from "./lib/runtime-config";
import { useAuth } from "./lib/useAuth";

const DOCS_URL = "/docs";
const GITHUB_URL = "https://github.com/milady-ai/milady";

type NoticeTone = "success" | "error" | "info";

interface Notice {
  tone: NoticeTone;
  text: string;
}

const STATUS_LABELS: Record<ManagedAgent["status"], string> = {
  running: "Live",
  paused: "Paused",
  stopped: "Stopped",
  provisioning: "Starting",
  unknown: "Unknown",
};

const STATUS_STYLES: Record<ManagedAgent["status"], string> = {
  running:
    "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.14)]",
  paused:
    "border-amber-300/30 bg-amber-300/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.12)]",
  stopped:
    "border-rose-400/30 bg-rose-400/10 text-rose-200 shadow-[0_0_24px_rgba(251,113,133,0.12)]",
  provisioning:
    "border-brand/40 bg-brand/10 text-brand shadow-[0_0_28px_rgba(240,185,11,0.14)]",
  unknown:
    "border-white/[0.12] bg-white/[0.06] text-white/70 shadow-[0_0_18px_rgba(255,255,255,0.06)]",
};

const SOURCE_LABELS: Record<ManagedAgent["source"], string> = {
  local: "Local",
  remote: "Remote",
  cloud: "Eliza Cloud",
};

const SOURCE_ACCENTS: Record<ManagedAgent["source"], string> = {
  local: "text-brand",
  remote: "text-sky-200",
  cloud: "text-violet-200",
};

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

async function copyToClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard access is unavailable in this browser.");
  }

  await navigator.clipboard.writeText(text);
}

function LogoMark() {
  return (
    <img
      src={resolveHomepageAssetUrl("logo.png")}
      alt="Milady"
      className="h-9 w-9 rounded-full border border-white/[0.12] bg-white/5 object-cover shadow-[0_0_36px_rgba(240,185,11,0.18)]"
    />
  );
}

function TopIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target={href.startsWith("/") ? undefined : "_blank"}
      rel={href.startsWith("/") ? undefined : "noreferrer"}
      className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/[0.72] transition hover:border-brand/40 hover:bg-brand/10 hover:text-white"
    >
      {children}
      {label}
    </a>
  );
}

function QuickAction({
  onClick,
  href,
  label,
  detail,
  primary = false,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  detail: string;
  primary?: boolean;
}) {
  const className = primary
    ? "inline-flex w-full items-center justify-between rounded-[1.6rem] border border-brand/60 bg-brand px-5 py-4 text-left text-[#09090c] shadow-[0_20px_80px_rgba(240,185,11,0.2)] transition hover:-translate-y-0.5 hover:bg-[#f4c84a]"
    : "inline-flex w-full items-center justify-between rounded-[1.6rem] border border-white/[0.12] bg-white/[0.06] px-5 py-4 text-left text-white transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]";

  const content = (
    <>
      <span>
        <span className="block font-mono text-[11px] uppercase tracking-[0.22em] opacity-75">
          {label}
        </span>
        <span className="mt-1 block text-sm leading-relaxed opacity-90">
          {detail}
        </span>
      </span>
      <span className="ml-4 shrink-0 text-lg">↗</span>
    </>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {content}
      </a>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-black/[0.25] px-4 py-4 backdrop-blur-sm">
      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/[0.45]">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent ?? "text-white"}`}>
        {value}
      </div>
    </div>
  );
}

function CommandCard({
  label,
  command,
  onCopy,
}: {
  label: string;
  command: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-black/[0.28] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/[0.55]">
          {label}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-full border border-white/[0.12] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-white/80 transition hover:border-brand/40 hover:text-brand"
        >
          Copy
        </button>
      </div>
      <code className="mt-3 block overflow-x-auto whitespace-nowrap rounded-[1rem] border border-white/[0.06] bg-black/40 px-3 py-3 font-mono text-[12px] leading-relaxed text-brand">
        {command}
      </code>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="font-mono text-[11px] uppercase tracking-[0.26em] text-brand/80">
          {eyebrow}
        </div>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-7 text-white/[0.68] sm:text-base">
          {copy}
        </p>
      </div>
      {action}
    </div>
  );
}

function InstanceCard({
  agent,
  onOpen,
  onCopyUrl,
  onOpenRaw,
  onDisconnect,
}: {
  agent: ManagedAgent;
  onOpen: () => void;
  onCopyUrl: () => void;
  onOpenRaw: () => void;
  onDisconnect?: () => void;
}) {
  const displayUrl = agent.webUiUrl ?? agent.sourceUrl;
  const avatarIndex = agent.avatarIndex ?? 1;
  const avatarUrl = resolveHomepageAssetUrl(
    `vrms/previews/milady-${avatarIndex}.png`,
  );

  return (
    <article className="group rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.035))] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:-translate-y-1 hover:border-white/[0.16]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <img
            src={avatarUrl}
            alt={agent.name}
            className="h-14 w-14 rounded-[1.2rem] border border-white/10 object-cover object-top shadow-[0_14px_40px_rgba(240,185,11,0.14)]"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`font-mono text-[11px] uppercase tracking-[0.2em] ${SOURCE_ACCENTS[agent.source]}`}
              >
                {SOURCE_LABELS[agent.source]}
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] ${STATUS_STYLES[agent.status]}`}
              >
                {STATUS_LABELS[agent.status]}
              </span>
            </div>
            <h3 className="mt-2 truncate text-xl font-semibold tracking-[-0.03em] text-white">
              {agent.name}
            </h3>
            <p className="mt-1 truncate font-mono text-[11px] uppercase tracking-[0.18em] text-white/[0.45]">
              {agent.model ?? "Milady runtime"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full border border-brand/50 bg-brand/[0.14] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-brand transition hover:border-brand hover:bg-brand/[0.18]"
        >
          Open
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[1.1rem] border border-white/[0.08] bg-black/[0.18] px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.38]">
            Endpoint
          </div>
          <div className="mt-2 truncate text-sm text-white/[0.82]">
            {formatSourceUrl(displayUrl)}
          </div>
        </div>
        <div className="rounded-[1.1rem] border border-white/[0.08] bg-black/[0.18] px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.38]">
            Runtime
          </div>
          <div className="mt-2 text-sm text-white/[0.82]">
            {agent.uptime ? formatUptime(agent.uptime) : "Just discovered"}
          </div>
        </div>
        <div className="rounded-[1.1rem] border border-white/[0.08] bg-black/[0.18] px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.38]">
            Region
          </div>
          <div className="mt-2 text-sm text-white/[0.82]">
            {agent.region ?? "Local route"}
          </div>
        </div>
        <div className="rounded-[1.1rem] border border-white/[0.08] bg-black/[0.18] px-3 py-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.38]">
            Created
          </div>
          <div className="mt-2 text-sm text-white/[0.82]">
            {formatShortDate(agent.createdAt, "Untracked")}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black transition hover:bg-brand"
        >
          Open Milady
        </button>
        {displayUrl ? (
          <button
            type="button"
            onClick={onCopyUrl}
            className="rounded-full border border-white/[0.12] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.78] transition hover:border-white/25 hover:text-white"
          >
            Copy URL
          </button>
        ) : null}
        {displayUrl ? (
          <button
            type="button"
            onClick={onOpenRaw}
            className="rounded-full border border-white/[0.12] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.78] transition hover:border-white/25 hover:text-white"
          >
            Open raw
          </button>
        ) : null}
        {onDisconnect ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-full border border-rose-400/[0.22] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-200 transition hover:border-rose-300/40 hover:bg-rose-400/[0.08]"
          >
            Remove remote
          </button>
        ) : null}
      </div>
    </article>
  );
}

function InstanceGroup({
  source,
  agents,
  onOpen,
  onCopyUrl,
  onOpenRaw,
  onDisconnect,
  empty,
}: {
  source: ManagedAgent["source"];
  agents: ManagedAgent[];
  onOpen: (agent: ManagedAgent) => void;
  onCopyUrl: (agent: ManagedAgent) => void;
  onOpenRaw: (agent: ManagedAgent) => void;
  onDisconnect: (agent: ManagedAgent) => void;
  empty: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div
            className={`font-mono text-[11px] uppercase tracking-[0.24em] ${SOURCE_ACCENTS[source]}`}
          >
            {SOURCE_LABELS[source]}
          </div>
          <div className="mt-1 text-sm text-white/[0.55]">
            {agents.length} instance{agents.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {agents.length === 0 ? (
        <div className="rounded-[1.6rem] border border-dashed border-white/[0.12] bg-white/[0.04] px-5 py-8 text-sm leading-7 text-white/[0.55]">
          {empty}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {agents.map((agent) => (
            <InstanceCard
              key={agent.id}
              agent={agent}
              onOpen={() => onOpen(agent)}
              onCopyUrl={() => onCopyUrl(agent)}
              onOpenRaw={() => onOpenRaw(agent)}
              onDisconnect={
                agent.source === "remote"
                  ? () => onDisconnect(agent)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MiladyControlHub() {
  const { isAuthenticated, signOut } = useAuth();
  const {
    agents,
    loading,
    isRefreshing,
    error,
    clearError,
    refresh,
    addRemoteUrl,
    removeRemote,
  } = useAgents();
  const {
    state: loginState,
    error: loginError,
    manualLoginUrl,
    signIn,
  } = useCloudLogin({
    onAuthenticated: () => void refresh(),
  });
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const localAgents = agents.filter((agent) => agent.source === "local");
  const cloudAgents = agents.filter((agent) => agent.source === "cloud");
  const remoteAgents = agents.filter((agent) => agent.source === "remote");
  const releaseDownloads = releaseData.release.downloads;
  const launchUrl =
    localAgents[0]?.webUiUrl ?? localAgents[0]?.sourceUrl ?? LOCAL_AGENT_BASE;

  const launchCloud = () => {
    if (isAuthenticated) {
      openExternal(CLOUD_BASE);
      return;
    }

    void signIn();
  };

  const handleOpenAgent = (agent: ManagedAgent) => {
    const url = agent.webUiUrl ?? agent.sourceUrl;
    if (!url) {
      setNotice({
        tone: "error",
        text: `${agent.name} does not expose a control URL yet.`,
      });
      return;
    }

    openWebUI(url, agent.source, agent.cloudAgentId);
  };

  const handleCopyUrl = async (agent: ManagedAgent) => {
    const url = agent.webUiUrl ?? agent.sourceUrl;
    if (!url) {
      setNotice({
        tone: "error",
        text: `${agent.name} does not expose a URL yet.`,
      });
      return;
    }

    try {
      await copyToClipboard(url);
      setNotice({
        tone: "success",
        text: `${agent.name} URL copied to the clipboard.`,
      });
    } catch (copyError) {
      setNotice({
        tone: "error",
        text:
          copyError instanceof Error
            ? copyError.message
            : "Clipboard copy failed.",
      });
    }
  };

  const handleOpenRaw = (agent: ManagedAgent) => {
    const url = agent.webUiUrl ?? agent.sourceUrl;
    if (!url) {
      setNotice({
        tone: "error",
        text: `${agent.name} does not expose a URL yet.`,
      });
      return;
    }

    openExternal(url);
  };

  const handleDisconnect = (agent: ManagedAgent) => {
    removeRemote(agent.id);
    setNotice({
      tone: "info",
      text: `${agent.name} removed from saved remote connections.`,
    });
  };

  const handleCopyCommand = async (command: string, label: string) => {
    try {
      await copyToClipboard(command);
      setNotice({
        tone: "success",
        text: `${label} install command copied.`,
      });
    } catch (copyError) {
      setNotice({
        tone: "error",
        text:
          copyError instanceof Error
            ? copyError.message
            : "Clipboard copy failed.",
      });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06070b] text-white selection:bg-brand selection:text-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(240,185,11,0.22),transparent_28%),radial-gradient(circle_at_82%_14%,rgba(99,102,241,0.18),transparent_26%),radial-gradient(circle_at_50%_80%,rgba(56,189,248,0.12),transparent_30%),linear-gradient(180deg,#04050a_0%,#090b11_48%,#06070b_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 rounded-[2rem] border border-white/10 bg-black/[0.18] px-5 py-4 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <LogoMark />
            <div>
              <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-brand/80">
                Milady frontend
              </div>
              <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-white">
                Open the agent. Skip the provisioning theater.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TopIconLink href={DOCS_URL} label="Docs">
              <span>⌘</span>
            </TopIconLink>
            <TopIconLink href={CLOUD_BASE} label="Eliza Cloud">
              <span>☁</span>
            </TopIconLink>
            <TopIconLink href={GITHUB_URL} label="GitHub">
              <span>↗</span>
            </TopIconLink>
          </div>
        </header>

        <main className="mt-8 space-y-8">
          <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
            <div className="rounded-[2.4rem] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.11),rgba(255,255,255,0.03))] px-6 py-8 shadow-[0_35px_120px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:px-8 sm:py-10">
              <div className="font-mono text-[11px] uppercase tracking-[0.26em] text-brand/80">
                Local-first control
              </div>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-[-0.07em] text-white sm:text-6xl lg:text-[4.8rem]">
                Milady is the frontend now.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-white/[0.72] sm:text-lg">
                Launch straight into Milady, attach an existing runtime, or sign
                into Eliza Cloud and take over whatever is already running.
                Provisioning stays out of the way.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <QuickAction
                  primary
                  onClick={() => openWebUIDirect(launchUrl)}
                  label="Open local Milady"
                  detail="Jump directly into the desktop or local web runtime."
                />
                <QuickAction
                  onClick={launchCloud}
                  label={
                    isAuthenticated
                      ? "Open Eliza Cloud"
                      : "Sign into Eliza Cloud"
                  }
                  detail={
                    isAuthenticated
                      ? "Your cloud session is live. Open the hosted control plane."
                      : "Authenticate once, then control cloud-hosted agents from here."
                  }
                />
                <QuickAction
                  onClick={() => setShowConnectModal(true)}
                  label="Connect remote instance"
                  detail="Attach a VPS, LAN box, or hosted endpoint by URL and optional access key."
                />
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Release"
                  value={releaseData.release.tagName}
                  accent="text-brand"
                />
                <MetricCard label="Local" value={String(localAgents.length)} />
                <MetricCard label="Cloud" value={String(cloudAgents.length)} />
                <MetricCard
                  label="Remote"
                  value={String(remoteAgents.length)}
                />
              </div>

              {releaseDownloads.length > 0 ? (
                <div className="mt-8 rounded-[1.6rem] border border-white/10 bg-black/[0.22] p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/[0.52]">
                        Desktop releases
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        Grab the current Milady build or stay on the CLI.
                      </div>
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/[0.42]">
                      {releaseData.release.publishedAtLabel}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2">
                    {releaseDownloads.slice(0, 4).map((download) => (
                      <a
                        key={download.id}
                        href={download.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-[1.2rem] border border-white/10 bg-white/[0.06] px-4 py-3 text-sm transition hover:border-brand/30 hover:bg-brand/10"
                      >
                        <span>
                          <span className="block font-medium text-white">
                            {download.label}
                          </span>
                          <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-white/[0.45]">
                            {download.sizeLabel}
                          </span>
                        </span>
                        <span className="text-brand">↗</span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 backdrop-blur-xl">
                <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/[0.48]">
                  Cloud session
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      isAuthenticated
                        ? "bg-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.9)]"
                        : loginState === "polling"
                          ? "bg-brand animate-pulse"
                          : "bg-white/25"
                    }`}
                  />
                  <div className="text-lg font-semibold tracking-[-0.03em] text-white">
                    {isAuthenticated
                      ? "Eliza Cloud connected"
                      : loginState === "polling"
                        ? "Waiting for sign-in"
                        : "Cloud login inactive"}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-7 text-white/[0.68]">
                  {isAuthenticated
                    ? "Authenticated sessions can open hosted Milady instances with pairing tokens and sync your cloud-discovered runtimes."
                    : "Use Eliza Cloud when you want account-backed remote control without building a separate management app."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={launchCloud}
                    className="rounded-full bg-white px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-black transition hover:bg-brand"
                  >
                    {isAuthenticated ? "Open cloud" : "Sign in"}
                  </button>
                  {isAuthenticated ? (
                    <button
                      type="button"
                      onClick={signOut}
                      className="rounded-full border border-white/[0.12] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.78] transition hover:border-white/25 hover:text-white"
                    >
                      Sign out
                    </button>
                  ) : null}
                </div>
                {loginError ? (
                  <div className="mt-4 rounded-[1.1rem] border border-rose-400/[0.22] bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                    {loginError}
                  </div>
                ) : null}
                {manualLoginUrl ? (
                  <a
                    href={manualLoginUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex font-mono text-[11px] uppercase tracking-[0.18em] text-brand hover:text-brand-hover"
                  >
                    Open sign-in page manually
                  </a>
                ) : null}
              </div>

              <CommandCard
                label="Shell install"
                command={releaseData.scripts.shell.command}
                onCopy={() =>
                  void handleCopyCommand(
                    releaseData.scripts.shell.command,
                    "Shell",
                  )
                }
              />

              <CommandCard
                label="PowerShell install"
                command={releaseData.scripts.powershell.command}
                onCopy={() =>
                  void handleCopyCommand(
                    releaseData.scripts.powershell.command,
                    "PowerShell",
                  )
                }
              />
            </div>
          </section>

          {notice ? (
            <div
              className={`rounded-[1.4rem] border px-4 py-3 text-sm ${
                notice.tone === "success"
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100"
                  : notice.tone === "error"
                    ? "border-rose-400/25 bg-rose-400/10 text-rose-100"
                    : "border-brand/30 bg-brand/10 text-brand"
              }`}
              role="status"
            >
              {notice.text}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[1.4rem] border border-rose-400/[0.22] bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={clearError}
                  className="rounded-full border border-rose-200/20 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-rose-50 transition hover:border-rose-200/36"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ) : null}

          <section className="rounded-[2rem] border border-white/10 bg-black/[0.22] px-5 py-6 backdrop-blur-xl sm:px-6">
            <SectionHeader
              eyebrow="Control surface"
              title="Existing runtimes, one frontend."
              copy="Local Milady, Eliza Cloud sandboxes, and manually attached remote instances all land in the same control surface. Open them directly instead of provisioning another layer."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    className="rounded-full border border-white/[0.12] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/[0.78] transition hover:border-white/25 hover:text-white"
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConnectModal(true)}
                    className="rounded-full border border-brand/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-brand transition hover:border-brand hover:bg-brand/10"
                  >
                    Add remote
                  </button>
                </div>
              }
            />

            {loading ? (
              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {[0, 1].map((index) => (
                  <div
                    key={index}
                    className="h-56 animate-pulse rounded-[1.8rem] border border-white/[0.08] bg-white/[0.06]"
                  />
                ))}
              </div>
            ) : (
              <div className="mt-8 space-y-8">
                <InstanceGroup
                  source="local"
                  agents={localAgents}
                  onOpen={handleOpenAgent}
                  onCopyUrl={(agent) => void handleCopyUrl(agent)}
                  onOpenRaw={handleOpenRaw}
                  onDisconnect={handleDisconnect}
                  empty="No local runtime responded yet. Launch Milady locally, then refresh or use the quick-open action above."
                />
                <InstanceGroup
                  source="cloud"
                  agents={cloudAgents}
                  onOpen={handleOpenAgent}
                  onCopyUrl={(agent) => void handleCopyUrl(agent)}
                  onOpenRaw={handleOpenRaw}
                  onDisconnect={handleDisconnect}
                  empty={
                    isAuthenticated
                      ? "No hosted runtimes were discovered for this account yet."
                      : "Sign into Eliza Cloud to discover hosted Milady runtimes and open them with pairing tokens."
                  }
                />
                <InstanceGroup
                  source="remote"
                  agents={remoteAgents}
                  onOpen={handleOpenAgent}
                  onCopyUrl={(agent) => void handleCopyUrl(agent)}
                  onOpenRaw={handleOpenRaw}
                  onDisconnect={handleDisconnect}
                  empty="Attach a remote instance by URL to keep VPS or LAN runtimes alongside your local and cloud sessions."
                />
              </div>
            )}
          </section>
        </main>
      </div>

      {showConnectModal ? (
        <ConnectionModal
          onClose={() => setShowConnectModal(false)}
          onSubmit={(data) => {
            addRemoteUrl(data.name, data.url, data.token);
            setShowConnectModal(false);
            setNotice({
              tone: "success",
              text: `${data.name} added to your remote instances.`,
            });
          }}
        />
      ) : null}
    </div>
  );
}

export function Homepage() {
  return (
    <AgentProvider>
      <MiladyControlHub />
    </AgentProvider>
  );
}
