import { describe, expect, test } from "vitest";
import { getPartnerApplicationAvailabilityError } from "./partnerApplicationAvailability.ts";

describe("partner application availability errors", () => {
  test("does not reveal which contact field conflicts", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: false,
      phoneAvailable: true,
    })).toBe("The contact details could not be accepted. Use different verified contact details or contact support.");
  });

  test("uses the same response for a phone conflict", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: true,
      phoneAvailable: false,
    })).toBe("The contact details could not be accepted. Use different verified contact details or contact support.");
  });

  test("uses the same response for both conflicts", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: false,
      phoneAvailable: false,
    })).toBe("The contact details could not be accepted. Use different verified contact details or contact support.");
  });

  test("returns no error when both contacts are available", () => {
    expect(getPartnerApplicationAvailabilityError({
      emailAvailable: true,
      phoneAvailable: true,
    })).toBe("");
  });
});
