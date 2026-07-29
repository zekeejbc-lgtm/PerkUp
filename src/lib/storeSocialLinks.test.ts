import { describe, expect, it } from "vitest";
import {
  getSocialLinkPresentation,
  normalizeSocialLinks,
  normalizeSocialLinkUrl,
} from "./storeSocialLinks";

describe("store social links", () => {
  it("trims links and supplies an HTTPS scheme", () => {
    expect(normalizeSocialLinkUrl(" instagram.com/perkup ")).toBe("https://instagram.com/perkup");
  });

  it.each(["javascript:alert(1)", "mailto:owner@example.com", "not a domain"])(
    "rejects unsafe or malformed URL %s",
    (value) => expect(() => normalizeSocialLinkUrl(value)).toThrow("valid social media URL"),
  );

  it.each([
    ["https://m.facebook.com/perkup", "facebook", "Facebook"],
    ["https://instagram.com/perkup", "instagram", "Instagram"],
    ["https://tiktok.com/@perkup", "tiktok", "TikTok"],
    ["https://x.com/perkup", "x", "X"],
    ["https://twitter.com/perkup", "x", "X"],
    ["https://youtube.com/@perkup", "youtube", "YouTube"],
    ["https://linkedin.com/company/perkup", "linkedin", "LinkedIn"],
    ["https://pinterest.com/perkup", "pinterest", "Pinterest"],
    ["https://threads.net/@perkup", "threads", "Threads"],
    ["https://snapchat.com/add/perkup", "snapchat", "Snapchat"],
    ["https://wa.me/639123456789", "whatsapp", "WhatsApp"],
    ["https://t.me/perkup", "telegram", "Telegram"],
    ["https://discord.gg/example", "discord", "Discord"],
  ] as const)("detects %s", (url, platform, label) => {
    expect(getSocialLinkPresentation(url)).toMatchObject({ platform, label });
  });

  it("does not classify lookalike hostnames as known platforms", () => {
    expect(getSocialLinkPresentation("https://facebook.com.example.org/page")).toMatchObject({
      platform: "generic",
      label: "facebook.com.example.org",
    });
  });

  it("keeps duplicate, same-platform, ordered, and arbitrarily long lists", () => {
    const values = Array.from({ length: 40 }, (_, index) => ({
      url: index % 2 ? "instagram.com/second" : "instagram.com/first",
    }));
    expect(normalizeSocialLinks(values)).toHaveLength(40);
    expect(normalizeSocialLinks(values)[0]).toEqual({ url: "https://instagram.com/first" });
    expect(normalizeSocialLinks(values)[1]).toEqual({ url: "https://instagram.com/second" });
  });

  it("drops blank rows", () => {
    expect(normalizeSocialLinks([{ url: "" }, { url: "  " }, { url: "x.com/perkup" }]))
      .toEqual([{ url: "https://x.com/perkup" }]);
  });
});
