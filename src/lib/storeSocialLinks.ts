export type StoreSocialLink = {
  url: string;
};

export type SocialPlatform =
  | "facebook"
  | "instagram"
  | "tiktok"
  | "x"
  | "youtube"
  | "linkedin"
  | "pinterest"
  | "threads"
  | "snapchat"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "generic";

export type SocialLinkPresentation = {
  platform: SocialPlatform;
  label: string;
  url: string;
  hostname: string;
};

const INVALID_SOCIAL_LINK_MESSAGE = "Enter a valid social media URL.";

const matchesHost = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

const PLATFORM_DOMAINS: Array<{
  platform: Exclude<SocialPlatform, "generic">;
  label: string;
  domains: string[];
}> = [
  { platform: "facebook", label: "Facebook", domains: ["facebook.com", "fb.com"] },
  { platform: "instagram", label: "Instagram", domains: ["instagram.com"] },
  { platform: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
  { platform: "x", label: "X", domains: ["x.com", "twitter.com"] },
  { platform: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { platform: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
  { platform: "pinterest", label: "Pinterest", domains: ["pinterest.com", "pin.it"] },
  { platform: "threads", label: "Threads", domains: ["threads.net"] },
  { platform: "snapchat", label: "Snapchat", domains: ["snapchat.com"] },
  { platform: "whatsapp", label: "WhatsApp", domains: ["whatsapp.com", "wa.me"] },
  { platform: "telegram", label: "Telegram", domains: ["telegram.me", "t.me"] },
  { platform: "discord", label: "Discord", domains: ["discord.com", "discord.gg"] },
];

export function normalizeSocialLinkUrl(value: string) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) throw new Error(INVALID_SOCIAL_LINK_MESSAGE);

  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const hasValidHostname = hostname.includes(".")
      && !hostname.startsWith(".")
      && !hostname.endsWith(".");

    if (
      !["http:", "https:"].includes(parsed.protocol)
      || parsed.username
      || parsed.password
      || !hasValidHostname
    ) {
      throw new Error(INVALID_SOCIAL_LINK_MESSAGE);
    }

    return parsed.toString();
  } catch {
    throw new Error(INVALID_SOCIAL_LINK_MESSAGE);
  }
}

export function getSocialLinkPresentation(value: string): SocialLinkPresentation {
  const url = normalizeSocialLinkUrl(value);
  const hostname = new URL(url).hostname.toLowerCase();
  const knownPlatform = PLATFORM_DOMAINS.find(({ domains }) =>
    domains.some((domain) => matchesHost(hostname, domain)),
  );

  if (!knownPlatform) {
    return {
      platform: "generic",
      label: hostname.replace(/^www\./, ""),
      url,
      hostname,
    };
  }

  return {
    platform: knownPlatform.platform,
    label: knownPlatform.label,
    url,
    hostname,
  };
}

export function normalizeSocialLinks(values: StoreSocialLink[] | null | undefined) {
  return (Array.isArray(values) ? values : [])
    .filter((link) => String(link?.url ?? "").trim())
    .map((link) => ({ url: normalizeSocialLinkUrl(link.url) }));
}
