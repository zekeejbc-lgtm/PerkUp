import { describe, expect, test } from "vitest";
import { normalizeHowItWorksConfig, resolveVideoSource } from "./homepageVideos";

describe("homepage video links", () => {
  test.each([
    ["https://youtu.be/dQw4w9WgXcQ", "youtube", "youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://drive.google.com/file/d/abc123XYZ/view?usp=sharing", "drive", "drive.google.com/file/d/abc123XYZ/preview"],
    ["https://www.facebook.com/example/videos/123456", "facebook", "facebook.com/plugins/video.php"],
    ["https://vimeo.com/123456789", "vimeo", "player.vimeo.com/video/123456789"],
    ["https://cdn.example.com/demo.mp4", "direct", "cdn.example.com/demo.mp4"],
    ["https://example.com/videos/demo", "generic", "example.com/videos/demo"],
  ])("resolves %s", (url, kind, expectedUrlPart) => {
    const source = resolveVideoSource(url);
    expect(source?.kind).toBe(kind);
    expect(source?.embedUrl).toContain(expectedUrlPart);
  });

  test("rejects unsafe and malformed links", () => {
    expect(resolveVideoSource("javascript:alert(1)")).toBeNull();
    expect(resolveVideoSource("not a link")).toBeNull();
  });

  test("normalizes stored entries and preserves audience", () => {
    const config = normalizeHowItWorksConfig({
      videos: [{
        id: "owner",
        audience: "business",
        title: "",
        description: "",
        url: "https://example.com",
        enabled: true,
      }],
    });
    expect(config.videos[0]).toMatchObject({ id: "owner", audience: "business", title: "Business owner demo" });
  });
});
