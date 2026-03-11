import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type EmoteDrawerGroup } from "../api-client";
import { useApp } from "../AppContext";
import {
  AVATAR_EMOTE_GROUP_ICONS,
  AVATAR_EMOTE_GROUP_LABELS,
  AVATAR_EMOTE_GROUP_ORDER,
  getAvatarEmoteIcon,
} from "../avatarEmoteUi";
import { CloseIcon, MenuIcon, StopIcon } from "./ui/Icons";

export function EmotePicker() {
  const {
    emotePickerOpen,
    availableEmotes,
    activeAvatarEmoteId,
    avatarMotionMode,
    openEmotePicker,
    closeEmotePicker,
    playAvatarEmote,
    stopAvatarEmote,
  } = useApp();
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState<EmoteDrawerGroup | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOrigin = useRef<{
    startX: number;
    startY: number;
    rect: DOMRect;
  } | null>(null);

  const visibleEmotes = useMemo(
    () =>
      availableEmotes
        .filter((emote) => !emote.idleVariant)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [availableEmotes],
  );
  const availableGroups = useMemo(
    () =>
      AVATAR_EMOTE_GROUP_ORDER.filter(
        (group) =>
          group !== "idle" &&
          visibleEmotes.some((emote) => emote.drawerGroup === group),
      ),
    [visibleEmotes],
  );
  const filteredEmotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return visibleEmotes.filter((emote) => {
      if (activeGroup && emote.drawerGroup !== activeGroup) {
        return false;
      }
      if (!query) return true;
      return (
        emote.name.toLowerCase().includes(query) ||
        emote.id.toLowerCase().includes(query) ||
        emote.drawerGroup.toLowerCase().includes(query) ||
        emote.description.toLowerCase().includes(query)
      );
    });
  }, [activeGroup, search, visibleEmotes]);
  const activeAvatarEmote = useMemo(
    () =>
      activeAvatarEmoteId
        ? availableEmotes.find((emote) => emote.id === activeAvatarEmoteId) ?? null
        : null,
    [activeAvatarEmoteId, availableEmotes],
  );

  const applyPosition = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    if (!el) return;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.bottom = "auto";
    el.style.right = "auto";
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = panelRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      dragOrigin.current = {
        startX: event.clientX,
        startY: event.clientY,
        rect,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!dragOrigin.current) return;

        const dx = moveEvent.clientX - dragOrigin.current.startX;
        const dy = moveEvent.clientY - dragOrigin.current.startY;
        const maxX = window.innerWidth - dragOrigin.current.rect.width;
        const maxY = window.innerHeight - dragOrigin.current.rect.height;

        applyPosition(
          Math.max(0, Math.min(dragOrigin.current.rect.left + dx, maxX)),
          Math.max(0, Math.min(dragOrigin.current.rect.top + dy, maxY)),
        );
      };

      const onPointerUp = () => {
        dragOrigin.current = null;
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [applyPosition],
  );

  useEffect(() => {
    if (!emotePickerOpen || !panelRef.current) return;
    panelRef.current.style.left = "";
    panelRef.current.style.top = "";
    panelRef.current.style.bottom = "";
    panelRef.current.style.right = "";
  }, [emotePickerOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "e") {
        event.preventDefault();
        if (emotePickerOpen) {
          closeEmotePicker();
        } else {
          openEmotePicker();
        }
      }

      if (event.key === "Escape" && emotePickerOpen) {
        closeEmotePicker();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeEmotePicker, emotePickerOpen, openEmotePicker]);

  useEffect(() => {
    const handleToggle = () => {
      if (emotePickerOpen) {
        closeEmotePicker();
      } else {
        openEmotePicker();
      }
    };

    document.addEventListener("milady:emote-picker", handleToggle);
    return () =>
      document.removeEventListener("milady:emote-picker", handleToggle);
  }, [closeEmotePicker, emotePickerOpen, openEmotePicker]);

  useEffect(() => {
    if (emotePickerOpen) {
      inputRef.current?.focus();
    }
  }, [emotePickerOpen]);

  if (!emotePickerOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 left-4 z-[9999] w-[360px] rounded-lg border border-border bg-card shadow-2xl backdrop-blur-md"
    >
      <div
        className="flex cursor-move items-center justify-between border-b border-border px-3 py-2"
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center gap-2">
          <MenuIcon className="h-4 w-4 text-muted" />
          <span className="text-sm font-semibold text-txt">Avatar Motions</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={stopAvatarEmote}
            className="rounded bg-danger px-2 py-1 text-xs font-medium text-destructive-fg hover:opacity-90"
          >
            Stop
          </button>
          <span className="text-xs text-muted">⌘E</span>
          <button
            type="button"
            onClick={closeEmotePicker}
            className="text-muted hover:text-txt"
            aria-label="Close emote picker"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search motions..."
          aria-label="Search motions"
          className="w-full rounded bg-bg-accent px-2 py-1 text-sm text-txt placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <div className="mt-2 text-xs text-muted">
          {avatarMotionMode === "idle"
            ? "Idle pool active"
            : `${avatarMotionMode === "manual" ? "Manual" : "Auto"} motion: ${
                activeAvatarEmote?.name ?? "Unknown"
              }`}
        </div>
      </div>

      <div
        className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2"
        role="tablist"
        aria-label="Motion groups"
      >
        <button
          type="button"
          id="emote-tab-all"
          onClick={() => setActiveGroup(null)}
          role="tab"
          aria-selected={activeGroup === null}
          aria-controls="emote-tabpanel"
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
            activeGroup === null
              ? "bg-accent text-accent-fg"
              : "bg-bg-accent text-txt hover:bg-bg-hover"
          }`}
        >
          All
        </button>
        {availableGroups.map((group) => {
          const GroupIcon = AVATAR_EMOTE_GROUP_ICONS[group];
          return (
            <button
              type="button"
              key={group}
              id={`emote-tab-${group}`}
              onClick={() => setActiveGroup(group)}
              role="tab"
              aria-selected={activeGroup === group}
              aria-controls="emote-tabpanel"
              className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                activeGroup === group
                  ? "bg-accent text-accent-fg"
                  : "bg-bg-accent text-txt hover:bg-bg-hover"
              }`}
            >
              <GroupIcon className="mr-1 inline-block h-3.5 w-3.5 align-[-0.125rem]" />
              {AVATAR_EMOTE_GROUP_LABELS[group]}
            </button>
          );
        })}
      </div>

      <div
        className="max-h-[420px] overflow-y-auto p-3"
        role="tabpanel"
        id="emote-tabpanel"
        aria-labelledby={activeGroup ? `emote-tab-${activeGroup}` : "emote-tab-all"}
      >
        <div className="grid grid-cols-4 gap-2">
          {filteredEmotes.map((emote) => {
            const EmoteIcon = getAvatarEmoteIcon(emote);
            const isActive = activeAvatarEmoteId === emote.id;
            return (
              <button
                type="button"
                key={emote.id}
                onClick={() => void playAvatarEmote(emote.id)}
                title={emote.name}
                aria-label={emote.name}
                className={`rounded border px-2 py-3 transition-colors ${
                  isActive
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-bg-accent text-txt hover:bg-bg-hover"
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <EmoteIcon className="h-6 w-6" />
                  <div className="text-center text-[11px] leading-snug">
                    {emote.name}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {filteredEmotes.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted">
            No motions found
          </div>
        ) : null}

        <button
          type="button"
          onClick={stopAvatarEmote}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-border bg-bg-accent px-3 py-2 text-sm text-txt transition-colors hover:bg-bg-hover"
        >
          <StopIcon className="h-4 w-4" />
          Return to Idle
        </button>
      </div>
    </div>
  );
}
