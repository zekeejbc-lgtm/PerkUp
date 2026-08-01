import { FormEvent, useEffect, useState } from "react";
import { Check, CheckCircle2, Clipboard, Clock3, Loader2, Search } from "lucide-react";
import { PublicPageShell } from "../components/PublicPageShell";
import { CustomDropdown } from "../components/CustomDropdown";
import { lookupPublicFeedback, PublicFeedbackStatus, submitPublicFeedback, TrackedFeedback } from "../lib/publicFeedback";
import { useToast } from "../components/ToastProvider";

const STATUS_LABELS: Record<PublicFeedbackStatus, string> = {
  received: "Received",
  reviewing: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General feedback",
  bug: "Problem or bug",
  feature: "Feature request",
  business: "Business inquiry",
};

const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
}).format(new Date(value));

export default function FeedbackPage() {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<{
    referenceNumber: string;
    email: string;
    receiptSent: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("general");
  const [referenceNumber, setReferenceNumber] = useState(() => new URLSearchParams(window.location.search).get("reference") || "");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [trackedFeedback, setTrackedFeedback] = useState<TrackedFeedback | null>(null);
  const [copied, setCopied] = useState(false);

  const lookup = async (requestedReference = referenceNumber) => {
    const normalizedReference = requestedReference.trim().toUpperCase();
    if (!normalizedReference) {
      setLookupError("Enter your feedback reference number.");
      return;
    }
    setLookingUp(true);
    const progressToastId = toast.progress("Looking up your feedback…", { title: "Tracking feedback" });
    setLookupError("");
    setTrackedFeedback(null);
    try {
      const result = await lookupPublicFeedback(normalizedReference);
      setReferenceNumber(normalizedReference);
      setTrackedFeedback(result);
      toast.update(progressToastId, "Your feedback record was found.", "success", { title: "Feedback found" });
    } catch (lookupFailure) {
      const message = lookupFailure instanceof Error ? lookupFailure.message : "Feedback lookup failed.";
      setLookupError(message);
      if (/not found|invalid|reference/i.test(message)) toast.update(progressToastId, message, "info", { title: "Feedback not found" });
      else toast.update(progressToastId, message, "error", { error: lookupFailure, title: "Lookup failed" });
    } finally {
      setLookingUp(false);
    }
  };

  useEffect(() => {
    const initialReference = new URLSearchParams(window.location.search).get("reference");
    if (initialReference) void lookup(initialReference);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    const progressToastId = toast.progress("Sending your feedback…", { title: "Submitting feedback" });
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    try {
      const result = await submitPublicFeedback({
        name: String(form.get("name") || "").trim(),
        email,
        category: String(form.get("category") || "general"),
        message: String(form.get("message") || "").trim(),
      });
      setSubmission({
        referenceNumber: result.feedback.referenceNumber,
        email,
        receiptSent: result.receipt.sent,
      });
      setReferenceNumber(result.feedback.referenceNumber);
      toast.update(progressToastId, "Your feedback was submitted.", "success", { title: "Feedback sent" });
    } catch (submitFailure) {
      console.error("Site feedback failed:", submitFailure);
      setError(submitFailure instanceof Error ? submitFailure.message : "Your feedback could not be sent. Please try again.");
      toast.update(progressToastId, "Your feedback could not be sent. Please try again.", "error", { error: submitFailure, title: "Submission failed" });
    } finally {
      setSubmitting(false);
    }
  };

  const copyReference = async () => {
    if (!submission) return;
    try {
      await navigator.clipboard.writeText(submission.referenceNumber);
      setCopied(true);
      toast.success("Feedback reference copied.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      toast.info("Clipboard access was unavailable. Select and copy the reference manually.", { title: "Copy manually" });
    }
  };

  return (
    <PublicPageShell>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Feedback</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Help us improve Perk.</h1>
      <p className="mt-6 max-w-3xl text-lg text-gray-600 dark:text-gray-300">Send feedback, keep your private reference number, and return here to follow its progress.</p>

      {submission ? (
        <section className="mt-10 rounded-3xl border border-green-200 bg-green-50 p-6 text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200 sm:p-8">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold">Your feedback has been submitted.</h2>
              <p className="mt-1 text-sm opacity-80">
                {submission.email
                  ? submission.receiptSent
                    ? `A receipt was sent to ${submission.email}.`
                    : "Your feedback was saved, but the email receipt could not be sent. Save the reference below."
                  : "Save this reference number—you will need it to check for updates."}
              </p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <code className="break-all rounded-xl border border-green-300 bg-white/70 px-4 py-3 font-bold tracking-wide dark:border-green-800 dark:bg-black/20">{submission.referenceNumber}</code>
                <button type="button" onClick={copyReference} className="inline-flex items-center justify-center gap-2 rounded-full border border-green-300 px-4 py-2.5 text-sm font-semibold hover:bg-white/60 dark:border-green-800 dark:hover:bg-white/5">
                  {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{copied ? "Copied" : "Copy reference"}
                </button>
                <button type="button" onClick={() => void lookup(submission.referenceNumber)} className="inline-flex items-center justify-center gap-2 rounded-full bg-green-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-green-200 dark:text-green-950">
                  <Search className="h-4 w-4" />View status
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-5 rounded-3xl border border-black/10 p-6 dark:border-white/10 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold">Name (optional)<input name="name" maxLength={100} autoComplete="name" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /></label>
            <label className="text-sm font-semibold">Email (optional)<input name="email" type="email" maxLength={254} autoComplete="email" aria-describedby="email-help" className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /><span id="email-help" className="mt-2 block text-xs font-normal text-gray-500">Add an email to receive your reference number and receipt.</span></label>
          </div>
          <label className="block text-sm font-semibold">
            Feedback type
            <CustomDropdown name="category" className="mt-2" value={category} onChange={setCategory} options={[
              { label: "General feedback", value: "general" },
              { label: "Problem or bug", value: "bug" },
              { label: "Feature request", value: "feature" },
              { label: "Business inquiry", value: "business" },
            ]} />
          </label>
          <label className="block text-sm font-semibold">Message<textarea name="message" required minLength={10} maxLength={2000} rows={6} className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /></label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-[#1b1b1b] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Send feedback</button>
        </form>
      )}

      <section id="lookup" className="mt-12 scroll-mt-28 border-t border-black/10 pt-12 dark:border-white/10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Feedback lookup</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight">Track an update</h2>
          <p className="mt-3 text-gray-600 dark:text-gray-300">Enter the reference number shown after submission or included in your email receipt.</p>
          <form onSubmit={(event) => { event.preventDefault(); void lookup(); }} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value.toUpperCase())} maxLength={50} spellCheck={false} placeholder="FB-20260715-…" aria-label="Feedback reference number" className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-mono uppercase outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" />
            <button disabled={lookingUp} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#1b1b1b] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">{lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Look up</button>
          </form>
          {lookupError && <p role="alert" className="mt-3 text-sm text-red-600">{lookupError}</p>}
        </div>

        {trackedFeedback && (
          <div className="mt-8 rounded-3xl border border-black/10 p-6 dark:border-white/10 sm:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-mono text-sm font-bold text-gray-500 dark:text-gray-400">{trackedFeedback.referenceNumber}</p>
                <h3 className="mt-2 text-xl font-bold">{CATEGORY_LABELS[trackedFeedback.category] || trackedFeedback.category}</h3>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"><Clock3 className="h-4 w-4" />{STATUS_LABELS[trackedFeedback.status]}</span>
            </div>
            <dl className="mt-6 grid gap-5 border-t border-black/10 pt-6 dark:border-white/10 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Submitted</dt><dd className="mt-1 text-sm">{formatDate(trackedFeedback.createdAt)}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Last updated</dt><dd className="mt-1 text-sm">{formatDate(trackedFeedback.updatedAt)}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Your feedback</dt><dd className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{trackedFeedback.message}</dd></div>
              <div className="rounded-2xl bg-gray-50 p-5 dark:bg-white/5 sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Perk response</dt><dd className="mt-2 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{trackedFeedback.response || "No public response yet. Check back for updates."}</dd></div>
            </dl>
          </div>
        )}
      </section>
    </PublicPageShell>
  );
}
