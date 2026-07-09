import { supabase } from "./supabase";

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read logo."));
    reader.readAsDataURL(file);
  });

export async function submitPartnerApplication(
  application: Record<string, unknown>,
  logoFile: File | null,
) {
  const logo = logoFile
    ? {
        mimeType: logoFile.type,
        base64: await fileToDataUrl(logoFile),
      }
    : null;
  const { data, error } = await supabase.functions.invoke<{ submitted?: boolean; applicationId?: string; error?: string }>(
    "partner-application",
    { body: { ...application, logo } },
  );
  if (error) throw new Error(error.message || "Application submission failed.");
  if (!data?.submitted) throw new Error(data?.error || "Application submission failed.");
  return data;
}

export interface PartnerApplicationStatus {
  trackingNumber: string;
  businessName: string;
  subscriptionLevel: string;
  status: string;
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
  if (!data?.found || !data.application) throw new Error(data?.error || "No application was found for that tracking number.");
  return data.application;
}
