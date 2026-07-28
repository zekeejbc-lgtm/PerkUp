import { describe, expect, test } from "vitest";
import {
  checkPartnerContactAvailability,
  getPartnerApplicationDatabaseError,
  getPartnerContactConflict,
  getPartnerContactValidationError,
  normalizePartnerEmail,
  normalizePartnerPhone,
} from "../../supabase/functions/_shared/partner-contact.ts";

describe("partner contact normalization", () => {
  test("normalizes email case and surrounding whitespace before availability checks", () => {
    expect(normalizePartnerEmail("  Owner@Example.COM ")).toBe("owner@example.com");
  });

  test.each([
    ["0912 345 6789", "639123456789"],
    ["912-345-6789", "639123456789"],
    ["+63 912 345 6789", "639123456789"],
  ])("normalizes Philippine phone input %s to one registry value", (input, expected) => {
    expect(normalizePartnerPhone(input)).toBe(expected);
  });
});

describe("partner contact conflict responses", () => {
  test("returns an email-specific conflict when only the email is unavailable", () => {
    expect(getPartnerContactConflict(false, true)).toEqual({
      code: "email_unavailable",
      message: "This email address is already associated with an account or application.",
    });
  });

  test("returns a phone-specific conflict when only the phone is unavailable", () => {
    expect(getPartnerContactConflict(true, false)).toEqual({
      code: "phone_unavailable",
      message: "This phone number is already associated with an account or application.",
    });
  });

  test("returns a combined conflict when both contacts are unavailable", () => {
    expect(getPartnerContactConflict(false, false)).toEqual({
      code: "contact_unavailable",
      message: "This email address and phone number are already associated with an account or application.",
    });
  });

  test("returns no conflict when both contacts are available", () => {
    expect(getPartnerContactConflict(true, true)).toBeNull();
  });
});

describe("partner contact validation", () => {
  test("rejects a phone longer than the registry can store instead of truncating it", () => {
    expect(getPartnerContactValidationError("owner@example.com", "6391234567890000"))
      .toBe("A valid phone number is required.");
  });

  test("rejects malformed email input", () => {
    expect(getPartnerContactValidationError("owner-at-example.com", "639123456789"))
      .toBe("A valid email address is required.");
  });

  test("rejects non-Philippine phone numbers from direct API callers", () => {
    expect(getPartnerContactValidationError("owner@example.com", "14155552671"))
      .toBe("A valid Philippine phone number is required.");
  });

  test("accepts the canonical Philippine mobile format", () => {
    expect(getPartnerContactValidationError("owner@example.com", "639123456789")).toBe("");
  });
});

describe("partner application database errors", () => {
  test("maps an email uniqueness race to the public email conflict", () => {
    expect(getPartnerApplicationDatabaseError({
      code: "23505",
      message: 'duplicate key violates unique constraint "applications_normalized_email_key"',
    })).toEqual({
      status: 409,
      error: "This email address is already associated with an account or application.",
      code: "email_unavailable",
    });
  });

  test("maps a phone uniqueness race to the public phone conflict", () => {
    expect(getPartnerApplicationDatabaseError({
      code: "23505",
      details: 'constraint "applications_normalized_phone_key"',
    })).toEqual({
      status: 409,
      error: "This phone number is already associated with an account or application.",
      code: "phone_unavailable",
    });
  });

  test("hides unexpected backend details from public responses", () => {
    expect(getPartnerApplicationDatabaseError({
      message: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
    })).toEqual({
      status: 500,
      error: "Application submission failed.",
      code: "application_submission_failed",
    });
  });
});

describe("partner contact availability composition", () => {
  const availableLookup = {
    isAuthEmailUsed: async () => false,
    isCustomerPhoneUsed: async () => false,
    isApplicationEmailUsed: async () => false,
    isApplicationPhoneUsed: async () => false,
  };

  test("marks email unavailable when Supabase Auth already owns it", async () => {
    const result = await checkPartnerContactAvailability("owner@example.com", "639123456789", {
      ...availableLookup,
      isAuthEmailUsed: async () => true,
    });

    expect(result).toEqual({ emailAvailable: false, phoneAvailable: true });
  });

  test("marks phone unavailable when the customer phone registry already owns it", async () => {
    const result = await checkPartnerContactAvailability("owner@example.com", "639123456789", {
      ...availableLookup,
      isCustomerPhoneUsed: async () => true,
    });

    expect(result).toEqual({ emailAvailable: true, phoneAvailable: false });
  });

  test("marks email unavailable when an application already uses it", async () => {
    const result = await checkPartnerContactAvailability("owner@example.com", "639123456789", {
      ...availableLookup,
      isApplicationEmailUsed: async () => true,
    });

    expect(result).toEqual({ emailAvailable: false, phoneAvailable: true });
  });

  test("marks phone unavailable when an application already uses it", async () => {
    const result = await checkPartnerContactAvailability("owner@example.com", "639123456789", {
      ...availableLookup,
      isApplicationPhoneUsed: async () => true,
    });

    expect(result).toEqual({ emailAvailable: true, phoneAvailable: false });
  });
});
