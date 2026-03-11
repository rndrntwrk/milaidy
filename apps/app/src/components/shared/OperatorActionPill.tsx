import {
  ActivityIcon,
  BroadcastIcon,
  CameraIcon,
  PlayIcon,
  SparkIcon,
  VideoIcon,
} from "../ui/Icons.js";

type OperatorActionKind = "stream" | "avatar" | "launch";

function resolveOperatorActionPresentation(kind: OperatorActionKind) {
  if (kind === "avatar") {
    return {
      eyebrow: "Avatar Action",
      AccentIcon: SparkIcon,
      EyebrowIcon: ActivityIcon,
      accentClass:
        "border-[rgba(236,201,75,0.18)] bg-[linear-gradient(135deg,rgba(255,193,7,0.14),rgba(255,255,255,0.02))] text-[#ffe7a2]",
    };
  }
  if (kind === "launch") {
    return {
      eyebrow: "Launch",
      AccentIcon: PlayIcon,
      EyebrowIcon: CameraIcon,
      accentClass:
        "border-[rgba(125,211,252,0.18)] bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(255,255,255,0.02))] text-[#d5f2ff]",
    };
  }
  return {
    eyebrow: "Stream Action",
    AccentIcon: BroadcastIcon,
    EyebrowIcon: VideoIcon,
    accentClass:
      "border-[rgba(16,185,129,0.22)] bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(255,255,255,0.02))] text-[#d2fff1]",
  };
}

export function OperatorActionPill({
  label,
  kind,
  detail,
  compact = false,
  showEyebrow = true,
  detailClassName = "text-[11px] text-white/54",
}: {
  label: string;
  kind: OperatorActionKind;
  detail?: string;
  compact?: boolean;
  showEyebrow?: boolean;
  detailClassName?: string;
}) {
  const { eyebrow, AccentIcon, EyebrowIcon, accentClass } =
    resolveOperatorActionPresentation(kind);

  return (
    <div className="my-1 flex flex-col items-start gap-2">
      {showEyebrow ? (
        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.24em] text-white/42">
          <EyebrowIcon className="h-3.5 w-3.5" />
          {eyebrow}
        </div>
      ) : null}
      <div
        className={`inline-flex max-w-full items-center gap-2 rounded-full border shadow-[0_12px_30px_rgba(0,0,0,0.24)] backdrop-blur-xl ${accentClass} ${
          compact ? "px-3 py-1.5 text-[13px] font-medium" : "px-3.5 py-2 text-sm font-medium"
        }`}
      >
        <span
          className={`inline-flex items-center justify-center rounded-full border border-white/10 bg-black/24 ${
            compact ? "h-5 w-5" : "h-6 w-6"
          }`}
        >
          <AccentIcon className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
        </span>
        <span className="truncate">{label}</span>
      </div>
      {detail ? <div className={detailClassName}>{detail}</div> : null}
    </div>
  );
}
