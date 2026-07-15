import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Edit3, FileText, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { doc, getDoc, serverTimestamp, setDoc } from "../../lib/dataCompat";
import { db } from "../../lib/backend";
import {
  cloneLegalPages,
  DEFAULT_LEGAL_PAGES,
  LEGAL_PAGE_LABELS,
  LegalPageKey,
  LegalPagesContent,
  formatLegalDate,
  mergeLegalPages,
} from "../../lib/legalContent";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { useSearchParams } from "react-router-dom";

const pageKeys = Object.keys(LEGAL_PAGE_LABELS) as LegalPageKey[];

export default function AdminLegalPages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState<LegalPagesContent>(cloneLegalPages(DEFAULT_LEGAL_PAGES));
  const [publishedPages, setPublishedPages] = useState<LegalPagesContent>(cloneLegalPages(DEFAULT_LEGAL_PAGES));
  const [isEditing, setIsEditing] = useState(false);
  const requestedPage = searchParams.get("legalPage");
  const activePage: LegalPageKey = pageKeys.includes(requestedPage as LegalPageKey)
    ? requestedPage as LegalPageKey
    : "privacy";
  const setActivePage = (page: LegalPageKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (page === "privacy") nextParams.delete("legalPage");
    else nextParams.set("legalPage", page);
    setError("");
    setSearchParams(nextParams);
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPage, setSavedPage] = useState<LegalPageKey | null>(null);
  const [error, setError] = useState("");
  const editRevisions = useRef<Record<LegalPageKey, number>>({
    privacy: 0,
    dataDeletion: 0,
    terms: 0,
  });

  useEffect(() => {
    getDoc(doc(db, "settings", "legal-pages"))
      .then(async (snapshot) => {
        if (snapshot.exists()) {
          const loadedPages = mergeLegalPages(snapshot.data().pages);
          setPages(loadedPages);
          setPublishedPages(cloneLegalPages(loadedPages));
        } else {
          await setDoc(doc(db, "settings", "legal-pages"), {
            pages: DEFAULT_LEGAL_PAGES,
            updatedAt: serverTimestamp(),
          });
        }
      })
      .catch((loadError) => {
        console.error("Could not load legal pages:", loadError);
        setError("The legal-page content could not be loaded.");
      })
      .finally(() => setLoading(false));
  }, []);

  const updatePage = (patch: Partial<LegalPagesContent[LegalPageKey]>) => {
    editRevisions.current[activePage] += 1;
    setSavedPage((current) => current === activePage ? null : current);
    setPages((current) => ({
      ...current,
      [activePage]: { ...current[activePage], ...patch },
    }));
  };

  const updateSection = (index: number, field: "title" | "body", value: string) => {
    const sections = pages[activePage].sections.map((section, sectionIndex) =>
      sectionIndex === index ? { ...section, [field]: value } : section,
    );
    updatePage({ sections });
  };

  const addSection = () => updatePage({
    sections: [...pages[activePage].sections, { title: "New section", body: "" }],
  });

  const removeSection = (index: number) => updatePage({
    sections: pages[activePage].sections.filter((_, sectionIndex) => sectionIndex !== index),
  });

  const save = async () => {
    setError("");
    const pageKey = activePage;
    const pageToSave = pages[pageKey];
    const revisionToSave = editRevisions.current[pageKey];

    if (!pageToSave.title.trim() || !pageToSave.intro.trim() || !pageToSave.lastUpdated) {
      setError("This page needs a title, introduction, and last-updated date.");
      return;
    }
    if (pageToSave.sections.some((section) => !section.title.trim() || !section.body.trim())) {
      setError("Section titles and content cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "legal-pages"), {
        [`pages.${pageKey}`]: pageToSave,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      if (editRevisions.current[pageKey] === revisionToSave) {
        setPublishedPages((current) => ({
          ...current,
          [pageKey]: cloneLegalPages({ ...pages, [pageKey]: pageToSave })[pageKey],
        }));
        setSavedPage(pageKey);
        setIsEditing(false);
      }
    } catch (saveError) {
      console.error(`Could not save ${LEGAL_PAGE_LABELS[pageKey]}:`, saveError);
      setError("The changes could not be saved. Confirm that you are signed in as an administrator.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setPages((current) => ({
      ...current,
      [activePage]: cloneLegalPages(publishedPages)[activePage],
    }));
    editRevisions.current[activePage] = 0;
    setError("");
    setIsEditing(false);
  };

  if (loading) return <PageSkeleton variant="form" />;
  const page = isEditing ? pages[activePage] : publishedPages[activePage];
  const fieldClass = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-white";

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Legal Pages</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {isEditing ? "Edit the public legal content and displayed update date." : "Preview the legal content currently displayed to the public."}
          </p>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button type="button" onClick={cancelEditing} disabled={saving} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 text-sm font-semibold text-[#1b1b1b] transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#1b1b1b] px-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => { setError(""); setSavedPage(null); setIsEditing(true); }} className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg bg-[#1b1b1b] px-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100 sm:self-auto">
            <Edit3 className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
        {pageKeys.map((key) => (
          <button key={key} type="button" onClick={() => setActivePage(key)} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${activePage === key ? "bg-[#1b1b1b] text-white dark:bg-white dark:text-[#1b1b1b]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"}`}>
            {LEGAL_PAGE_LABELS[key]}
          </button>
        ))}
      </div>

      {savedPage === activePage && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />This page was saved and published.</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

      {isEditing ? (
        <div className="space-y-7 animate-in fade-in duration-300">
          <div className="space-y-5">
            <label className="block space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              <span>Page title</span>
              <input value={page.title} onChange={(event) => updatePage({ title: event.target.value })} maxLength={120} className={fieldClass} />
            </label>
            <label className="block space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              <span>Introduction</span>
              <textarea value={page.intro} onChange={(event) => updatePage({ intro: event.target.value })} rows={3} maxLength={1000} className={`${fieldClass} resize-y`} />
            </label>
            <label className="block max-w-xs space-y-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              <span>Last updated</span>
              <input type="date" value={page.lastUpdated} onChange={(event) => updatePage({ lastUpdated: event.target.value })} className={fieldClass} />
            </label>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-gray-900 dark:text-white">Content sections</h2>
              <button type="button" onClick={addSection} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Plus className="h-4 w-4" />Add section</button>
            </div>
            {page.sections.map((section, index) => (
              <div key={index} className="space-y-4 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Section {index + 1}</span>
                  <button type="button" onClick={() => removeSection(index)} aria-label={`Remove section ${index + 1}`} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" /></button>
                </div>
                <input value={section.title} onChange={(event) => updateSection(index, "title", event.target.value)} maxLength={160} aria-label={`Section ${index + 1} title`} className={fieldClass} />
                <textarea value={section.body} onChange={(event) => updateSection(index, "body", event.target.value)} rows={6} maxLength={10000} aria-label={`Section ${index + 1} content`} className={`${fieldClass} resize-y`} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <article className="mx-auto max-w-4xl animate-in fade-in duration-300">
          <p className="mb-3 text-sm font-semibold text-gray-500 dark:text-gray-400">Last updated: {formatLegalDate(page.lastUpdated)}</p>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl">{page.title}</h1>
          <p className="mt-6 text-lg leading-8 text-gray-600 dark:text-gray-300">{page.intro}</p>
          <div className="mt-12 space-y-10 text-[15px] leading-7 text-gray-600 dark:text-gray-300">
            {page.sections.map((section, index) => (
              <section key={`${section.title}-${index}`}>
                <h2 className="mb-3 text-xl font-bold text-gray-900 dark:text-white">{section.title}</h2>
                {section.body.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
                  <p key={paragraphIndex} className={paragraphIndex ? "mt-3" : ""}>{paragraph}</p>
                ))}
              </section>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}
