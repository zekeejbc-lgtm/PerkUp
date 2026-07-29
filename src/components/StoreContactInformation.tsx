import { Globe, Phone } from "lucide-react";
import type { StoreSocialLink } from "../lib/storeSocialLinks";
import {
  getValidSocialLinkPresentations,
  StoreSocialLinksList,
} from "./StoreSocialLinks";

export function StoreContactInformation({
  contact,
  website,
  socialLinks,
}: {
  contact?: string;
  website?: string;
  socialLinks?: StoreSocialLink[] | null;
}) {
  const validSocialLinks = getValidSocialLinkPresentations(socialLinks);
  const isEmpty = !contact && !website && validSocialLinks.length === 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition-colors dark:border-gray-800 dark:bg-gray-900">
      <div className="border-b border-gray-100 p-6 transition-colors dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 transition-colors dark:text-white">
          Contact Information
        </h3>
      </div>
      <div className="divide-y divide-gray-100 transition-colors dark:divide-gray-800">
        {contact && (
          <a
            href={`tel:${contact}`}
            className="flex items-center gap-4 p-6 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <Phone className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden />
            <span className="font-medium text-gray-700 transition-colors dark:text-gray-300">
              {contact}
            </span>
          </a>
        )}
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-6 transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
          >
            <Globe className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden />
            <span className="truncate font-medium text-gray-700 transition-colors dark:text-gray-300">
              {website.replace(/^https?:\/\//, "")}
            </span>
          </a>
        )}
        <StoreSocialLinksList links={socialLinks} />
        {isEmpty && (
          <div className="p-6 text-center text-sm text-gray-500 transition-colors dark:text-gray-400">
            No contact information provided.
          </div>
        )}
      </div>
    </div>
  );
}
