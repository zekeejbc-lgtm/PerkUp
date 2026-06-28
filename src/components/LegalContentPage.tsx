import { useEffect, useState } from "react";
import { PublicPageShell } from "./PublicPageShell";
import { doc, getDoc } from "../lib/dataCompat";
import { db } from "../lib/backend";
import { DEFAULT_LEGAL_PAGES, formatLegalDate, LegalPageContent, LegalPageKey, mergeLegalPages } from "../lib/legalContent";

export function LegalContentPage({ pageKey }: { pageKey: LegalPageKey }) {
  const [content, setContent] = useState<LegalPageContent>(DEFAULT_LEGAL_PAGES[pageKey]);

  useEffect(() => {
    let active = true;
    getDoc(doc(db, "settings", "legal-pages"))
      .then((snapshot) => {
        if (active && snapshot.exists()) {
          setContent(mergeLegalPages(snapshot.data().pages)[pageKey]);
        }
      })
      .catch((error) => console.error("Could not load legal page content:", error));
    return () => { active = false; };
  }, [pageKey]);

  return (
    <PublicPageShell>
      <article>
        <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Last updated: {formatLegalDate(content.lastUpdated)}</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{content.title}</h1>
        <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">{content.intro}</p>
        <div className="mt-12 space-y-10 text-[15px] leading-7 text-gray-600 dark:text-gray-300">
          {content.sections.map((section, index) => (
            <section key={`${section.title}-${index}`}>
              <h2 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">{section.title}</h2>
              {section.body.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex} className={paragraphIndex ? "mt-3" : ""}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </PublicPageShell>
  );
}
