import { supabase } from "./supabase";

export type PublicFeedbackStatus = "received" | "reviewing" | "planned" | "in_progress" | "resolved" | "closed";

export type TrackedFeedback = {
  referenceNumber: string;
  legacyReferenceNumber?: string;
  category: string;
  message: string;
  status: PublicFeedbackStatus;
  response: string;
  createdAt: string;
  updatedAt: string;
};

const errorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const context = (error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string }).context;
  if (context?.json) {
    try {
      const payload = await context.json();
      if (payload.error) return payload.error;
    } catch {
      // Use the SDK message below.
    }
  }
  return (error as { message?: string }).message || fallback;
};

export async function submitPublicFeedback(input: {
  name: string;
  email: string;
  category: string;
  message: string;
}) {
  const { data, error } = await supabase.functions.invoke<{
    feedback: { referenceNumber: string; status: PublicFeedbackStatus; createdAt: string };
    receipt: { sent: boolean; error: string };
    error?: string;
  }>("public-feedback", { body: { action: "submit", ...input } });
  if (error) throw new Error(await errorMessage(error, "Your feedback could not be sent."));
  if (!data?.feedback || data.error) throw new Error(data?.error || "Your feedback could not be sent.");
  return data;
}

export async function lookupPublicFeedback(referenceNumber: string) {
  const { data, error } = await supabase.functions.invoke<{ feedback: TrackedFeedback; error?: string }>("public-feedback", {
    body: { action: "lookup", referenceNumber },
  });
  if (error) throw new Error(await errorMessage(error, "Feedback lookup failed."));
  if (!data?.feedback || data.error) throw new Error(data?.error || "No feedback was found for that reference number.");
  return data.feedback;
}
