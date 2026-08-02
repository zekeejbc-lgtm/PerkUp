import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "./ToastProvider";

export function NewsletterForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const progressToastId = toast.progress("Sending a confirmation email…", { title: "Subscribing" });
    const { data, error } = await supabase.functions.invoke<{ accepted?: boolean; message?: string; error?: string }>("newsletter", {
      body: { action: "subscribe", email: email.trim().toLowerCase(), consent, source: "website-footer" },
    });

    if (error || data?.error || !data?.accepted) {
      const failureMessage = data?.error || "Could not subscribe right now. Please try again.";
      setStatus("error");
      setMessage(failureMessage);
      toast.update(progressToastId, failureMessage, "error", { error, title: "Subscription failed" });
      return;
    }

    setEmail("");
    setConsent(false);
    setStatus("success");
    const successMessage = data.message || "Check your email to confirm your subscription.";
    setMessage(successMessage);
    toast.update(progressToastId, successMessage, "success", { title: "Confirmation sent" });
  };

  return (
    <form onSubmit={submit} className="mt-6 max-w-sm">
      <label htmlFor="newsletter-email" className="text-sm font-semibold text-gray-900 dark:text-white">Get Perk updates</label>
      <div className="mt-2 flex gap-2">
        <input
          id="newsletter-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          className="min-w-0 flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-white"
        />
        <button type="submit" disabled={status === "loading" || !consent} aria-label="Subscribe" className="rounded-full bg-[#1b1b1b] px-4 text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
      <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-gray-600 dark:text-gray-300">
        <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1" />
        <span>I agree to receive Perk product and partner updates. I can unsubscribe at any time. See the <Link to="/privacy" className="font-semibold underline">Privacy Policy</Link>.</span>
      </label>
      {message && <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs ${status === "error" ? "text-red-600" : "text-green-600"}`}>{status === "success" && <CheckCircle2 className="h-3.5 w-3.5" />}{message}</p>}
    </form>
  );
}
