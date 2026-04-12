import { describe, expect, it } from "vitest";
import { recentConversationsProvider } from "./recent-conversations";
import { relevantConversationsProvider } from "./relevant-conversations";
import { rolodexProvider } from "./rolodex";
import { uiCatalogProvider } from "./ui-catalog";

describe("localized provider relevance keywords", () => {
  it("includes non-English keywords for recent conversations", () => {
    expect(recentConversationsProvider.relevanceKeywords).toContain("最近");
  });

  it("includes non-English keywords for relevant conversations", () => {
    expect(relevantConversationsProvider.relevanceKeywords).toContain(
      "quién dijo",
    );
  });

  it("includes non-English keywords for rolodex", () => {
    expect(rolodexProvider.relevanceKeywords).toContain("联系人");
  });

  it("includes non-English keywords for ui catalog", () => {
    expect(uiCatalogProvider.relevanceKeywords).toContain("configurar");
  });
});
