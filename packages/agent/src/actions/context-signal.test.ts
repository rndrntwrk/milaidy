import { describe, expect, it } from "vitest";
import {
  hasContextSignalSync,
  hasContextSignalSyncForKey,
  messageText,
} from "./context-signal";

// ---------------------------------------------------------------------------
// Helper to build a minimal Memory-shaped object
// ---------------------------------------------------------------------------
function mem(text: string) {
  return { content: { text } } as never;
}

function stateWith(recentMessages: string) {
  return { values: { recentMessages } } as never;
}

// ===========================================================================
// messageText
// ===========================================================================
describe("messageText", () => {
  it("extracts text from content.text", () => {
    expect(messageText(mem("hello world"))).toBe("hello world");
  });

  it("returns empty string for missing content", () => {
    expect(messageText({} as never)).toBe("");
    expect(messageText({ content: {} } as never)).toBe("");
    expect(messageText({ content: null } as never)).toBe("");
  });
});

// ===========================================================================
// hasContextSignalSync — raw terms
// ===========================================================================
describe("hasContextSignalSync", () => {
  it("matches a single strong term in the current message", () => {
    expect(
      hasContextSignalSync(mem("check my gmail"), undefined, ["gmail"]),
    ).toBe(true);
  });

  it("rejects when no terms match", () => {
    expect(
      hasContextSignalSync(mem("hello world"), undefined, ["gmail", "email"]),
    ).toBe(false);
  });

  it("matches strong terms in recent conversation state", () => {
    const state = stateWith("user: check my email\nassistant: sure");
    expect(
      hasContextSignalSync(mem("yes please"), state, ["email"]),
    ).toBe(true);
  });

  it("requires 2+ weak term matches by default", () => {
    expect(
      hasContextSignalSync(
        mem("can you send a reply to that"),
        undefined,
        [],
        ["send", "reply", "forward"],
      ),
    ).toBe(true);
  });

  it("activates with 1 weak term match at default threshold", () => {
    expect(
      hasContextSignalSync(
        mem("please send it"),
        undefined,
        [],
        ["send", "reply", "forward"],
      ),
    ).toBe(true);
  });

  it("returns false for empty text", () => {
    expect(hasContextSignalSync(mem(""), undefined, ["gmail"])).toBe(false);
  });
});

// ===========================================================================
// hasContextSignalSyncForKey — i18n keyword lookups
// ===========================================================================
describe("hasContextSignalSyncForKey", () => {
  // ── Gmail ────────────────────────────────────────────────────────────
  describe("gmail", () => {
    it("activates on 'email'", () => {
      expect(
        hasContextSignalSyncForKey(mem("check my email"), undefined, "gmail"),
      ).toBe(true);
    });

    it("activates on 'inbox'", () => {
      expect(
        hasContextSignalSyncForKey(mem("show me inbox"), undefined, "gmail"),
      ).toBe(true);
    });

    it("activates on 'message' (greedy — better to include than miss)", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("send a message to bob"),
          undefined,
          "gmail",
        ),
      ).toBe(true);
    });

    it("activates on gmail weak terms in conversation context", () => {
      const state = stateWith(
        "user: forward that email\nassistant: which one?",
      );
      expect(
        hasContextSignalSyncForKey(mem("the one from john"), state, "gmail"),
      ).toBe(true);
    });

    it("activates on Chinese email terms", () => {
      expect(
        hasContextSignalSyncForKey(mem("查看我的邮件"), undefined, "gmail"),
      ).toBe(true);
    });

    it("activates on Korean email terms", () => {
      expect(
        hasContextSignalSyncForKey(mem("이메일 확인해줘"), undefined, "gmail"),
      ).toBe(true);
    });

    it("activates on Spanish email terms", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("revisa mi correo"),
          undefined,
          "gmail",
        ),
      ).toBe(true);
    });

    it("rejects unrelated messages", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("tell me a joke"),
          undefined,
          "gmail",
        ),
      ).toBe(false);
    });
  });

  // ── Web search ───────────────────────────────────────────────────────
  describe("web_search", () => {
    it("activates on 'search for bitcoin price'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("search for bitcoin price"),
          undefined,
          "web_search",
        ),
      ).toBe(true);
    });

    it("activates on Spanish search", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("busca en la web el precio de bitcoin"),
          undefined,
          "web_search",
        ),
      ).toBe(true);
    });

    it("rejects unrelated messages", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("play a song"),
          undefined,
          "web_search",
        ),
      ).toBe(false);
    });
  });

  // ── Read channel ─────────────────────────────────────────────────────
  describe("read_channel", () => {
    it("activates on 'read channel history'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("read channel history"),
          undefined,
          "read_channel",
        ),
      ).toBe(true);
    });

    it("activates on Korean chat history request", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("채팅 기록 읽어줘"),
          undefined,
          "read_channel",
        ),
      ).toBe(true);
    });
  });

  // ── Search entity ────────────────────────────────────────────────────
  describe("search_entity", () => {
    it("activates on 'who is john'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("who is john"),
          undefined,
          "search_entity",
        ),
      ).toBe(true);
    });

    it("rejects unrelated messages", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("good morning"),
          undefined,
          "search_entity",
        ),
      ).toBe(false);
    });
  });

  // ── Stream control ───────────────────────────────────────────────────
  describe("stream_control", () => {
    it("activates on 'go live'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("go live now"),
          undefined,
          "stream_control",
        ),
      ).toBe(true);
    });

    it("activates on 'stop streaming'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("stop streaming"),
          undefined,
          "stream_control",
        ),
      ).toBe(true);
    });
  });

  // ── Send message ─────────────────────────────────────────────────────
  describe("send_message", () => {
    it("activates on 'send a message to bob'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("send a message to bob"),
          undefined,
          "send_message",
        ),
      ).toBe(true);
    });

    it("rejects casual chat", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("how are you today"),
          undefined,
          "send_message",
        ),
      ).toBe(false);
    });
  });

  // ── Send admin message ───────────────────────────────────────────────
  describe("send_admin_message", () => {
    it("activates on 'notify admin about the issue'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("notify admin about the issue"),
          undefined,
          "send_admin_message",
        ),
      ).toBe(true);
    });
  });

  // ── Search conversations ─────────────────────────────────────────────
  describe("search_conversations", () => {
    it("activates on 'search conversations about pizza'", () => {
      expect(
        hasContextSignalSyncForKey(
          mem("search conversations about pizza"),
          undefined,
          "search_conversations",
        ),
      ).toBe(true);
    });
  });
});
