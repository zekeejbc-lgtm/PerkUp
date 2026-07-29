import { describe, expect, it } from "vitest";
import { billingDocumentTitleFontSize } from "./subscriptionInvoicePdf";

describe("billingDocumentTitleFontSize", () => {
  it("uses a compact heading for receipts while preserving invoice sizing", () => {
    expect(billingDocumentTitleFontSize("receipt")).toBe(16);
    expect(billingDocumentTitleFontSize("invoice")).toBe(26);
  });
});
