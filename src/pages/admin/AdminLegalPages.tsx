import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { doc, getDoc, serverTimestamp, setDoc } from "../../lib/dataCompat";
import { db } from "../../lib/backend";
import {
  cloneLegalPages,
  DEFAULT_LEGAL_PAGES,
  LEGAL_PAGE_LABELS,
  LegalPageKey,
  LegalPagesContent,
  mergeLegalPages,
} from "../../lib/legalContent";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { useSearchParams } from "react-router-dom";

const pageKeys = Object.keys(LEGAL_PAGE_LABELS) as LegalPageKey[];

export default function AdminLegalPages() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pages, setPages] = useState<LegalPagesContent>(cloneLegalPages(DEFAULT_LEGAL_PAGES));
  const requestedPage = searchParams.get("legalPage");
  const activePage: LegalPageKey = pageKeys.includes(requestedPage as LegalPageKey)
    ? requestedPage as LegalPageKey
    : "privacy";
  const setActivePage = (page: LegalPageKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (page === "privacy") nextParams.delete("legalPage");
    else nextParams.set("legalPage", page);
    setSearchParams(nextParams);
  };
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getDoc(doc(db, "settings", "legal-pages"))
      .then(async (snapshot) => {
        if (snapshot.exists()) {
          setPages(mergeLegalPages(snapshot.data().pages));
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
    setSaved(false);
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
    if (pageKeys.some((key) => !pages[key].title.trim() || !pages[key].intro.trim() || !pages[key].lastUpdated)) {
      setError("Every page needs a title, introduction, and last-updated date.");
      return;
    }
    if (pageKeys.some((key) => pages[key].sections.some((section) => !section.title.trim() || !section.body.trim()))) {
      setError("Section titles and content cannot be empty.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "legal-pages"), {
        pages,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setSaved(true);
    } catch (saveError) {
      console.error("Could not save legal pages:", saveError);
      setError("The changes could not be saved. Confirm that you are signed in as an administrator.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageSkeleton />;
  const page = pages[activePage];
  const fieldClass = "w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-white";

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Legal Pages</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Edit the public legal content and displayed update dates.</p>
        </div>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save all pages
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-800">
        {pageKeys.map((key) => (
          <button key={key} type="button" onClick={() => setActivePage(key)} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${activePage === key ? "bg-[#1b1b1b] text-white dark:bg-white dark:text-[#1b1b1b]" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"}`}>
            {LEGAL_PAGE_LABELS[key]}
          </button>
        ))}
      </div>

      {saved && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" />Changes saved and published.</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">{error}</div>}

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
  );
}
