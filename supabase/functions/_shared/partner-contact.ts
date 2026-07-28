export type PartnerContactConflictCode =
  | "email_unavailable"
  | "phone_unavailable"
  | "contact_unavailable";

export type PartnerContactConflict = {
  code: PartnerContactConflictCode;
  message: string;
};

export type PartnerContactAvailability = {
  emailAvailable: boolean;
  phoneAvailable: boolean;
};

export type PartnerContactLookup = {
  isAuthEmailUsed(email: string): Promise<boolean>;
  isCustomerPhoneUsed(phone: string): Promise<boolean>;
  isApplicationEmailUsed(email: string): Promise<boolean>;
  isApplicationPhoneUsed(phone: string): Promise<boolean>;
};

export const normalizePartnerEmail = (value: unknown) =>
  String(value || "").trim().toLowerCase();

export const normalizePartnerPhone = (value: unknown) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("09")) return `63${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("9")) return `63${digits}`;
  return digits;
};

export const getPartnerContactValidationError = (email: string, phone: string) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "A valid email address is required.";
  if (phone.length < 10 || phone.length > 15) return "A valid phone number is required.";
  if (!/^639[0-9]{9}$/.test(phone)) return "A valid Philippine phone number is required.";
  return "";
};

export const getPartnerContactConflict = (
  emailAvailable: boolean,
  phoneAvailable: boolean,
): PartnerContactConflict | null => {
  if (!emailAvailable && !phoneAvailable) {
    return {
      code: "contact_unavailable",
      message: "This email address and phone number are already associated with an account or application.",
    };
  }
  if (!emailAvailable) {
    return {
      code: "email_unavailable",
      message: "This email address is already associated with an account or application.",
    };
  }
  if (!phoneAvailable) {
    return {
      code: "phone_unavailable",
      message: "This phone number is already associated with an account or application.",
    };
  }
  return null;
};

export type PartnerApplicationDatabaseError = {
  status: 409 | 500;
  error: string;
  code: PartnerContactConflictCode | "application_submission_failed";
};

export const getPartnerApplicationDatabaseError = (
  error: unknown,
): PartnerApplicationDatabaseError => {
  const databaseError = error as { code?: string; message?: string; details?: string };
  if (databaseError?.code === "23505") {
    const errorText = `${databaseError.message || ""} ${databaseError.details || ""}`;
    if (errorText.includes("applications_normalized_email_key")) {
      const conflict = getPartnerContactConflict(false, true)!;
      return { status: 409, error: conflict.message, code: conflict.code };
    }
    if (errorText.includes("applications_normalized_phone_key")) {
      const conflict = getPartnerContactConflict(true, false)!;
      return { status: 409, error: conflict.message, code: conflict.code };
    }
  }
  return {
    status: 500,
    error: "Application submission failed.",
    code: "application_submission_failed",
  };
};

export const checkPartnerContactAvailability = async (
  email: string,
  phone: string,
  lookup: PartnerContactLookup,
): Promise<PartnerContactAvailability> => {
  const [
    authEmailUsed,
    customerPhoneUsed,
    applicationEmailUsed,
    applicationPhoneUsed,
  ] = await Promise.all([
    lookup.isAuthEmailUsed(email),
    lookup.isCustomerPhoneUsed(phone),
    lookup.isApplicationEmailUsed(email),
    lookup.isApplicationPhoneUsed(phone),
  ]);

  return {
    emailAvailable: !authEmailUsed && !applicationEmailUsed,
    phoneAvailable: !customerPhoneUsed && !applicationPhoneUsed,
  };
};
