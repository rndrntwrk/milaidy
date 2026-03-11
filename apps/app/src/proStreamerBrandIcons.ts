import type { SVGProps } from "react";
import { resolveAppAssetUrl } from "./asset-url";
import { getProviderLogo, hasProviderLogo } from "./provider-logos";
import {
  BlueskyIcon,
  DiscordIcon,
  FacebookIcon,
  InstagramIcon,
  KickIcon,
  PumpFunIcon,
  TelegramIcon,
  TwitchIcon,
  WhatsAppIcon,
  XBrandIcon,
  YouTubeIcon,
} from "./components/ui/Icons";

export type ProStreamerBrandIconComponent = (
  props: SVGProps<SVGSVGElement>,
) => ReturnType<typeof XBrandIcon>;

export type ProStreamerBrandIcon =
  | { kind: "image"; src: string }
  | { kind: "component"; Component: ProStreamerBrandIconComponent };

const SOCIAL_BRAND_ICONS: Partial<
  Record<string, ProStreamerBrandIconComponent>
> = {
  bluesky: BlueskyIcon,
  discord: DiscordIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
  kick: KickIcon,
  pumpfun: PumpFunIcon,
  telegram: TelegramIcon,
  twitch: TwitchIcon,
  twitter: XBrandIcon,
  whatsapp: WhatsAppIcon,
  x: XBrandIcon,
  youtube: YouTubeIcon,
};

const BRAND_ALIASES: Record<string, string> = {
  "anthropic-subscription": "anthropic-subscription",
  claude: "anthropic",
  "google-genai": "google",
  grok: "xai",
  "openai-codex": "openai",
  "openai-subscription": "openai-subscription",
  "plugin-anthropic": "anthropic",
  "plugin-openai": "openai",
  "plugin-openrouter": "openrouter",
  "plugin-xai": "xai",
  twitter: "x",
  "x/twitter": "x",
};

function normalizeBrandKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

function toBrandCandidates(rawKeys: Array<string | null | undefined>): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const rawKey of rawKeys) {
    if (!rawKey) continue;
    const normalized = normalizeBrandKey(rawKey);
    if (!normalized) continue;

    const alias = BRAND_ALIASES[normalized] ?? normalized;
    if (!seen.has(alias)) {
      seen.add(alias);
      candidates.push(alias);
    }
  }

  return candidates;
}

export function resolveProStreamerBrandIcon(
  rawKeys: Array<string | null | undefined>,
): ProStreamerBrandIcon | null {
  for (const key of toBrandCandidates(rawKeys)) {
    const Component = SOCIAL_BRAND_ICONS[key];
    if (Component) {
      return { kind: "component", Component };
    }

    if (hasProviderLogo(key)) {
      return {
        kind: "image",
        src: resolveAppAssetUrl(getProviderLogo(key, true)),
      };
    }
  }

  return null;
}

export function resolveProStreamerBrandComponent(
  rawKeys: Array<string | null | undefined>,
): ProStreamerBrandIconComponent | null {
  const icon = resolveProStreamerBrandIcon(rawKeys);
  return icon?.kind === "component" ? icon.Component : null;
}
