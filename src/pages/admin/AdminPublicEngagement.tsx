import { useEffect, useMemo, useState } from "react";
import { Inbox, Loader2, Mail, MessageSquareText, Search, X } from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { Pagination } from "../../components/Pagination";
import { useToast } from "../../components/ToastProvider";
import { useAuth } from "../../contexts/AuthContext";
import { invokeAdminBackend } from "../../lib/adminBackend";

type FeedbackStatus = "received" | "reviewing" | "planned" | "in_progress" | "resolved" | "closed";
type FeedbackItem = {
  id: string;
  name: string;
  email: string;
  category: string;
  message: string;
  referenceNumber: string;
  status: FeedbackStatus;
  publicResponse: string;
  internalNotes: string;
  createdAt: string;
  statusUpdatedAt: string;
  updatedAt: string;
};
type Subscriber = { id: string; email: string; created_at: string };

const PAGE_SIZE = 10;
const STATUS_OPTIONS = [
  { label: "Received", value: "received" },
  { label: "Under review", value: "reviewing" },
  { label: "Planned", value: "planned" },
  { label: "In progress", value: "in_progress" },
  { label: "Resolved", value: "resolved" },
  { label: "Closed", value: "closed" },
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((option) => [option.value, option.label]));

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
}).format(new Date(value));

export default function AdminPublicEngagement() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"feedback" | "newsletter">("feedback");
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [editStatus, setEditStatus] = useState<FeedbackStatus>("received");
  const [publicResponse, setPublicResponse] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = user?.role === "admin" || user?.role === "assistant_admin";

  useEffect(() => {
    let active = true;
    setLoading(true);
    invokeAdminBackend<{ feedback: FeedbackItem[]; subscribers: Subscriber[] }>({ action: "list_public_engagement" })
      .then((result) => {
        if (!active) return;
        setFeedback(result.feedback);
        setSubscribers(result.subscribers);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Public engagement data could not be loaded."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => setPage(1), [search, statusFilter, tab]);

  const filteredFeedback = useMemo(() => {
    const query = search.trim().toLowerCase();
    return feedback.filter((item) => (
      (statusFilter === "all" || item.status === statusFilter) &&
      (!query || [item.referenceNumber, item.name, item.email, item.category, item.message].some((value) => value.toLowerCase().includes(query)))
    ));
  }, [feedback, search, statusFilter]);

  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return subscribers.filter((subscriber) => !query || subscriber.email.toLowerCase().includes(query));
  }, [subscribers, search]);
  const activeItems = tab === "feedback" ? filteredFeedback : filteredSubscribers;
  const paginatedItems = activeItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openFeedback = (item: FeedbackItem) => {
    setSelected(item);
    setEditStatus(item.status);
    setPublicResponse(item.publicResponse);
    setInternalNotes(item.internalNotes);
  };

  const saveFeedback = async () => {
    if (!selected || !canEdit) return;
    setSaving(true);
    try {
      const result = await invokeAdminBackend<{ feedback: Partial<FeedbackItem> & { id: string } }>({
        action: "update_public_feedback",
        feedbackId: selected.id,
        status: editStatus,
        publicResponse,
        internalNotes,
      });
      setFeedback((items) => items.map((item) => item.id === selected.id ? { ...item, ...result.feedback } : item));
      setSelected(null);
      toast.success("Feedback status and response updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Feedback could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><Inbox className="h-5 w-5 text-gray-500" /><div><h3 className="text-lg font-semibold text-gray-900 dark:text-white">Public Inbox</h3><p className="text-sm text-gray-500">Feedback submissions and newsletter signups</p></div></div>
        <div className="flex rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          <button onClick={() => setTab("feedback")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "feedback" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500"}`}>Feedback <span className="ml-1 text-xs">{feedback.length}</span></button>
          <button onClick={() => setTab("newsletter")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "newsletter" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-500"}`}>Newsletter <span className="ml-1 text-xs">{subscribers.length}</span></button>
        </div>
      </div>

      <div className={`grid gap-3 border-b border-gray-100 p-4 dark:border-gray-800 ${tab === "feedback" ? "sm:grid-cols-[minmax(0,1fr)_12rem]" : ""}`}>
        <label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === "feedback" ? "Search reference, sender, email, or message" : "Search subscriber email"} className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></label>
        {tab === "feedback" && <CustomDropdown value={statusFilter} onChange={setStatusFilter} options={[{ label: "All statuses", value: "all" }, ...STATUS_OPTIONS]} />}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-gray-400" /></div>
      ) : tab === "feedback" ? (
        filteredFeedback.length ? <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {(paginatedItems as FeedbackItem[]).map((item) => <button key={item.id} onClick={() => openFeedback(item)} className="grid w-full gap-3 p-5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:grid-cols-[minmax(0,1fr)_9rem_10rem] sm:items-center">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-bold text-gray-500">{item.referenceNumber}</span><span className="rounded-lg bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.category}</span></div><p className="mt-2 truncate font-semibold text-gray-900 dark:text-white">{item.message}</p><p className="mt-1 truncate text-sm text-gray-500">{item.name || "Anonymous"}{item.email ? ` · ${item.email}` : " · No email"}</p></div>
            <span className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">{STATUS_LABELS[item.status]}</span>
            <span className="text-xs text-gray-500 sm:text-right">{formatDate(item.createdAt)}</span>
          </button>)}
        </div> : <EmptyState icon={MessageSquareText} title="No feedback found" description="New public feedback and matching search results will appear here." />
      ) : filteredSubscribers.length ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {(paginatedItems as Subscriber[]).map((subscriber) => <div key={subscriber.id} className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="rounded-xl bg-gray-100 p-2 dark:bg-gray-800"><Mail className="h-4 w-4 text-gray-500" /></span><a href={`mailto:${subscriber.email}`} className="font-semibold text-gray-900 hover:underline dark:text-white">{subscriber.email}</a></div><span className="text-xs text-gray-500">Subscribed {formatDate(subscriber.created_at)}</span></div>)}
        </div>
      ) : <EmptyState icon={Mail} title="No subscribers found" description="Newsletter signups and matching search results will appear here." />}

      {!loading && <Pagination page={page} pageSize={PAGE_SIZE} totalItems={activeItems.length} onPageChange={setPage} itemLabel={tab === "feedback" ? "feedback submissions" : "subscribers"} />}

      {selected && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="feedback-detail-title">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900 sm:p-8">
            <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-xs font-bold text-gray-500">{selected.referenceNumber}</p><h3 id="feedback-detail-title" className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">Feedback details</h3></div><button onClick={() => setSelected(null)} className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close"><X className="h-5 w-5" /></button></div>
            <dl className="mt-6 grid gap-4 rounded-2xl bg-gray-50 p-4 text-sm dark:bg-gray-800/60 sm:grid-cols-2"><div><dt className="font-semibold text-gray-500">Sender</dt><dd className="mt-1">{selected.name || "Anonymous"}</dd></div><div><dt className="font-semibold text-gray-500">Email</dt><dd className="mt-1 break-all">{selected.email || "Not provided"}</dd></div><div><dt className="font-semibold text-gray-500">Type</dt><dd className="mt-1 capitalize">{selected.category}</dd></div><div><dt className="font-semibold text-gray-500">Submitted</dt><dd className="mt-1">{formatDate(selected.createdAt)}</dd></div><div className="sm:col-span-2"><dt className="font-semibold text-gray-500">Message</dt><dd className="mt-2 whitespace-pre-wrap text-gray-800 dark:text-gray-200">{selected.message}</dd></div></dl>
            <div className="mt-6 space-y-5">
              <label className="block text-sm font-semibold">Status<CustomDropdown value={editStatus} onChange={(value) => setEditStatus(value as FeedbackStatus)} options={STATUS_OPTIONS} className="mt-2" disabled={!canEdit} /></label>
              <label className="block text-sm font-semibold">Public response<textarea value={publicResponse} onChange={(event) => setPublicResponse(event.target.value)} maxLength={2000} rows={5} disabled={!canEdit} placeholder="Visible to the sender in the lookup tool" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white" /></label>
              <label className="block text-sm font-semibold">Internal notes<textarea value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} maxLength={4000} rows={3} disabled={!canEdit} placeholder="Only visible to admins" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black disabled:opacity-70 dark:border-gray-700 dark:bg-gray-800 dark:focus:ring-white" /></label>
              {!canEdit && <p className="text-sm text-amber-700 dark:text-amber-300">Auditor accounts have read-only access.</p>}
            </div>
            <div className="mt-7 flex justify-end gap-3"><button onClick={() => setSelected(null)} className="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-semibold dark:border-gray-700">Close</button>{canEdit && <button onClick={saveFeedback} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save update</button>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof Mail; title: string; description: string }) {
  return <div className="p-14 text-center"><Icon className="mx-auto h-10 w-10 text-gray-300" /><h4 className="mt-3 font-semibold text-gray-900 dark:text-white">{title}</h4><p className="mt-1 text-sm text-gray-500">{description}</p></div>;
}
