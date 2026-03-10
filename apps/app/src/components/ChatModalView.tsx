import { useEffect, useState } from "react";
import { useApp } from "../AppContext.js";

import { ChatView } from "./ChatView.js";
import { ConversationsSidebar } from "./ConversationsSidebar.js";

const CHAT_MODAL_NARROW_BREAKPOINT = 768;

function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth <= CHAT_MODAL_NARROW_BREAKPOINT
      : false,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mediaQuery = window.matchMedia(
      `(max-width: ${CHAT_MODAL_NARROW_BREAKPOINT}px)`,
    );
    const sync = () => {
      setIsNarrow(mediaQuery.matches);
    };
    sync();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", sync);
      return () => mediaQuery.removeEventListener("change", sync);
    }

    mediaQuery.addListener(sync);
    return () => mediaQuery.removeListener(sync);
  }, []);

  return isNarrow;
}

export type ChatModalLayoutVariant = "full-overlay" | "companion-dock";

interface ChatModalViewProps {
  variant?: ChatModalLayoutVariant;
  onRequestClose?: () => void;
}

export function ChatModalView({
  variant = "full-overlay",
}: ChatModalViewProps) {
  const { activeConversationId } = useApp();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isNarrow = useIsNarrowViewport();
  const isCompanionDock = variant === "companion-dock";

  useEffect(() => {
    if (!isNarrow) {
      setMobileSidebarOpen(false);
    }
  }, [isNarrow]);

  useEffect(() => {
    if (activeConversationId) {
      setMobileSidebarOpen(false);
    }
  }, [activeConversationId]);

  return (
    <div
      className={isCompanionDock ? "chat-game-dock" : "chat-game-overlay"}
      data-chat-game-overlay={!isCompanionDock || undefined}
      data-chat-game-dock={isCompanionDock || undefined}
    >
      <div
        className={`chat-game-shell anime-theme-scope ${isCompanionDock ? "chat-game-shell-docked" : ""}`}
        data-chat-game-shell
      >
        <div className="chat-game-body">
          <aside
            className={`chat-game-sidebar ${mobileSidebarOpen ? "is-open" : ""}`}
            data-chat-game-sidebar
          >
            <ConversationsSidebar variant="game-modal" />
          </aside>
          <section className="chat-game-thread" data-chat-game-thread>
            <ChatView variant="game-modal" />
          </section>
        </div>
      </div>
    </div>
  );
}
