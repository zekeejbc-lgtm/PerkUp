import { supabase } from "./supabase";
import type { PartnerApplicationAvailability } from "./partnerApplicationAvailability";

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read logo."));
    reader.readAsDataURL(file);
  });

export interface PartnerApplicationInput {
  businessName: string;
  category: string;
  applicantName: string;
  email: string;
  phoneNumber: string;
  description: string;
  address: string;
  coordinates: [number, number] | null;
  subscriptionLevel: string;
  personalFacebookUrl?: string;
  businessFacebookUrl?: string;
  businessWebsiteUrl?: string;
  privacyConsent: boolean;
}

const getFunctionErrorMessage = async (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const context = (error as {
    context?: { json?: () => Promise<{ error?: string }> };
    message?: string;
  }).context;
  if (context?.json) {
    try {
      const body = await context.json();
      if (body.error) return body.error;
    } catch {
      // Use the SDK message when the function response is not JSON.
    }
  }
  return (error as { message?: string }).message || fallback;
};

export async function checkPartnerApplicationAvailability(
  email: string,
  phoneNumber: string,
): Promise<PartnerApplicationAvailability> {
  const { data, error } = await supabase.functions.invoke<PartnerApplicationAvailability>(
    "partner-application",
    { body: { action: "check_availability", email, phoneNumber } },
  );
  if (error || !data) {
    throw new Error(await getFunctionErrorMessage(error, "Could not check contact availability."));
  }
  return data;
}

export async function submitPartnerApplication(
  application: PartnerApplicationInput,
  logoFile: File | null,
) {
  const logo = logoFile
    ? {
        mimeType: logoFile.type,
        base64: await fileToDataUrl(logoFile),
      }
    : null;
  const { data, error } = await supabase.functions.invoke<{ submitted?: boolean; applicationId?: string; publicId?: string; trackingNumber?: string; legacyTrackingNumber?: string; error?: string }>(
    "partner-application",
    { body: { ...application, logo } },
  );
  if (error) throw new Error(await getFunctionErrorMessage(error, "Application submission failed."));
  if (!data?.submitted) throw new Error(data?.error || "Application submission failed.");
  return data;
}

export interface PartnerApplicationStatus {
  trackingNumber: string;
  legacyTrackingNumber?: string;
  applicationId?: string;
  businessName: string;
  subscriptionLevel: string;
  status: string;
  logoUrl?: string;
  createdAt: unknown;
  updatedAt: unknown;
  approvedStoreId?: string;
}

export async function trackPartnerApplication(trackingNumber: string) {
  const { data, error } = await supabase.functions.invoke<{
    found?: boolean;
    application?: PartnerApplicationStatus;
    error?: string;
  }>("partner-application", {
    body: { action: "track", trackingNumber },
  });
  if (error) throw new Error(error.message || "Application tracking failed.");
  if (!data?.found || !data.application) throw new Error(data?.error || "No application was found for that application code.");
  return data.application;
}
