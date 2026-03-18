/**
 * Reusable avatar/character VRM selector.
 *
 * Shows the built-in stage avatars plus an optional custom VRM upload tile.
 * Slot 1 is the default Pro Streamer stage avatar.
 */

import { useRef } from "react";
import { getVrmPreviewUrl, VRM_COUNT, TAOBOT_VRM_INDEX } from "../AppContext";
import { PlusIcon } from "./ui/Icons";

export interface AvatarSelectorProps {
  /** Currently selected index (1-8 for built-in, 0 for custom) */
  selected: number;
  /** Called when a built-in avatar is selected */
  onSelect: (index: number) => void;
  /** Called when a custom VRM is uploaded */
  onUpload?: (file: File) => void;
  /** Whether to show the upload option */
  showUpload?: boolean;
  /** Expand selector to fill row width with responsive tile sizes */
  fullWidth?: boolean;
}

export function AvatarSelector({
  selected,
  onSelect,
  onUpload,
  showUpload = true,
  fullWidth = false,
}: AvatarSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".vrm")) {
      alert("Please select a .vrm file");
      return;
    }
    onUpload?.(file);
    onSelect(0); // 0 = custom
  };

  const avatarIndices = Array.from({ length: VRM_COUNT }, (_, i) => i + 1);
  const avatarLabel = (index: number) =>
    index === 1 ? "Alice" : index === TAOBOT_VRM_INDEX ? "TaoBot" : `Avatar ${index}`;
  const containerClass = fullWidth
    ? "grid gap-3 w-full"
    : "flex flex-wrap gap-3 justify-start";
  const containerStyle = fullWidth
    ? { gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }
    : undefined;
  const avatarButtonClass = fullWidth
    ? "relative w-full aspect-square shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all"
    : "relative w-24 h-24 shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all";
  const uploadButtonClass = fullWidth
    ? "w-full aspect-square shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all"
    : "w-24 h-24 shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all";

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <div className={containerClass} style={containerStyle}>
        {avatarIndices.map((i) => (
          <button
            key={i}
            className={`${avatarButtonClass} ${
              selected === i
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                : "opacity-60 hover:opacity-100 hover:scale-105"
            }`}
            onClick={() => onSelect(i)}
            aria-label={`Select ${avatarLabel(i)}`}
            title={avatarLabel(i)}
            type="button"
          >
            <img
              src={getVrmPreviewUrl(i)}
              alt={avatarLabel(i)}
              className="w-full h-full object-cover"
            />
            {i === 1 ? (
              <span className="pointer-events-none absolute left-2 top-2 rounded-full border border-white/14 bg-black/65 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-white/88 shadow-sm backdrop-blur">
                Default
              </span>
            ) : null}
          </button>
        ))}

        {/* Upload custom VRM */}
        {showUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className={`${uploadButtonClass} ${
                selected === 0
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                  : "border-[var(--border)] text-[var(--muted)] opacity-60 hover:opacity-100 hover:border-[var(--accent)] hover:scale-105"
              }`}
              onClick={() => fileInputRef.current?.click()}
              title="Upload custom VRM"
              type="button"
            >
              <PlusIcon className="h-5 w-5" aria-label="Add new persona" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
