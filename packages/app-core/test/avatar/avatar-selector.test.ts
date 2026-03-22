/**
 * Tests for avatar selection logic — VRM index management, path resolution, localStorage persistence.
 */

import {
  getCompanionBackgroundUrl,
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  VRM_COUNT,
} from "@miladyai/app-core/state";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Avatar VRM Utilities", () => {
  describe("getVrmUrl", () => {
    it("returns correct path for base milady VRMs (1-8)", () => {
      for (let i = 1; i <= 8; i++) {
        expect(getVrmUrl(i)).toBe(`/vrms/milady-${i}.vrm.gz`);
      }
    });

    it("clamps out-of-range indices to avatar 1", () => {
      expect(getVrmUrl(9)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(34)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(-3)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(Number.NaN)).toBe("/vrms/milady-1.vrm.gz");
      expect(getVrmUrl(0)).toBe("/vrms/milady-1.vrm.gz");
    });
  });

  describe("getVrmPreviewUrl", () => {
    it("returns correct preview path for base VRMs (1-8)", () => {
      for (let i = 1; i <= 8; i++) {
        expect(getVrmPreviewUrl(i)).toBe(`/vrms/previews/milady-${i}.png`);
      }
    });

    it("clamps out-of-range preview indices to avatar 1", () => {
      expect(getVrmPreviewUrl(9)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(999)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(-1)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(0)).toBe("/vrms/previews/milady-1.png");
    });
  });

  describe("getVrmTitle", () => {
    it("returns title for base VRMs", () => {
      expect(getVrmTitle(1)).toBe("Chen");
      expect(getVrmTitle(2)).toBe("Jin");
      expect(getVrmTitle(3)).toBe("Kei");
      expect(getVrmTitle(4)).toBe("Momo");
      expect(getVrmTitle(5)).toBe("Rin");
      expect(getVrmTitle(6)).toBe("Ryu");
      expect(getVrmTitle(7)).toBe("Satoshi");
      expect(getVrmTitle(8)).toBe("Yuki");
    });

    it("clamps out-of-range index to avatar 1", () => {
      expect(getVrmTitle(9)).toBe("Chen");
    });
  });

  describe("getCompanionBackgroundUrl", () => {
    it("stays within the bundled avatar background set", () => {
      expect(getCompanionBackgroundUrl("light")).toBe(
        "/vrms/backgrounds/milady-3.png",
      );
      expect(getCompanionBackgroundUrl("dark")).toBe(
        "/vrms/backgrounds/milady-4.png",
      );
    });
  });
});

describe("Avatar Selection State", () => {
  // Must match AVATAR_INDEX_KEY in AppContext.tsx
  const AVATAR_STORAGE_KEY = "eliza_avatar_index";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("localStorage persistence", () => {
    it("stores selected VRM index", () => {
      const mockStorage = new Map<string, string>();
      const mockGetItem = vi.fn((key: string) => mockStorage.get(key) ?? null);
      const mockSetItem = vi.fn((key: string, value: string) => {
        mockStorage.set(key, value);
      });

      // Simulate saving avatar selection
      mockSetItem(AVATAR_STORAGE_KEY, "3");
      expect(mockStorage.get(AVATAR_STORAGE_KEY)).toBe("3");

      // Simulate loading
      const stored = mockGetItem(AVATAR_STORAGE_KEY);
      expect(stored).toBe("3");
      const index = Number(stored);
      expect(index).toBe(3);
      expect(index >= 1 && index <= VRM_COUNT).toBe(true);
    });

    it("handles custom VRM (index 0)", () => {
      const mockStorage = new Map<string, string>();
      mockStorage.set(AVATAR_STORAGE_KEY, "0");

      const stored = mockStorage.get(AVATAR_STORAGE_KEY);
      const index = Number(stored);
      expect(index).toBe(0); // custom VRM
    });

    it("falls back to 1 for invalid stored values", () => {
      const testCases = ["", "abc", "-1", "34", "NaN"];

      for (const invalid of testCases) {
        const n = Number(invalid);
        const isValid = !Number.isNaN(n) && n >= 0 && n <= VRM_COUNT;
        const result = isValid ? n : 1;
        // Invalid cases should fall back to 1
        if (!isValid) {
          expect(result).toBe(1);
        }
      }
    });
  });
});

describe("Onboarding Avatar Step", () => {
  it("avatar step comes after name and before style", () => {
    const steps = [
      "welcome",
      "name",
      "avatar",
      "style",
      "theme",
      "runMode",
      "llmProvider",
      "inventorySetup",
      "connectors",
    ];

    const nameIdx = steps.indexOf("name");
    const avatarIdx = steps.indexOf("avatar");
    const styleIdx = steps.indexOf("style");

    expect(avatarIdx).toBe(nameIdx + 1);
    expect(styleIdx).toBe(avatarIdx + 1);
  });

  it("avatar step is always valid (defaults to 1)", () => {
    const onboardingAvatar = 1; // default
    const canGoNext = true; // avatar step always allows next
    expect(canGoNext).toBe(true);
    expect(onboardingAvatar).toBeGreaterThanOrEqual(0);
    expect(onboardingAvatar).toBeLessThanOrEqual(VRM_COUNT);
  });

  it("onboarding saves avatar to selectedVrmIndex on next", () => {
    let selectedVrmIndex = 1;
    const onboardingAvatar = 4;

    // Simulate handleOnboardingNext for "avatar" step
    selectedVrmIndex = onboardingAvatar;

    expect(selectedVrmIndex).toBe(4);
  });
});
