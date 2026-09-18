import { describe, expect, test } from "vitest";
import { DEFAULT_LEGAL_PAGES, mergeLegalPages } from "./legalContent";

describe("legal-content version safety", () => {
  test("does not allow an older database override to replace a newer privacy notice", () => {
    const merged = mergeLegalPages({
      privacy: {
        ...DEFAULT_LEGAL_PAGES.privacy,
        intro: "Outdated notice",
        lastUpdated: "2026-01-01",
      },
    });

    expect(merged.privacy.lastUpdated).toBe("2026-08-02");
    expect(merged.privacy.intro).toBe(DEFAULT_LEGAL_PAGES.privacy.intro);
  });

  test("accepts an override that is at least as current as the bundled notice", () => {
    const merged = mergeLegalPages({
      privacy: {
        ...DEFAULT_LEGAL_PAGES.privacy,
        intro: "Approved current notice",
        lastUpdated: "2026-08-03",
      },
    });

    expect(merged.privacy.intro).toBe("Approved current notice");
  });
});
