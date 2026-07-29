import type { ComponentType } from "react";
import { Globe2, Plus, Trash2 } from "lucide-react";
import {
  FaDiscord,
  FaFacebookF,
  FaInstagram,
  FaLinkedinIn,
  FaPinterestP,
  FaSnapchat,
  FaTelegram,
  FaThreads,
  FaTiktok,
  FaWhatsapp,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import {
  getSocialLinkPresentation,
  type SocialLinkPresentation,
  type SocialPlatform,
  type StoreSocialLink,
} from "../lib/storeSocialLinks";

type PlatformIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const PLATFORM_ICONS: Record<SocialPlatform, PlatformIcon> = {
  facebook: FaFacebookF,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  x: FaXTwitter,
  youtube: FaYoutube,
  linkedin: FaLinkedinIn,
  pinterest: FaPinterestP,
  threads: FaThreads,
  snapchat: FaSnapchat,
  whatsapp: FaWhatsapp,
  telegram: FaTelegram,
  discord: FaDiscord,
  generic: Globe2,
};

function toPresentation(value: string) {
  try {
    return getSocialLinkPresentation(value);
  } catch {
    return null;
  }
}

export function getValidSocialLinkPresentations(
  links: StoreSocialLink[] | null | undefined,
): SocialLinkPresentation[] {
  return (Array.isArray(links) ? links : [])
    .map((link) => toPresentation(String(link?.url ?? "")))
    .filter((link): link is SocialLinkPresentation => Boolean(link));
}

export function StoreSocialLinksEditor({
  value,
  onChange,
}: {
  value: StoreSocialLink[];
  onChange: (links: StoreSocialLink[]) => void;
}) {
  const links = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-4">
      {links.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Add the social pages customers should see for this branch.
        </p>
      )}

      {links.map((link, index) => {
        const presentation = link.url.trim() ? toPresentation(link.url) : null;
        const isInvalid = Boolean(link.url.trim()) && !presentation;
        const Icon = presentation ? PLATFORM_ICONS[presentation.platform] : Globe2;

        return (
          <div
            key={index}
            className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/70"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor={`store-social-link-${index}`}
                  className="text-sm font-semibold text-gray-900 dark:text-gray-200"
                >
                  Social media link {index + 1}
                </label>
                <input
                  id={`store-social-link-${index}`}
                  type="text"
                  inputMode="url"
                  value={link.url}
                  onChange={(event) => {
                    const next = [...links];
                    next[index] = { url: event.target.value };
                    onChange(next);
                  }}
                  placeholder="https://instagram.com/your-branch"
                  aria-invalid={isInvalid}
                  className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
                {isInvalid ? (
                  <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
                    Enter a valid social media URL.
                  </p>
                ) : presentation ? (
                  <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                    <Icon className="h-4 w-4" aria-hidden />
                    {presentation.label}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => onChange(links.filter((_, linkIndex) => linkIndex !== index))}
                aria-label={`Remove social link ${index + 1}`}
                className="mt-7 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => onChange([...links, { url: "" }])}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add social link
      </button>
    </div>
  );
}

export function StoreSocialLinksList({
  links,
}: {
  links: StoreSocialLink[] | null | undefined;
}) {
  return (
    <>
      {getValidSocialLinkPresentations(links).map((link, index) => {
        const Icon = PLATFORM_ICONS[link.platform];
        return (
          <a
            key={`${link.url}-${index}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${link.label}`}
            className="flex items-center gap-4 p-6 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <Icon className="h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
            <span className="truncate font-medium text-gray-700 dark:text-gray-300">
              {link.label}
            </span>
          </a>
        );
      })}
    </>
  );
}
