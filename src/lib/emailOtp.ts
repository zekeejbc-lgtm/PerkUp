import { supabase } from "./supabase";

export type EmailOtpPurpose = "signup" | "email_change";

type RequestOtpResult = {
  otpToken: string;
  expiresInSeconds: number;
  referenceId: string;
};

type VerifyOtpResult = {
  verified: boolean;
  recipientEmail: string;
  purpose: EmailOtpPurpose;
};

async function invokeEmailOtp<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>("email-otp", { body });
  if (error || !data) throw new Error(data?.error || error?.message || "Email verification is temporarily unavailable.");
  if (data.error) throw new Error(data.error);
  return data;
}

export function requestEmailOtp(recipientEmail: string, userName: string, purpose: EmailOtpPurpose) {
  return invokeEmailOtp<RequestOtpResult>({
    action: "request",
    recipientEmail,
    userName,
    purpose,
  });
}

export function verifyEmailOtp(
  otpToken: string,
  otpCode: string,
  recipientEmail: string,
  purpose: EmailOtpPurpose,
) {
  return invokeEmailOtp<VerifyOtpResult>({
    action: "verify",
    otpToken,
    otpCode,
    recipientEmail,
    purpose,
  });
}
