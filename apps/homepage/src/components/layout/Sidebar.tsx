import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { releaseData } from "../../generated/release-data";
import type { ManagedAgent } from "../../lib/AgentProvider";
import { resolveHomepageAssetUrl } from "../../lib/asset-url";
import { SessionTile } from "./SessionTile";

const GITHUB_URL = "https://github.com/milady-ai/milady";

export interface SidebarProps {
  /** All known agents (used for counts). */
  agents: ManagedAgent[];
  /** First local agent, if any. Drives the Milady APP tile. */
  localAgent: ManagedAgent | null;
  /** Fallback URL when there's no local agent. */
  fallbackLaunchUrl: string;
  /** Called when user activates the Milady APP tile. */
  onOpenMiladyApp: (url: string) => void;
  /** Called when user clicks "Attach remote". */
  onAttachRemote: () => void;
  /** Called when user clicks "Sign in to cloud" in session tile. */
  onSignIn: () => void;
  /** Current sign-in poll state (drives session tile dot animation). */
  isSigningIn?: boolean;
  /** Optional close handler \u2014 present on mobile drawer to dismiss. */
  onClose?: () => void;
}

export function Sidebar({
  agents,
  localAgent,
  fallbackLaunchUrl,
  onOpenMiladyApp,
  onAttachRemote,
  onSignIn,
  isSigningIn,
  onClose,
}: SidebarProps) {
  const remoteCount = agents.filter((a) => a.source === "remote").length;

  return (
    <aside
      aria-label="Primary"
      className="flex h-full w-full flex-col gap-5 border-r border-border bg-[#08090d] px-4 py-5 text-white"
    >
      {/* Brand mark */}
      <div className="flex items-center justify-between">
        <a
          href="/dashboard"
          className="flex items-center gap-2.5"
          onClick={onClose}
        >
          <img
            src={resolveHomepageAssetUrl("logo.png")}
            alt="Milady"
            className="h-8 w-8 rounded-md border border-white/10 object-cover"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            milady
          </span>
        </a>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-md border border-border p-1.5 text-white/60 transition hover:text-white lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* Nav groups */}
      <nav className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <NavGroup title="agents">
          <OpenLocalRow
            localAgent={localAgent}
            fallbackUrl={fallbackLaunchUrl}
            onOpen={(url) => {
              onClose?.();
              onOpenMiladyApp(url);
            }}
          />
          <NavItem to="/dashboard" label="dashboard" onClick={onClose} />
          <NavItem to="/agents" label="agents" onClick={onClose} disabled />
          <NavItem to="/cloud" label="cloud" onClick={onClose} disabled />
          <NavItemButton
            label="attach remote"
            onClick={() => {
              onClose?.();
              onAttachRemote();
            }}
            prefix="+"
            count={remoteCount > 0 ? remoteCount : undefined}
          />
        </NavGroup>

        <NavGroup title="account">
          <NavItem to="/billing" label="billing" onClick={onClose} disabled />
          <NavItem to="/settings" label="settings" onClick={onClose} disabled />
        </NavGroup>

        <NavGroup title="resources">
          <NavItem to="/docs" label="docs" onClick={onClose} />
          <NavItemExternal href={GITHUB_URL} label="github" />
          <NavItemExternal
            href={releaseData.release.url}
            label={`release ${releaseData.release.tagName}`}
          />
        </NavGroup>
      </nav>

      {/* Session tile (bottom) */}
      <SessionTile onSignIn={onSignIn} isSigningIn={isSigningIn} />
    </aside>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 px-2 font-mono text-[10px] lowercase tracking-[0.18em] text-white/40">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  to,
  label,
  onClick,
  count,
  disabled,
}: {
  to: string;
  label: string;
  onClick?: () => void;
  count?: number;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/45"
      >
        <span>{label}</span>
        {typeof count === "number" ? (
          <span className="font-mono text-[10px] text-white/35">{count}</span>
        ) : (
          <span className="font-mono text-[9px] lowercase tracking-wider text-white/35">
            soon
          </span>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={to}
      end
      onClick={onClick}
      className={({ isActive }) =>
        `group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition ${
          isActive
            ? "bg-white/[0.06] text-brand"
            : "text-white/70 hover:bg-white/[0.04] hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                isActive ? "bg-brand" : "bg-transparent"
              }`}
            />
            {label}
          </span>
          {typeof count === "number" ? (
            <span className="font-mono text-[10px] text-white/40">{count}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function NavItemButton({
  label,
  onClick,
  prefix,
  count,
}: {
  label: string;
  onClick: () => void;
  prefix?: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex items-center gap-2">
        {prefix ? (
          <span className="font-mono text-[12px] text-white/40 transition group-hover:text-brand">
            {prefix}
          </span>
        ) : null}
        {label}
      </span>
      {typeof count === "number" ? (
        <span className="font-mono text-[10px] text-white/40">{count}</span>
      ) : null}
    </button>
  );
}

function NavItemExternal({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/70 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="text-[11px] text-white/30">
        ↗
      </span>
    </a>
  );
}

/**
 * OpenLocalRow — quiet replacement for the retired gold MiladyAppTile.
 * Inline with the rest of nav. When local is running, it's a real link
 * with a gold dot. When not, it shows a muted 'no local runtime' status.
 * Gold now lives only on the hero's primary CTA.
 */
function OpenLocalRow({
  localAgent,
  fallbackUrl,
  onOpen,
}: {
  localAgent: ManagedAgent | null;
  fallbackUrl: string;
  onOpen: (url: string) => void;
}) {
  const hasLocal = Boolean(localAgent);
  const launchUrl =
    localAgent?.webUiUrl ?? localAgent?.sourceUrl ?? fallbackUrl;

  if (!hasLocal) {
    return (
      <div
        aria-disabled="true"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-white/45"
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-white/20"
        />
        <span>no local runtime</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(launchUrl)}
      className="group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-white/85 transition hover:bg-white/[0.04] hover:text-white"
    >
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_6px_rgba(240,185,11,0.4)]"
        />
        <span>open local</span>
      </span>
      <span
        aria-hidden="true"
        className="text-[11px] text-white/30 transition group-hover:translate-x-0.5 group-hover:text-brand"
      >
        →
      </span>
    </button>
  );
}
