import { describe, expect, it } from "vitest";
import {
  isInvoiceForCurrentSubscriptionCycle,
  shouldConfirmPaidSubscriptionInvoice,
} from "./subscriptionAccess";

const subscriptionEnd = "2026-07-29T00:00:00.000Z";

describe("subscription invoice cycle matching", () => {
  it("rejects a historical paid setup invoice for an expired renewal", () => {
    const invoice = {
      invoiceType: "initial",
      periodStart: "2026-06-01T00:00:00.000Z",
      status: "paid",
    };

    expect(isInvoiceForCurrentSubscriptionCycle(invoice, subscriptionEnd, false)).toBe(false);
    expect(
      shouldConfirmPaidSubscriptionInvoice(invoice, subscriptionEnd, false, true),
    ).toBe(false);
  });

  it("accepts only the renewal whose period starts at the current subscription end", () => {
    expect(isInvoiceForCurrentSubscriptionCycle({
      invoiceType: "renewal",
      periodStart: subscriptionEnd,
      status: "link_created",
    }, subscriptionEnd, false)).toBe(true);

    expect(isInvoiceForCurrentSubscriptionCycle({
      invoiceType: "renewal",
      periodStart: "2026-06-29T00:00:00.000Z",
      status: "paid",
    }, subscriptionEnd, false)).toBe(false);
  });

  it("does not replay a paid invoice unless this browser opened the payment flow", () => {
    const currentPaidInvoice = {
      invoiceType: "renewal",
      periodStart: subscriptionEnd,
      status: "paid",
    };

    expect(
      shouldConfirmPaidSubscriptionInvoice(currentPaidInvoice, subscriptionEnd, false, false),
    ).toBe(false);
    expect(
      shouldConfirmPaidSubscriptionInvoice(currentPaidInvoice, subscriptionEnd, false, true),
    ).toBe(true);
  });

  it("allows the current initial invoice only while initial payment is required", () => {
    const initialInvoice = {
      invoiceType: "initial",
      periodStart: "2026-07-29T00:00:00.000Z",
      status: "paid",
    };

    expect(isInvoiceForCurrentSubscriptionCycle(initialInvoice, null, true)).toBe(true);
    expect(isInvoiceForCurrentSubscriptionCycle(initialInvoice, subscriptionEnd, false)).toBe(false);
  });
});
