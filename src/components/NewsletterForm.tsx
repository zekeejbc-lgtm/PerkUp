import { FormEvent, useState } from "react";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useToast } from "./ToastProvider";

export function NewsletterForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    const progressToastId = toast.progress("Adding you to the newsletter…", { title: "Subscribing" });

    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.from("newsletter_subscribers").insert({ email: normalizedEmail });

    if (error && error.code !== "23505") {
      console.error("Newsletter signup failed:", error);
      setStatus("error");
      setMessage("Could not subscribe right now. Please try again.");
      toast.update(progressToastId, "Could not subscribe right now. Please try again.", "error", { error, title: "Subscription failed" });
      return;
    }

    setEmail("");
    setStatus("success");
    setMessage(error?.code === "23505" ? "You are already subscribed." : "You’re on the list.");
    if (error?.code === "23505") toast.update(progressToastId, "You are already subscribed.", "info", { title: "Already subscribed" });
    else toast.update(progressToastId, "You’re on the list.", "success", { title: "Subscribed" });
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
        <button type="submit" disabled={status === "loading"} aria-label="Subscribe" className="rounded-full bg-[#1b1b1b] px-4 text-white disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b]">
          {status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
        </button>
      </div>
      {message && <p role="status" className={`mt-2 flex items-center gap-1.5 text-xs ${status === "error" ? "text-red-600" : "text-green-600"}`}>{status === "success" && <CheckCircle2 className="h-3.5 w-3.5" />}{message}</p>}
    </form>
  );
}
