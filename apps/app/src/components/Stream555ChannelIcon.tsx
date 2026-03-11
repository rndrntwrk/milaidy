import type { ComponentType, SVGProps } from "react";
import { cn } from "./ui/utils";
import {
  FacebookIcon,
  KickIcon,
  TwitchIcon,
  XBrandIcon,
  YouTubeIcon,
} from "./ui/Icons";

type IconProps = SVGProps<SVGSVGElement>;

function CustomChannelIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 1h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1m0 8h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1m0 8h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1M9 5h1V3H9v2m0 8h1v-2H9v2m0 8h1v-2H9v2M5 3v2h2V3H5m0 8v2h2v-2H5m0 8v2h2v-2H5z" />
    </svg>
  );
}

type ChannelIconSpec =
  | { kind: "image"; src: string }
  | { kind: "component"; Component: ComponentType<IconProps>; className: string };

function resolveChannelIconSpec(fieldKey: string): ChannelIconSpec | null {
  if (fieldKey.includes("STREAM555_DEST_PUMPFUN_")) {
    return {
      kind: "image",
      src: "/logos/stream555/pumpfun-logo.png",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_X_")) {
    return {
      kind: "component",
      Component: XBrandIcon,
      className: "text-white",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_TWITCH_")) {
    return {
      kind: "component",
      Component: TwitchIcon,
      className: "text-[#9146FF]",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_KICK_")) {
    return {
      kind: "component",
      Component: KickIcon,
      className: "text-[#53FC18]",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_YOUTUBE_")) {
    return {
      kind: "component",
      Component: YouTubeIcon,
      className: "text-[#FF0000]",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_FACEBOOK_")) {
    return {
      kind: "component",
      Component: FacebookIcon,
      className: "text-[#1877F2]",
    };
  }
  if (fieldKey.includes("STREAM555_DEST_CUSTOM_")) {
    return {
      kind: "component",
      Component: CustomChannelIcon,
      className: "text-white/78",
    };
  }
  return null;
}

export function hasStream555ChannelIcon(fieldKey: string): boolean {
  return resolveChannelIconSpec(fieldKey) !== null;
}

export function Stream555ChannelIcon({
  fieldKey,
  className,
}: {
  fieldKey: string;
  className?: string;
}) {
  const icon = resolveChannelIconSpec(fieldKey);
  if (!icon) return null;

  if (icon.kind === "image") {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        className={cn("h-5 w-5 shrink-0 object-contain", className)}
      />
    );
  }

  const Component = icon.Component;
  return (
    <Component
      className={cn("h-5 w-5 shrink-0", icon.className, className)}
    />
  );
}
