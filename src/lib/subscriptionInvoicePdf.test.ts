import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { billingDocumentTitleFontSize } from "./subscriptionInvoicePdf";

describe("billingDocumentTitleFontSize", () => {
  it("uses a compact heading for receipts while preserving invoice sizing", () => {
    expect(billingDocumentTitleFontSize("receipt")).toBe(16);
    expect(billingDocumentTitleFontSize("invoice")).toBe(26);
  });
});

describe("emailed billing document parity", () => {
  const emailSenderSource = readFileSync(
    resolve(process.cwd(), "scripts/email-sender.gs"),
    "utf8",
  );

  it("uses the invoice issue date instead of the email generation time", () => {
    expect(emailSenderSource).toContain('escapeHtml_(invoice.issuedAt || "Not available")');
    expect(emailSenderSource).not.toContain("escapeHtml_(formatPhilippineDateTime_(new Date()))");
  });

  it("renders the same billing identity and payment fields as web downloads", () => {
    for (const field of [
      "invoice.businessAddress",
      "invoice.billingEmail",
      "invoice.businessContact",
      "invoice.subtotalAmount",
      "invoice.totalAmount",
      "invoice.paymentMethod",
      "invoice.billingPeriod",
    ]) {
      expect(emailSenderSource).toContain(field);
    }
  });
});
