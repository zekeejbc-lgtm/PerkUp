export type HomepageVideoAudience = "customer" | "business";

export type HomepageVideoConfig = {
  id: string;
  audience: HomepageVideoAudience;
  title: string;
  description: string;
  url: string;
  enabled: boolean;
};

export type HowItWorksConfig = {
  enabled: boolean;
  heading: string;
  subheading: string;
  videos: HomepageVideoConfig[];
};

export type VideoSource =
  | { kind: "youtube"; embedUrl: string; posterUrl: string; videoId: string }
  | { kind: "facebook" | "drive" | "vimeo" | "loom" | "generic"; embedUrl: string }
  | { kind: "direct"; embedUrl: string };

export const DEFAULT_HOW_IT_WORKS_CONFIG: HowItWorksConfig = {
  enabled: true,
  heading: "How does it work?",
  subheading: "See how Perk makes loyalty simple for customers and local businesses.",
  videos: [],
};

const safeHttpUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed : null;
  } catch {
    return null;
  }
};

const youtubeId = (url: URL) => {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  if (!["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return "";
  if (url.pathname === "/watch") return url.searchParams.get("v") || "";
  const parts = url.pathname.split("/").filter(Boolean);
  return ["embed", "shorts", "live"].includes(parts[0] || "") ? parts[1] || "" : "";
};

const driveId = (url: URL) => {
  const host = url.hostname.toLowerCase();
  if (host !== "drive.google.com" && host !== "docs.google.com") return "";
  const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
  return fileMatch?.[1] || url.searchParams.get("id") || "";
};

export const resolveVideoSource = (value: string): VideoSource | null => {
  const url = safeHttpUrl(value);
  if (!url) return null;

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const id = youtubeId(url);
  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    return {
      kind: "youtube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`,
      posterUrl: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      videoId: id,
    };
  }

  const googleDriveId = driveId(url);
  if (googleDriveId) {
    const resourceKey = url.searchParams.get("resourcekey");
    const previewUrl = `https://drive.google.com/file/d/${encodeURIComponent(googleDriveId)}/preview`;
    return {
      kind: "drive",
      embedUrl: resourceKey ? `${previewUrl}?resourcekey=${encodeURIComponent(resourceKey)}` : previewUrl,
    };
  }

  if (host === "facebook.com" || host === "m.facebook.com" || host === "fb.watch") {
    return {
      kind: "facebook",
      embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url.toString())}&show_text=false`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const vimeoId = url.pathname.split("/").filter(Boolean).find((part) => /^\d+$/.test(part));
    if (vimeoId) return { kind: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoId}` };
  }

  if (host === "loom.com" || host === "www.loom.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const shareIndex = parts.findIndex((part) => part === "share" || part === "embed");
    if (shareIndex >= 0 && parts[shareIndex + 1]) {
      return { kind: "loom", embedUrl: `https://www.loom.com/embed/${encodeURIComponent(parts[shareIndex + 1])}` };
    }
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i.test(url.toString())) {
    return { kind: "direct", embedUrl: url.toString() };
  }

  return { kind: "generic", embedUrl: url.toString() };
};

export const normalizeHowItWorksConfig = (value?: Partial<HowItWorksConfig> | null): HowItWorksConfig => ({
  ...DEFAULT_HOW_IT_WORKS_CONFIG,
  ...(value || {}),
  videos: Array.isArray(value?.videos)
    ? value.videos
        .filter((video): video is HomepageVideoConfig => Boolean(video && typeof video === "object"))
        .map((video, index) => ({
          id: String(video.id || `video-${index + 1}`),
          audience: video.audience === "business" ? "business" : "customer",
          title: String(video.title || (video.audience === "business" ? "Business owner demo" : "Customer demo")),
          description: String(video.description || ""),
          url: String(video.url || ""),
          enabled: video.enabled !== false,
        }))
    : [],
});

export const isValidVideoLink = (value: string) => Boolean(resolveVideoSource(value));
