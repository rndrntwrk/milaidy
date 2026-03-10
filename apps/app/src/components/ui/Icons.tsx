import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconBase({
  children,
  viewBox = "0 0 24 24",
  ...props
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function AgentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="7" y="8" width="10" height="9" rx="3" />
      <path d="M10 17v2" />
      <path d="M14 17v2" />
      <path d="M9.5 12h.01" />
      <path d="M14.5 12h.01" />
      <path d="M12 5v3" />
    </IconBase>
  );
}

export function OperatorIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
    </IconBase>
  );
}

export function SystemIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3l2.2 4.45L19 9l-3.4 3.3.8 4.7L12 14.8 7.6 17l.8-4.7L5 9l4.8-1.55Z" />
    </IconBase>
  );
}

export function ThreadsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 14a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M8 12h6" />
    </IconBase>
  );
}

export function MemoryIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
    </IconBase>
  );
}

export function OpsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h10" />
      <path d="M4 17h16" />
      <path d="M10 7v10" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="6" cy="17" r="2" />
    </IconBase>
  );
}

export function VaultIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3l7 4v5c0 4.4-3 7.85-7 9-4-1.15-7-4.6-7-9V7z" />
      <path d="M9.5 12h5" />
      <path d="M12 9.5v5" />
    </IconBase>
  );
}

export function StackIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4 4 8l8 4 8-4-8-4Z" />
      <path d="m4 12 8 4 8-4" />
      <path d="m4 16 8 4 8-4" />
    </IconBase>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </IconBase>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m6 15 6-6 6 6" />
    </IconBase>
  );
}

export function GripVerticalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 6h.01" />
      <path d="M9 12h.01" />
      <path d="M9 18h.01" />
      <path d="M15 6h.01" />
      <path d="M15 12h.01" />
      <path d="M15 18h.01" />
    </IconBase>
  );
}

export function XBrandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 5h3.5l3.3 4.5L16.2 5H18l-4.4 5.8L18 19h-3.5l-3.6-4.9L7.3 19H5.5l4.7-6.2L6 5Z" />
    </IconBase>
  );
}

export function TwitchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 4h11v8l-3 3h-3l-2.5 2.5V15H6Z" />
      <path d="M10 8v3" />
      <path d="M13 8v3" />
    </IconBase>
  );
}

export function KickIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 5h4v5l4-5h4l-4.5 5.5L18 19h-4l-4-5v5H6Z" />
    </IconBase>
  );
}

export function FacebookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M14.5 7H17V4.5h-2.5A4.5 4.5 0 0 0 10 9v2H7.5v2.5H10V20h2.8v-6.5H16L16.5 11h-3.7V9a2 2 0 0 1 1.7-2Z" />
    </IconBase>
  );
}

export function DiscordIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 8.75a10 10 0 0 1 8 0" />
      <path d="M7.25 9.5A8.9 8.9 0 0 0 5.5 15c1.85 1.35 4 2.05 6.5 2.2 2.5-.15 4.65-.85 6.5-2.2a8.9 8.9 0 0 0-1.75-5.5" />
      <path d="M9.75 12.25h.01" />
      <path d="M14.25 12.25h.01" />
      <path d="M9.5 15c.8.55 1.63.82 2.5.82s1.7-.27 2.5-.82" />
    </IconBase>
  );
}

export function TelegramIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 9-4-3.5 8-2-2-2 2z" />
      <path d="m11.5 14 1-4" />
    </IconBase>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4.5a7 7 0 0 0-6 10.6L5 19.5l4-1A7 7 0 1 0 12 4.5Z" />
      <path d="M9.75 9.5c.35 1.7 1.6 3.2 3.85 4.25" />
      <path d="M13.85 13.75c-.45.45-1.35.55-2.3.05-1.45-.75-2.45-1.75-3.2-3.2-.5-.95-.4-1.85.05-2.3" />
    </IconBase>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="4.5" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M16.2 7.8h.01" />
    </IconBase>
  );
}

export function YouTubeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6.5" width="18" height="11" rx="3.5" />
      <path d="m10 9.75 5 2.75-5 2.75z" fill="currentColor" stroke="none" />
    </IconBase>
  );
}

export function BlueskyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path
        d="M12 12.5c1.3-2.05 2.85-4.4 5.6-6.2.9-.6 1.95-.1 1.85.95-.28 2.75-2.05 5.15-4.95 6.3 1.35-.12 2.62.18 3.95.95 1 .58.82 2.08-.3 2.33-2.35.52-4.85-.35-6.15-2.25-1.3 1.9-3.8 2.77-6.15 2.25-1.12-.25-1.3-1.75-.3-2.33 1.33-.77 2.6-1.07 3.95-.95-2.9-1.15-4.67-3.55-4.95-6.3-.1-1.05.95-1.55 1.85-.95 2.75 1.8 4.3 4.15 5.6 6.2Z"
        fill="currentColor"
        stroke="none"
      />
    </IconBase>
  );
}

export function PumpFunIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 14.5c.7-1.6 1.9-3.2 4.2-4.2" />
      <path d="m13 7.8 1.8 2.1-2.6.3" />
    </IconBase>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12h10l1-12" />
      <path d="M9 7V5h6v2" />
    </IconBase>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 11.5 21 3l-6.5 18-3.25-6.25L3 11.5Z" />
      <path d="M11.25 14.75 21 3" />
    </IconBase>
  );
}

export function StopIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </IconBase>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </IconBase>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </IconBase>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3 21 21" />
      <path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6 0 9.5 6 9.5 6a18.7 18.7 0 0 1-3.3 4.1" />
      <path d="M6.2 6.8A18.8 18.8 0 0 0 2.5 12s3.5 6 9.5 6c1 0 1.9-.15 2.8-.42" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" />
    </IconBase>
  );
}

export function BugIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 3h6" />
      <path d="M10 7V5a2 2 0 1 1 4 0v2" />
      <rect x="7" y="7" width="10" height="12" rx="4" />
      <path d="M4 10h3" />
      <path d="M17 10h3" />
      <path d="M4 14h3" />
      <path d="M17 14h3" />
    </IconBase>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 12V7H6a2 2 0 1 1 0-4h15v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </IconBase>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5v14" />
      <path d="M15 5v14" />
    </IconBase>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 5 11 7-11 7z" />
    </IconBase>
  );
}

export function RestartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M20 11a8 8 0 1 0 2.2 5.5" />
      <path d="M20 4v7h-7" />
    </IconBase>
  );
}

export function ConnectionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M5 12a7 7 0 0 1 14 0" />
      <path d="M2.5 12a9.5 9.5 0 0 1 19 0" />
    </IconBase>
  );
}

export function CloudIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 18h10a4 4 0 0 0 .2-8 5.5 5.5 0 0 0-10.65-1.65A4 4 0 0 0 7 18Z" />
    </IconBase>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 1 1 8 0v3" />
    </IconBase>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </IconBase>
  );
}

export function EditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 17.25V21h3.75L18.8 8.95l-3.75-3.75Z" />
      <path d="M14.9 5.2 18.65 8.95" />
    </IconBase>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="7.5" cy="12" r="3.5" />
      <path d="M11 12h10" />
      <path d="M16 12v3" />
      <path d="M19 12v2" />
    </IconBase>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.7 2.4 4.5 5.6 4.5 9s-1.8 6.6-4.5 9" />
      <path d="M12 3c-2.7 2.4-4.5 5.6-4.5 9s1.8 6.6 4.5 9" />
    </IconBase>
  );
}

export function PackageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 7 4v10l-7 4-7-4V7z" />
      <path d="m5 7 7 4 7-4" />
      <path d="M12 11v10" />
    </IconBase>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </IconBase>
  );
}

export function OutputIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 5h6v6" />
      <path d="m19 5-8 8" />
      <path d="M5 9v10h10" />
    </IconBase>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22Z" />
    </IconBase>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 11.5 14 7v10L3 12.5Z" />
      <path d="M14 10h3a4 4 0 1 1 0 8h-3" />
      <path d="M6 14v4" />
    </IconBase>
  );
}

export function PaletteIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4a8 8 0 1 0 0 16h1.25a2.25 2.25 0 0 0 0-4.5H12a2 2 0 0 1 0-4h4a4 4 0 0 0 0-8Z" />
      <path d="M8 10h.01" />
      <path d="M7 14h.01" />
      <path d="M11 8h.01" />
      <path d="M15 8h.01" />
    </IconBase>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 10a5 5 0 1 1 10 0v4l2 2H5l2-2z" />
      <path d="M10 18a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 19h16" />
      <path d="m6 15 4-4 3 3 5-6" />
      <path d="M18 9V5h-4" />
    </IconBase>
  );
}

export function FlaskIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10 3v5l-5 9a2 2 0 0 0 1.75 3h10.5A2 2 0 0 0 19 17l-5-9V3" />
      <path d="M8 8h8" />
      <path d="M8.5 14h7" />
    </IconBase>
  );
}

export function RulerIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 19 19 5" />
      <path d="M7 17 10 20" />
      <path d="M10 14 13 17" />
      <path d="M13 11 16 14" />
      <path d="M16 8 19 11" />
    </IconBase>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </IconBase>
  );
}

export function ImageIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m6 17 4.5-4.5 3 3 4-4 2.5 2.5" />
    </IconBase>
  );
}

export function VideoIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </IconBase>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5 14.7 9l6 1-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 10l6-1z" />
    </IconBase>
  );
}

export function HandIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 11V7a1 1 0 1 1 2 0v4" />
      <path d="M10 11V6a1 1 0 1 1 2 0v5" />
      <path d="M12 11V7a1 1 0 1 1 2 0v4" />
      <path d="M14 11V8a1 1 0 1 1 2 0v6" />
      <path d="m8 11-1-1a1 1 0 0 0-1.6 1.1l1.25 5A3 3 0 0 0 9.55 19h4.9a3 3 0 0 0 3-3v-2" />
    </IconBase>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 20-7-6.5A4.5 4.5 0 0 1 11 7l1 1 1-1a4.5 4.5 0 0 1 6 6.5z" />
    </IconBase>
  );
}

export function FistIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 10V7a1 1 0 1 1 2 0v3" />
      <path d="M10 10V6.5a1 1 0 1 1 2 0V10" />
      <path d="M12 10V7a1 1 0 1 1 2 0v3" />
      <path d="M14 10V8a1 1 0 1 1 2 0v4" />
      <path d="M8 10H7a2 2 0 0 0-2 2v3a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4Z" />
    </IconBase>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </IconBase>
  );
}

export function SkullIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4a6 6 0 0 0-6 6v3a3 3 0 0 0 3 3v2h2v-2h2v2h2v-2a3 3 0 0 0 3-3v-3a6 6 0 0 0-6-6Z" />
      <path d="M9.5 11h.01" />
      <path d="M14.5 11h.01" />
      <path d="M10 14h4" />
    </IconBase>
  );
}

export function TearIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="10.5" cy="12" r="2" />
      <path d="M16.5 14.5c0 1.2-.9 2-1.5 2.8-.6-.8-1.5-1.6-1.5-2.8a1.5 1.5 0 1 1 3 0Z" />
    </IconBase>
  );
}

export function HookIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 6a4 4 0 1 0-4 4v6a3 3 0 1 0 6 0" />
      <path d="M11 16h3" />
    </IconBase>
  );
}

export function BroadcastIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16v10H4z" />
      <path d="M8 20h8" />
      <path d="M12 16v4" />
    </IconBase>
  );
}

export function MissionIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3v18" />
      <path d="M6 5h10l-2.5 4L16 13H6" />
    </IconBase>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 13h4l2-5 4 10 2-5h4" />
    </IconBase>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </IconBase>
  );
}

export function CreditIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5h-4a2 2 0 1 0 0 4h1a2 2 0 1 1 0 4h-4" />
      <path d="M12 6.75v10.5" />
    </IconBase>
  );
}

export function AudioIcon({
  muted = false,
  ...props
}: IconProps & { muted?: boolean }) {
  return (
    <IconBase {...props}>
      <path d="M11 5 6 9H3v6h3l5 4z" />
      {muted ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M16 9.5a4.5 4.5 0 0 1 0 5" />
          <path d="M18.75 6.75a8 8 0 0 1 0 10.5" />
        </>
      )}
    </IconBase>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.05.05a1.8 1.8 0 0 1-2.55 2.55l-.05-.05a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 0 1-3.6 0v-.08a1 1 0 0 0-.66-.95 1 1 0 0 0-1.08.23l-.05.05a1.8 1.8 0 1 1-2.55-2.55l.05-.05a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 0 1 0-3.6h.08a1 1 0 0 0 .95-.66 1 1 0 0 0-.23-1.08l-.05-.05a1.8 1.8 0 1 1 2.55-2.55l.05.05a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a1.8 1.8 0 0 1 3.6 0v.08a1 1 0 0 0 .66.95 1 1 0 0 0 1.08-.23l.05-.05a1.8 1.8 0 1 1 2.55 2.55l-.05.05a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a1.8 1.8 0 0 1 0 3.6h-.08a1 1 0 0 0-.95.66Z" />
    </IconBase>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m5 12 4.5 4.5L19 7" />
    </IconBase>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 4 3.75 19h16.5L12 4Z" />
      <path d="M12 9v4" />
      <path d="M12 16h.01" />
    </IconBase>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 12h12" />
    </IconBase>
  );
}

export function CursorIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 3v14l4-4 3.5 8L16 20l-3.5-8H18Z" />
    </IconBase>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </IconBase>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M5 8h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
      <path d="m17 11 4-2v8l-4-2" />
      <circle cx="10" cy="13" r="2.5" />
    </IconBase>
  );
}

export function TerminalIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m4 6 5 6-5 6" />
      <path d="M12 18h8" />
    </IconBase>
  );
}

export function BrowserIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M3 8h18" />
      <path d="M7 6h.01" />
      <path d="M10 6h.01" />
    </IconBase>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6 3 3 0 0 0 3 3h1v-5H8" />
      <path d="M15 5a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6 3 3 0 0 1-3 3h-1v-5h2" />
      <path d="M10 8a2 2 0 1 1 4 0v10" />
    </IconBase>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z" />
    </IconBase>
  );
}

export function LightningIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M13 2 5 13h5l-1 9 8-11h-5z" />
    </IconBase>
  );
}

export function DocumentIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 3h6l5 5v13H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="M10 13h6" />
      <path d="M10 17h4" />
    </IconBase>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </IconBase>
  );
}

export function CodeIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 8-4 4 4 4" />
      <path d="m16 8 4 4-4 4" />
      <path d="m13 5-2 14" />
    </IconBase>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 5 6v6c0 4.4 3 7.85 7 9 4-1.15 7-4.6 7-9V6z" />
      <path d="m9.5 12 1.8 1.8 3.2-3.4" />
    </IconBase>
  );
}

export function DatabaseIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" />
      <path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" />
    </IconBase>
  );
}

export function EthereumIcon(props: IconProps) {
  return (
    <IconBase viewBox="0 0 24 24" {...props}>
      <path d="m12 3 5 8-5 3-5-3Z" />
      <path d="m12 14 5-3-5 10-5-10Z" />
    </IconBase>
  );
}

export function BaseChainIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="7" />
      <path d="M9.5 9.5h5" />
      <path d="M9.5 14.5h5" />
    </IconBase>
  );
}

export function ArbitrumIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m12 3 7 4v10l-7 4-7-4V7z" />
      <path d="m9 8 3 8" />
      <path d="m13 7 3 9" />
    </IconBase>
  );
}

export function OptimismIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M7 9.5c0-1.66 1.79-3 4-3s4 1.34 4 3-1.79 3-4 3-4-1.34-4-3Z" />
      <path d="M9.5 14.5c-1.93 0-3.5 1.12-3.5 2.5S7.57 19.5 9.5 19.5c1.31 0 2.45-.51 3.05-1.26" />
      <path d="M14.5 13.5c1.66 0 3 1.12 3 2.5s-1.34 2.5-3 2.5-3-1.12-3-2.5" />
    </IconBase>
  );
}

export function PolygonIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="m8 10 3-2 3 2v4l-3 2-3-2z" />
      <path d="m14 10 3-2 3 2v4l-3 2-3-2" />
      <path d="M14 12h2" />
    </IconBase>
  );
}

export function SolanaIcon(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M6 7h12" />
      <path d="M8 12h10" />
      <path d="M6 17h12" />
    </IconBase>
  );
}
