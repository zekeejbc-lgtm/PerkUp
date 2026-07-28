import { describe, expect, test } from "vitest";
import { getPartnerApplicationAvailabilityError } from "./partnerApplicationAvailability.ts";

describe("partner application availability errors", () => {
  test("identifies an email conflict before advancing the application", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: false,
      phoneAvailable: true,
    })).toBe("This email address is already associated with an account or application.");
  });

  test("identifies a phone conflict before advancing the application", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: true,
      phoneAvailable: false,
    })).toBe("This phone number is already associated with an account or application.");
  });

  test("identifies both conflicts in one message", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: false,
      phoneAvailable: false,
    })).toBe("This email address and phone number are already associated with an account or application.");
  });

  test("returns no error when both contacts are available", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: true,
      phoneAvailable: true,
    })).toBe("");
  });
});
