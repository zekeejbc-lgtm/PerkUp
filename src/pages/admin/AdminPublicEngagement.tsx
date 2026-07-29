import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Inbox, Loader2, Mail, MessageSquareText, RefreshCw, Search, X } from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";
import { invokeAdminBackend } from "../../lib/adminBackend";

type FeedbackStatus = "received" | "reviewing" | "planned" | "in_progress" | "resolved" | "closed";
type ErrorStatus = "open" | "in_progress" | "fixed";
type FeedbackItem = {
  id: string; publicId: string; name: string; email: string; category: string; message: string; referenceNumber: string; legacyReferenceNumber: string;
  status: FeedbackStatus; publicResponse: string; internalNotes: string; createdAt: string; statusUpdatedAt: string; updatedAt: string;
};
type ErrorReport = {
  id: string; publicId: string; errorCode: string; status: ErrorStatus; message: string; stack: string; pageUrl: string; route: string;
  userAgent: string; appVersion: string; context: Record<string, unknown>; reporterUserId: string; reporterRole: string;
  internalNotes: string; createdAt: string; statusUpdatedAt: string; updatedAt: string; resolvedAt: string;
};
type Subscriber = { id: string; email: string; created_at: string };
type InboxTab = "errors" | "feedback" | "newsletter";

const PAGE_SIZE = 10;
const FEEDBACK_STATUS_OPTIONS = [
  { label: "Received", value: "received" }, { label: "Under review", value: "reviewing" },
  { label: "Planned", value: "planned" }, { label: "In progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" }, { label: "Closed", value: "closed" },
];
const ERROR_STATUS_OPTIONS = [
  { label: "Open", value: "open" }, { label: "In progress", value: "in_progress" }, { label: "Fixed", value: "fixed" },
];
const FEEDBACK_STATUS_LABELS = Object.fromEntries(FEEDBACK_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const ERROR_STATUS_LABELS = Object.fromEntries(ERROR_STATUS_OPTIONS.map((option) => [option.value, option.label]));

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
}).format(new Date(value));

const statusClass = (status: string) => status === "fixed" || status === "resolved" || status === "closed"
  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
  : status === "in_progress" || status === "reviewing"
    ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
    : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";

export default function AdminPublicEngagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<InboxTab>("errors");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [selectedError, setSelectedError] = useState<ErrorReport | null>(null);
  const [editFeedbackStatus, setEditFeedbackStatus] = useState<FeedbackStatus>("received");
  const [editErrorStatus, setEditErrorStatus] = useState<ErrorStatus>("open");
  const [publicResponse, setPublicResponse] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "admin" || user?.role === "assistant_admin" || user?.role === "auditor";

  useEffect(() => {
    let active = true;
    setLoading(true);
    invokeAdminBackend<{ feedback: FeedbackItem[]; subscribers: Subscriber[]; errorReports: ErrorReport[] }>({ action: "list_public_engagement" })
      .then((result) => {
        if (!active) return;
        setFeedback(result.feedback);
        setSubscribers(result.subscribers);
        setErrorReports(result.errorReports || []);
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Inbox data could not be loaded.";
        toast.error(message, { error, reportable: !/session has expired|sign in again|authentication required/i.test(message) });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => { setPage(1); setStatusFilter("all"); }, [search, tab]);

  const filteredFeedback = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feedback.filter((item) => (statusFilter === "all" || item.status === statusFilter) &&
      (!query || [item.publicId, item.referenceNumber, item.legacyReferenceNumber, item.name, item.email, item.category, item.message].some((value) => value.toLowerCase().includes(query))));
  }, [feedback, search, statusFilter]);
  const filteredErrors = useMemo(() => {
    const query = search.trim().toLowerCase();
    return errorReports.filter((item) => (statusFilter === "all" || item.status === statusFilter) &&
      (!query || [item.publicId, item.errorCode, item.message, item.route, item.reporterRole].some((value) => value.toLowerCase().includes(query))));
  }, [errorReports, search, statusFilter]);
  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return subscribers.filter((subscriber) => !query || subscriber.email.toLowerCase().includes(query));
  }, [subscribers, search]);
  const activeItems = tab === "errors" ? filteredErrors : tab === "feedback" ? filteredFeedback : filteredSubscribers;
  const paginatedItems = activeItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openFeedback = (item: FeedbackItem) => {
    setSelectedFeedback(item); setEditFeedbackStatus(item.status); setPublicResponse(item.publicResponse); setInternalNotes(item.internalNotes);
  };
  const openError = (item: ErrorReport) => {
    setSelectedError(item); setEditErrorStatus(item.status); setInternalNotes(item.internalNotes);
  };

  const saveFeedback = async () => {
    if (!selectedFeedback || !canEdit) return;
    setSaving(true);
    try {
      const result = await invokeAdminBackend<{ feedback: Partial<FeedbackItem> & { id: string } }>({
        action: "update_public_feedback", feedbackId: selectedFeedback.id, status: editFeedbackStatus, publicResponse, internalNotes,
      });
      setFeedback((items) => items.map((item) => item.id === selectedFeedback.id ? { ...item, ...result.feedback } : item));
      setSelectedFeedback(null);
      toast.success("Feedback status and response updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Feedback could not be updated.", { error });
    } finally { setSaving(false); }
  };

  const saveErrorReport = async () => {
    if (!selectedError || !canEdit) return;
    setSaving(true);
    try {
      const result = await invokeAdminBackend<{ errorReport: Partial<ErrorReport> & { id: string } }>({
        action: "update_error_report", reportId: selectedError.id, status: editErrorStatus, internalNotes,
      });
      setErrorReports((items) => items.map((item) => item.id === selectedError.id ? { ...item, ...result.errorReport } : item));
      setSelectedError(null);
      toast.success(`Error ${selectedError.errorCode} marked ${ERROR_STATUS_LABELS[editErrorStatus].toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error report could not be updated.", { error });
    } finally { setSaving(false); }
  };

  const refreshInbox = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const result = await invokeAdminBackend<{ feedback: FeedbackItem[]; subscribers: Subscriber[]; errorReports: ErrorReport[] }>({ action: "list_public_engagement" });
      setFeedback(result.feedback);
      setSubscribers(result.subscribers);
      setErrorReports(result.errorReports || []);
      toast.success("Inbox refreshed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inbox could not be refreshed.";
      toast.error(message, { error, reportable: !/session has expired|sign in again|authentication required/i.test(message) });
    } finally {
      setRefreshing(false);
    }
  };

  const tabButton = (value: InboxTab, label: string, count: number) => (
    <button onClick={() => setTab(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${tab === value ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500"}`}>
      {label} <span className="ml-1 text-xs">{count}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-5 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><Inbox className="h-5 w-5 text-gray-500" /><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Admin Inbox</h3><p className="text-sm text-gray-500">Technical errors, public feedback, and newsletter signups</p></div></div>
        <div className="flex max-w-full items-center gap-2">
          <button
            type="button"
            onClick={() => void refreshInbox()}
            disabled={loading || refreshing}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            aria-label="Refresh admin inbox"
            title="Refresh inbox"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
          </button>
          <div className="flex max-w-full overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {tabButton("errors", "Errors", errorReports.length)}{tabButton("feedback", "Feedback", feedback.length)}{tabButton("newsletter", "Newsletter", subscribers.length)}
          </div>
        </div>
      </div>

      <div className={`grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 ${tab !== "newsletter" ? "sm:grid-cols-[minmax(0,1fr)_12rem]" : ""}`}>
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "errors" ? "Search code, error, route, or role" : tab === "feedback" ? "Search reference, sender, email, or message" : "Search subscriber email"} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
        {tab !== "newsletter" && <CustomDropdown value={statusFilter} onChange={setStatusFilter} options={[{ label: "All statuses", value: "all" }, ...(tab === "errors" ? ERROR_STATUS_OPTIONS : FEEDBACK_STATUS_OPTIONS)]} />}
      </div>

      {loading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
        : tab === "errors" ? filteredErrors.length ? <ScrollableRegion label="Error reports" className="divide-y divide-gray-100 dark:divide-gray-800">{(paginatedItems as ErrorReport[]).map((item) => <button key={item.id} onClick={() => openError(item)} className="grid w-full gap-3 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:grid-cols-[minmax(0,1fr)_9rem_10rem] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-red-600 dark:text-red-400">{item.publicId || item.errorCode}</span>{item.reporterRole && <span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.reporterRole.replaceAll("_", " ")}</span>}</div><p className="mt-2 truncate font-semibold text-gray-900 dark:text-white">{item.message}</p><p className="mt-1 truncate text-sm text-gray-500">{item.route || "Unknown page"}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>{ERROR_STATUS_LABELS[item.status]}</span><span className="text-xs text-gray-500 sm:text-right">{formatDate(item.createdAt)}</span></button>)}</ScrollableRegion> : <EmptyState icon={AlertTriangle} title="No error reports found" description="One-click reports from failed toasts will appear here." />
        : tab === "feedback" ? filteredFeedback.length ? <ScrollableRegion label="Public feedback submissions" className="divide-y divide-gray-100 dark:divide-gray-800">{(paginatedItems as FeedbackItem[]).map((item) => <button key={item.id} onClick={() => openFeedback(item)} className="grid w-full gap-3 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:grid-cols-[minmax(0,1fr)_9rem_10rem] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-gray-500">{item.referenceNumber}</span><span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.category}</span></div><p className="mt-2 truncate font-semibold text-gray-900 dark:text-white">{item.message}</p><p className="mt-1 truncate text-sm text-gray-500">{item.name || "Anonymous"}{item.email ? ` · ${item.email}` : " · No email"}</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${statusClass(item.status)}`}>{FEEDBACK_STATUS_LABELS[item.status]}</span><span className="text-xs text-gray-500 sm:text-right">{formatDate(item.createdAt)}</span></button>)}</ScrollableRegion> : <EmptyState icon={MessageSquareText} title="No feedback found" description="New public feedback and matching search results will appear here." />
        : filteredSubscribers.length ? <ScrollableRegion label="Newsletter subscribers" className="divide-y divide-gray-100 dark:divide-gray-800">{(paginatedItems as Subscriber[]).map((subscriber) => <div key={subscriber.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="rounded-xl bg-gray-100 p-2 dark:bg-gray-800"><Mail className="h-4 w-4 text-gray-500" /></span><a href={`mailto:${subscriber.email}`} className="font-semibold text-gray-900 hover:underline dark:text-white">{subscriber.email}</a></div><span className="text-xs text-gray-500">Subscribed {formatDate(subscriber.created_at)}</span></div>)}</ScrollableRegion> : <EmptyState icon={Mail} title="No subscribers found" description="Newsletter signups and matching search results will appear here." />}

      {!loading && <Pagination page={page} pageSize={PAGE_SIZE} totalItems={activeItems.length} onPageChange={setPage} itemLabel={tab === "errors" ? "error reports" : tab === "feedback" ? "feedback submissions" : "subscribers"} />}

      {selectedError && <Modal onClose={() => setSelectedError(null)} title="Error report" eyebrow={selectedError.publicId || selectedError.errorCode}>
        <dl className="grid gap-4 rounded-2xl bg-gray-50 p-4 text-sm dark:bg-gray-800/60 sm:grid-cols-2">
          <Detail label="Reported" value={formatDate(selectedError.createdAt)} /><Detail label="Reporter" value={selectedError.reporterRole ? selectedError.reporterRole.replaceAll("_", " ") : "Anonymous visitor"} />
          <Detail label="Route" value={selectedError.route || "Unknown"} /><Detail label="App version" value={selectedError.appVersion || "Unknown"} />
          <div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Message</dt><dd className="mt-2 whitespace-pre-wrap break-words text-gray-800 dark:text-gray-200">{selectedError.message}</dd></div>
          {selectedError.pageUrl && <div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Page</dt><dd className="mt-1"><a href={selectedError.pageUrl} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-blue-600 hover:underline dark:text-blue-400">{selectedError.pageUrl}<ExternalLink className="h-3 w-3 shrink-0" /></a></dd></div>}
          {selectedError.stack && <div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Technical details</dt><dd><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950 p-3 text-xs text-gray-100">{selectedError.stack}</pre></dd></div>}
          {Object.keys(selectedError.context).length > 0 && <div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Context</dt><dd><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950 p-3 text-xs text-gray-100">{JSON.stringify(selectedError.context, null, 2)}</pre></dd></div>}
        </dl>
        <div className="mt-6 space-y-5"><label className="block text-sm font-semibold">Status<CustomDropdown value={editErrorStatus} onChange={(value) => setEditErrorStatus(value as ErrorStatus)} options={ERROR_STATUS_OPTIONS} className="mt-2" disabled={!canEdit} /></label><label className="block text-sm font-semibold">Internal notes<textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} maxLength={4000} rows={4} disabled={!canEdit} placeholder="Investigation notes, fix, or release reference" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white" /></label>{!canEdit && <p className="text-sm text-amber-700 dark:text-amber-300">Auditor accounts have read-only access.</p>}</div>
        <ModalActions canEdit={canEdit} saving={saving} onClose={() => setSelectedError(null)} onSave={saveErrorReport} />
      </Modal>}

      {selectedFeedback && <Modal onClose={() => setSelectedFeedback(null)} title="Feedback details" eyebrow={selectedFeedback.referenceNumber}>
        <dl className="grid gap-4 rounded-2xl bg-gray-50 p-4 text-sm dark:bg-gray-800/60 sm:grid-cols-2"><Detail label="Sender" value={selectedFeedback.name || "Anonymous"} /><Detail label="Email" value={selectedFeedback.email || "Not provided"} /><Detail label="Type" value={selectedFeedback.category} /><Detail label="Submitted" value={formatDate(selectedFeedback.createdAt)} /><div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Message</dt><dd className="mt-2 whitespace-pre-wrap text-gray-800 dark:text-gray-200">{selectedFeedback.message}</dd></div></dl>
        <div className="mt-6 space-y-5"><label className="block text-sm font-semibold">Status<CustomDropdown value={editFeedbackStatus} onChange={(value) => setEditFeedbackStatus(value as FeedbackStatus)} options={FEEDBACK_STATUS_OPTIONS} className="mt-2" disabled={!canEdit} /></label><label className="block text-sm font-semibold">Public response<textarea value={publicResponse} onChange={(event) => setPublicResponse(event.target.value)} maxLength={2000} rows={5} disabled={!canEdit} placeholder="Visible to the sender in the lookup tool" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white" /></label><label className="block text-sm font-semibold">Internal notes<textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} maxLength={4000} rows={3} disabled={!canEdit} placeholder="Only visible to admins" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white" /></label>{!canEdit && <p className="text-sm text-amber-700 dark:text-amber-300">Auditor accounts have read-only access.</p>}</div>
        <ModalActions canEdit={canEdit} saving={saving} onClose={() => setSelectedFeedback(null)} onSave={saveFeedback} />
      </Modal>}
    </div>
  );
}

function Modal({ onClose, title, eyebrow, children }: { onClose: () => void; title: string; eyebrow: string; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-gray-500">{eyebrow}</p><h3 className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{title}</h3></div><button onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X className="h-5 w-5" /></button></div><div className="mt-6">{children}</div></div></div>;
}

function ModalActions({ canEdit, saving, onClose, onSave }: { canEdit: boolean; saving: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="mt-7 flex justify-end gap-3"><button onClick={onClose} className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Close</button>{canEdit && <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save update</button>}</div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-semibold text-gray-500">{label}</dt><dd className="mt-1 break-all capitalize">{value}</dd></div>;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return <div className="p-14 text-center"><Icon className="mx-auto h-10 w-10 text-gray-300" /><h4 className="mt-3 font-semibold text-gray-900 dark:text-white">{title}</h4><p className="mt-1 text-sm text-gray-500">{description}</p></div>;
}
