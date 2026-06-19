import { GOOGLE_DRIVE_UPLOAD_URL } from "./imageStorage";

const GAS_EMAIL_URL = import.meta.env.VITE_GAS_EMAIL_URL || GOOGLE_DRIVE_UPLOAD_URL;

export type EmailOtpPurpose = "signup" | "email_change";

type GasResponse<T> = {
  success?: boolean;
  error?: string;
  otp?: T;
};

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

async function postGasEmailAction<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(GAS_EMAIL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Email service failed with HTTP ${response.status}.`);
  }

  const data = (await response.json()) as GasResponse<T>;
  if (!data.success || !data.otp) {
    if (data.error?.includes("Unauthorized Drive CRUD action")) {
      throw new Error("The deployed GAS web app is not updated with the email OTP routes. Redeploy the same Apps Script project, then try again.");
    }

    if (data.error?.includes("requestEmailOtp is not defined")) {
      throw new Error("The GAS project is missing email-sender.gs. Add it to the same Apps Script project and redeploy.");
    }

    throw new Error(data.error || "Email service failed.");
  }

  return data.otp;
}

export function requestEmailOtp(recipientEmail: string, userName: string, purpose: EmailOtpPurpose) {
  return postGasEmailAction<RequestOtpResult>({
    action: "request_otp",
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
  return postGasEmailAction<VerifyOtpResult>({
    action: "verify_otp",
    otpToken,
    otpCode,
    recipientEmail,
    purpose,
  });
}
