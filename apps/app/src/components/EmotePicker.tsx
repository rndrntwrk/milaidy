import {
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type SVGProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useApp } from "../AppContext";
import { client } from "../api-client";
import {
  ActivityIcon,
  AlertIcon,
  CloseIcon,
  CloudIcon,
  EyeIcon,
  FistIcon,
  HandIcon,
  HeartIcon,
  HookIcon,
  LightningIcon,
  MenuIcon,
  PauseIcon,
  RestartIcon,
  SkullIcon,
  SparkIcon,
  TargetIcon,
  TearIcon,
  ThreadsIcon,
} from "./ui/Icons";

type EmoteIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

// Types
interface EmoteItem {
  id: string;
  name: string;
  category: string;
  Icon: EmoteIconComponent;
}

// Category icons
const CATEGORY_ICONS: Record<string, EmoteIconComponent> = {
  greeting: HandIcon,
  emotion: HeartIcon,
  dance: ActivityIcon,
  combat: FistIcon,
  idle: PauseIcon,
  movement: ActivityIcon,
  other: SparkIcon,
};

// Emote icons
const EMOTE_ICONS: Record<string, EmoteIconComponent> = {
  wave: HandIcon,
  kiss: HeartIcon,
  crying: TearIcon,
  sorrow: TearIcon,
  "rude-gesture": HandIcon,
  "looking-around": EyeIcon,
  "dance-happy": SparkIcon,
  "dance-breaking": ActivityIcon,
  "dance-hiphop": ActivityIcon,
  "dance-popping": SparkIcon,
  "hook-punch": FistIcon,
  punching: FistIcon,
  "firing-gun": TargetIcon,
  "sword-swing": TargetIcon,
  chopping: FistIcon,
  "spell-cast": SparkIcon,
  range: TargetIcon,
  death: SkullIcon,
  idle: PauseIcon,
  talk: ThreadsIcon,
  squat: ActivityIcon,
  fishing: HookIcon,
  float: CloudIcon,
  jump: LightningIcon,
  flip: RestartIcon,
  run: ActivityIcon,
  walk: ActivityIcon,
  crawling: ActivityIcon,
  fall: AlertIcon,
};

// All emotes
const ALL_EMOTES: EmoteItem[] = [
  // Greeting
  { id: "wave", name: "Wave", category: "greeting", Icon: EMOTE_ICONS.wave },
  { id: "kiss", name: "Kiss", category: "greeting", Icon: EMOTE_ICONS.kiss },

  // Emotion
  {
    id: "crying",
    name: "Crying",
    category: "emotion",
    Icon: EMOTE_ICONS.crying,
  },
  {
    id: "sorrow",
    name: "Sorrow",
    category: "emotion",
    Icon: EMOTE_ICONS.sorrow,
  },
  {
    id: "rude-gesture",
    name: "Rude Gesture",
    category: "emotion",
    Icon: EMOTE_ICONS["rude-gesture"],
  },
  {
    id: "looking-around",
    name: "Looking Around",
    category: "emotion",
    Icon: EMOTE_ICONS["looking-around"],
  },

  // Dance
  {
    id: "dance-happy",
    name: "Dance Happy",
    category: "dance",
    Icon: EMOTE_ICONS["dance-happy"],
  },
  {
    id: "dance-breaking",
    name: "Dance Breaking",
    category: "dance",
    Icon: EMOTE_ICONS["dance-breaking"],
  },
  {
    id: "dance-hiphop",
    name: "Dance Hip Hop",
    category: "dance",
    Icon: EMOTE_ICONS["dance-hiphop"],
  },
  {
    id: "dance-popping",
    name: "Dance Popping",
    category: "dance",
    Icon: EMOTE_ICONS["dance-popping"],
  },

  // Combat
  {
    id: "hook-punch",
    name: "Hook Punch",
    category: "combat",
    Icon: EMOTE_ICONS["hook-punch"],
  },
  {
    id: "punching",
    name: "Punching",
    category: "combat",
    Icon: EMOTE_ICONS.punching,
  },
  {
    id: "firing-gun",
    name: "Firing Gun",
    category: "combat",
    Icon: EMOTE_ICONS["firing-gun"],
  },
  {
    id: "sword-swing",
    name: "Sword Swing",
    category: "combat",
    Icon: EMOTE_ICONS["sword-swing"],
  },
  {
    id: "chopping",
    name: "Chopping",
    category: "combat",
    Icon: EMOTE_ICONS.chopping,
  },
  {
    id: "spell-cast",
    name: "Spell Cast",
    category: "combat",
    Icon: EMOTE_ICONS["spell-cast"],
  },
  { id: "range", name: "Range", category: "combat", Icon: EMOTE_ICONS.range },
  { id: "death", name: "Death", category: "combat", Icon: EMOTE_ICONS.death },

  // Idle
  { id: "idle", name: "Idle", category: "idle", Icon: EMOTE_ICONS.idle },
  { id: "talk", name: "Talk", category: "idle", Icon: EMOTE_ICONS.talk },
  { id: "squat", name: "Squat", category: "idle", Icon: EMOTE_ICONS.squat },
  {
    id: "fishing",
    name: "Fishing",
    category: "idle",
    Icon: EMOTE_ICONS.fishing,
  },

  // Movement
  { id: "float", name: "Float", category: "movement", Icon: EMOTE_ICONS.float },
  { id: "jump", name: "Jump", category: "movement", Icon: EMOTE_ICONS.jump },
  { id: "flip", name: "Flip", category: "movement", Icon: EMOTE_ICONS.flip },
  { id: "run", name: "Run", category: "movement", Icon: EMOTE_ICONS.run },
  { id: "walk", name: "Walk", category: "movement", Icon: EMOTE_ICONS.walk },
  {
    id: "crawling",
    name: "Crawling",
    category: "movement",
    Icon: EMOTE_ICONS.crawling,
  },
  { id: "fall", name: "Fall", category: "movement", Icon: EMOTE_ICONS.fall },
];

const CATEGORIES = [
  "greeting",
  "emotion",
  "dance",
  "combat",
  "idle",
  "movement",
];

const CATEGORY_LABELS: Record<string, string> = {
  greeting: "Greeting",
  emotion: "Emotion",
  dance: "Dance",
  combat: "Combat",
  idle: "Idle",
  movement: "Movement",
};

export function EmotePicker() {
  const { emotePickerOpen, openEmotePicker, closeEmotePicker } = useApp();
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef<{
    startX: number;
    startY: number;
    rect: DOMRect;
  } | null>(null);

  // Apply position to panel
  const applyPosition = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    if (!el) return;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.bottom = "auto";
    el.style.right = "auto";

    posRef.current = { x, y };
  }, []);

  // Drag handlers
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const el = panelRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      dragOrigin.current = {
        startX: e.clientX,
        startY: e.clientY,
        rect,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        if (!dragOrigin.current) return;

        const dx = moveEvent.clientX - dragOrigin.current.startX;
        const dy = moveEvent.clientY - dragOrigin.current.startY;

        let newX = dragOrigin.current.rect.left + dx;
        let newY = dragOrigin.current.rect.top + dy;

        // Clamp to viewport
        const maxX = window.innerWidth - dragOrigin.current.rect.width;
        const maxY = window.innerHeight - dragOrigin.current.rect.height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        applyPosition(newX, newY);
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

  // Reset position on open
  useEffect(() => {
    if (emotePickerOpen && panelRef.current) {
      panelRef.current.style.left = "";
      panelRef.current.style.top = "";
      panelRef.current.style.bottom = "";
      panelRef.current.style.right = "";
      posRef.current = { x: 0, y: 0 };
    }
  }, [emotePickerOpen]);

  // Filter emotes
  const filteredEmotes = useMemo(() => {
    let emotes = ALL_EMOTES;

    if (activeCategory) {
      emotes = emotes.filter((e) => e.category === activeCategory);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      emotes = emotes.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.id.toLowerCase().includes(query),
      );
    }

    return emotes;
  }, [search, activeCategory]);

  // Play emote
  const playEmote = useCallback(async (emoteId: string) => {
    setPlaying(emoteId);
    try {
      await client.playEmote(emoteId);
    } catch (err) {
      console.error("Failed to play emote:", err);
    } finally {
      setTimeout(() => setPlaying(null), 1000);
    }
  }, []);

  // Stop emote
  const stopEmote = useCallback(() => {
    document.dispatchEvent(new CustomEvent("milady:stop-emote"));
    setPlaying(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+E toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        if (emotePickerOpen) {
          closeEmotePicker();
        } else {
          openEmotePicker();
        }
      }

      // Escape to close
      if (e.key === "Escape" && emotePickerOpen) {
        closeEmotePicker();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [emotePickerOpen, openEmotePicker, closeEmotePicker]);

  // Electron IPC listener
  useEffect(() => {
    const handleElectronToggle = () => {
      if (emotePickerOpen) {
        closeEmotePicker();
      } else {
        openEmotePicker();
      }
    };

    document.addEventListener("milady:emote-picker", handleElectronToggle);
    return () =>
      document.removeEventListener("milady:emote-picker", handleElectronToggle);
  }, [emotePickerOpen, openEmotePicker, closeEmotePicker]);

  // Focus search input on open
  useEffect(() => {
    if (emotePickerOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [emotePickerOpen]);

  if (!emotePickerOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 left-4 z-[9999] w-[320px] rounded-lg border border-border bg-card shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div
        className="flex cursor-move items-center justify-between border-b border-border px-3 py-2"
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center gap-2">
          <MenuIcon className="h-4 w-4 text-muted" />
          <span className="text-sm font-semibold text-txt">Emotes</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Stop button */}
          <button
            type="button"
            onClick={stopEmote}
            className="rounded bg-danger px-2 py-1 text-xs font-medium text-destructive-fg hover:opacity-90"
          >
            Stop
          </button>

          {/* Shortcut label */}
          <span className="text-xs text-muted">⌘E</span>

          {/* Close button */}
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

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emotes..."
          aria-label="Search emotes"
          className="w-full rounded bg-bg-accent px-2 py-1 text-sm text-txt placeholder-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2" role="tablist" aria-label="Emote categories">
        <button
          id="emote-tab-all"
          onClick={() => setActiveCategory(null)}
          role="tab"
          aria-selected={activeCategory === null}
          aria-controls="emote-tabpanel"
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
            activeCategory === null
              ? "bg-accent text-accent-fg"
              : "bg-bg-accent text-txt hover:bg-bg-hover"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => {
          const CategoryIcon = CATEGORY_ICONS[cat];
          return (
            <button
              type="button"
              key={cat}
              id={`emote-tab-${cat}`}
              onClick={() => setActiveCategory(cat)}
              role="tab"
              aria-selected={activeCategory === cat}
              aria-controls="emote-tabpanel"
              className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                activeCategory === cat
                  ? "bg-accent text-accent-fg"
                  : "bg-bg-accent text-txt hover:bg-bg-hover"
              }`}
            >
              <CategoryIcon className="mr-1 inline-block h-3.5 w-3.5 align-[-0.125rem]" />
              {CATEGORY_LABELS[cat]}
            </button>
          );
        })}
      </div>

      {/* Emote grid */}
      <div className="max-h-[400px] overflow-y-auto p-3" role="tabpanel" id="emote-tabpanel" aria-labelledby={activeCategory ? `emote-tab-${activeCategory}` : "emote-tab-all"}>
        <div className="grid grid-cols-5 gap-2">
          {filteredEmotes.map((emote) => {
            const EmoteIcon = emote.Icon;
            return (
              <button
                type="button"
                key={emote.id}
                onClick={() => playEmote(emote.id)}
                disabled={playing === emote.id}
                title={emote.name}
                aria-label={emote.name}
                className={`flex aspect-square items-center justify-center rounded border transition-colors ${
                  playing === emote.id
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-bg-accent text-txt hover:bg-bg-hover"
                }`}
              >
                <EmoteIcon className="h-6 w-6" />
              </button>
            );
          })}
        </div>

        {filteredEmotes.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">
            No emotes found
          </div>
        )}
      </div>
    </div>
  );
}
