import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { PublicPageShell } from "../components/PublicPageShell";
import { supabase } from "../lib/supabase";

type PreferenceState = "working" | "success" | "error";

export default function NewsletterPreferencesPage() {
  const location = useLocation();
  const tokenFragment = useRef(location.hash).current;
  const [state, setState] = useState<PreferenceState>("working");
  const [message, setMessage] = useState("Updating your newsletter preference…");

  useEffect(() => {
    const searchParams = new URLSearchParams(tokenFragment.replace(/^#/, ""));
    const confirmationToken = searchParams.get("confirm");
    const unsubscribeToken = searchParams.get("unsubscribe");
    const action = confirmationToken ? "confirm" : unsubscribeToken ? "unsubscribe" : "";
    const token = confirmationToken || unsubscribeToken || "";
    if (!action || !token) {
      setState("error");
      setMessage("This newsletter link is incomplete or invalid.");
      return;
    }

    // Keep capability tokens out of referrer headers, analytics, screenshots,
    // and copied browser addresses after this page has consumed the fragment.
    window.history.replaceState(window.history.state, "", "/newsletter");

    let active = true;
    supabase.functions.invoke<{ confirmed?: boolean; unsubscribed?: boolean; error?: string }>("newsletter", {
      body: { action, token },
    }).then(({ data, error }) => {
      if (!active) return;
      if (error || data?.error || (!data?.confirmed && !data?.unsubscribed)) {
        setState("error");
        setMessage(data?.error || "This link is invalid, expired, or already used.");
        return;
      }
      setState("success");
      setMessage(action === "confirm"
        ? "Your subscription is confirmed. We emailed you an unsubscribe link for future use."
        : "You have been unsubscribed. Your suppression record will be removed after 30 days.");
    }).catch(() => {
      if (active) {
        setState("error");
        setMessage("Your preference could not be updated. Please try again.");
      }
    });
    return () => { active = false; };
  }, [tokenFragment]);

  return (
    <PublicPageShell>
      <div className="mx-auto max-w-xl rounded-3xl border border-black/10 p-8 text-center dark:border-white/10">
        {state === "working" ? <Loader2 className="mx-auto h-10 w-10 animate-spin" /> : state === "success" ? <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" /> : <XCircle className="mx-auto h-10 w-10 text-red-600" />}
        <h1 className="mt-5 text-3xl font-bold">Newsletter preferences</h1>
        <p className="mt-3 leading-7 text-gray-600 dark:text-gray-300">{message}</p>
        <Link to="/" className="mt-6 inline-flex rounded-full bg-[#1b1b1b] px-5 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-[#1b1b1b]">Return home</Link>
      </div>
    </PublicPageShell>
  );
}
