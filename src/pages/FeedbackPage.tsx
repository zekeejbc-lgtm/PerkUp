import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PublicPageShell } from "../components/PublicPageShell";
import { CustomDropdown } from "../components/CustomDropdown";
import { supabase } from "../lib/supabase";

export default function FeedbackPage() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("general");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const { error: submitError } = await supabase.from("site_feedback_submissions").insert({
      name: String(form.get("name") || "").trim() || null,
      email: String(form.get("email") || "").trim().toLowerCase() || null,
      category: String(form.get("category") || "general"),
      message: String(form.get("message") || "").trim(),
    });
    setSubmitting(false);
    if (submitError) {
      console.error("Site feedback failed:", submitError);
      setError("Your feedback could not be sent. Please try again.");
      return;
    }
    setSent(true);
  };

  return (
    <PublicPageShell>
      <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Feedback</p>
      <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">Help us improve PerkUp.</h1>
      <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">Report a problem, request a feature, or tell us what is working well.</p>
      {sent ? (
        <div className="mt-10 flex items-center gap-3 rounded-3xl border border-green-200 bg-green-50 p-6 text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300"><CheckCircle2 />Thank you. Your feedback has been submitted.</div>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-5 rounded-3xl border border-black/10 p-6 dark:border-white/10 sm:p-8">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold">Name (optional)<input name="name" maxLength={100} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /></label>
            <label className="text-sm font-semibold">Email (optional)<input name="email" type="email" maxLength={254} className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /></label>
          </div>
          <label className="block text-sm font-semibold">
            Feedback type
            <CustomDropdown
              name="category"
              className="mt-2"
              value={category}
              onChange={setCategory}
              options={[
                { label: "General feedback", value: "general" },
                { label: "Problem or bug", value: "bug" },
                { label: "Feature request", value: "feature" },
                { label: "Business inquiry", value: "business" },
              ]}
            />
          </label>
          <label className="block text-sm font-semibold">Message<textarea name="message" required minLength={10} maxLength={2000} rows={6} className="mt-2 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 font-normal outline-none focus:ring-2 focus:ring-black dark:border-white/10 dark:bg-white/5 dark:focus:ring-white" /></label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-[#1b1b1b] px-6 py-3 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">{submitting && <Loader2 className="h-4 w-4 animate-spin" />}Send feedback</button>
        </form>
      )}
    </PublicPageShell>
  );
}
