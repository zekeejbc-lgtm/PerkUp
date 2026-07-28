import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SubscriptionPlanChangeSummary,
  SubscriptionPlanSnapshot,
  SubscriptionUpgradeQuote,
} from "../../lib/subscriptionUpgrade";
import StoreOwnerSubscription from "./StoreOwnerSubscription";

const api = vi.hoisted(() => ({
  getSubscriptionUpgradeOptions: vi.fn(),
  quoteSubscriptionUpgrade: vi.fn(),
  confirmSubscriptionUpgrade: vi.fn(),
  cancelSubscriptionUpgrade: vi.fn(),
}));

vi.mock("../../lib/subscriptionUpgradeApi", () => api);
vi.mock("../../contexts/CurrencyContext", () => ({
  useCurrency: () => ({
    formatCurrency: (amount: number) => `PHP ${amount.toLocaleString("en-PH")}`,
  }),
}));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-a", name: "Owner A" } }),
}));
vi.mock("../../lib/subscriptionInvoicePdf", () => ({
  downloadSubscriptionInvoicePdf: vi.fn(),
}));
vi.mock("../../lib/subscriptionAccess", () => ({
  markSubscriptionPaymentPending: vi.fn(),
}));
vi.mock("../../lib/adminBackend", () => ({
  invokeAdminBackend: vi.fn(),
  BackendOperationError: class BackendOperationError extends Error {
    code: string;
    constructor(message: string, code = "") {
      super(message);
      this.code = code;
    }
  },
}));

const billingSubscription = {
  data: {
    public_id: "SUB-TEST",
    automation_enabled: true,
    billing_email: "owner@example.com",
    plan_id: "standard",
    interval_days: 30,
    grace_period_days: 3,
    status: "active",
    renewal_mode: "automatic",
    auto_renew_cancelled_at: null,
    current_period_end: "2099-07-31T00:00:00.000Z",
    initial_payment_required: false,
  },
  error: null,
};

vi.mock("../../lib/supabase", () => {
  const createBuilder = (table: string) => {
    const result = table === "billing_subscriptions"
      ? billingSubscription
      : { data: [], error: null };
    const builder: Record<string, any> = {};
    for (const method of ["select", "eq", "order", "limit"]) {
      builder[method] = () => builder;
    }
    builder.maybeSingle = () => Promise.resolve(result);
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => createBuilder(table),
    },
  };
});

const standard: SubscriptionPlanSnapshot = {
  id: "standard",
  name: "Standard",
  order: 0,
  priceCentavos: 99_900,
  interval: "month",
  intervalDays: 30,
  features: ["Basic analytics"],
  dependencies: {
    customerLimit: 1_000,
    staffLimit: 1,
    branchLimit: 1,
    galleryPhotoLimit: 3,
  },
};

const premium: SubscriptionPlanSnapshot = {
  id: "premium",
  name: "Premium",
  order: 1,
  priceCentavos: 199_900,
  interval: "month",
  intervalDays: 30,
  features: ["Basic analytics", "Priority support"],
  dependencies: {
    customerLimit: 10_000,
    staffLimit: 5,
    branchLimit: 3,
    galleryPhotoLimit: 6,
  },
};

const enterprise: SubscriptionPlanSnapshot = {
  ...premium,
  id: "enterprise",
  name: "Enterprise",
  order: 2,
  priceCentavos: 499_900,
  features: [...premium.features, "Dedicated support"],
  dependencies: {
    customerLimit: 0,
    staffLimit: 0,
    branchLimit: 0,
    galleryPhotoLimit: 10,
  },
};

const quote: SubscriptionUpgradeQuote = {
  storeId: "store-a",
  subscriptionId: "subscription-a",
  currentPlan: standard,
  targetPlan: premium,
  amountDueTodayCentavos: 0,
  differenceCentavos: 100_000,
  nextRenewal: {
    periodStart: "2099-07-31T00:00:00.000Z",
    periodEnd: "2099-08-30T00:00:00.000Z",
    amountCentavos: 199_900,
    planId: "premium",
    alreadyIssued: false,
    invoiceId: null,
  },
  targetRenewal: {
    periodStart: "2099-07-31T00:00:00.000Z",
    periodEnd: "2099-08-30T00:00:00.000Z",
    amountCentavos: 199_900,
    planId: "premium",
  },
  renewalMode: "automatic",
  termsVersion: "subscription-upgrade-v1",
  quotedAt: "2099-07-20T00:00:00.000Z",
  expiresAt: "2099-07-20T00:15:00.000Z",
  quoteFingerprint: "a".repeat(64),
};

const pendingChange = (
  status: "scheduled" | "locked",
): SubscriptionPlanChangeSummary => ({
  id: "change-a",
  status,
  fromPlan: standard,
  toPlan: premium,
  targetPeriodStart: "2099-07-31T00:00:00.000Z",
  targetAmountCentavos: 199_900,
  renewalInvoiceId: status === "locked" ? "invoice-a" : null,
  requestedAt: "2099-07-20T00:00:00.000Z",
  lockedAt: status === "locked" ? "2099-07-25T00:00:00.000Z" : null,
  appliedAt: null,
});

const store = {
  id: "store-a",
  isPrimaryBranch: true,
  name: "Store A",
  status: "Active",
  subscriptionLevel: "Standard",
  subscriptionDependencies: standard.dependencies,
  owedAmount: 999,
  paymentSchedule: "every_30_days",
  billingIntervalDays: 30,
  subscriptionStart: "2099-07-01T00:00:00.000Z",
  subscriptionEnd: "2099-07-31T00:00:00.000Z",
};

const options = (overrides: Record<string, unknown> = {}) => ({
  enabled: true,
  currentPlan: standard,
  eligiblePlans: [premium, enterprise],
  pendingChange: null,
  blockedReason: null,
  ...overrides,
});

describe("StoreOwnerSubscription upgrade workflow", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUBSCRIPTION_UPGRADES_ENABLED", "true");
    api.getSubscriptionUpgradeOptions.mockResolvedValue(options());
    api.quoteSubscriptionUpgrade.mockResolvedValue(quote);
    api.confirmSubscriptionUpgrade.mockResolvedValue(pendingChange("scheduled"));
    api.cancelSubscriptionUpgrade.mockResolvedValue(undefined);
  });

  it("renders only server-approved higher plans and no downgrade control", async () => {
    render(<StoreOwnerSubscription stores={[store]} />);

    expect(await screen.findByText("Premium")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Standard/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/downgrade/i)).not.toBeInTheDocument();
    expect(screen.getByText("Need a lower plan? Contact PerkUp support.")).toBeInTheDocument();
  });

  it("shows a blocked reason and disables upgrade actions", async () => {
    api.getSubscriptionUpgradeOptions.mockResolvedValue(options({
      blockedReason: "Resolve the overdue renewal before scheduling an upgrade.",
    }));
    render(<StoreOwnerSubscription stores={[store]} />);

    expect(await screen.findByText(/Resolve the overdue renewal/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Review upgrade/i })[0]).toBeDisabled();
  });

  it("opens the terms modal only after a backend quote is loaded", async () => {
    const user = userEvent.setup();
    render(<StoreOwnerSubscription stores={[store]} />);
    await user.click(await screen.findByRole("button", { name: /Review upgrade to Premium/i }));

    expect(api.quoteSubscriptionUpgrade).toHaveBeenCalledWith("store-a", "premium");
    expect(await screen.findByRole("dialog", { name: /Review your subscription upgrade/i })).toBeInTheDocument();
  });

  it("confirms the acknowledged quote and refreshes pending-change data", async () => {
    const user = userEvent.setup();
    render(<StoreOwnerSubscription stores={[store]} />);
    await user.click(await screen.findByRole("button", { name: /Review upgrade to Premium/i }));
    const terms = screen.getByTestId("subscription-upgrade-terms");
    Object.defineProperties(terms, {
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 400, writable: true },
    });
    fireEvent.scroll(terms);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Confirm upgrade/i }));

    await waitFor(() => expect(api.confirmSubscriptionUpgrade).toHaveBeenCalledWith({
      storeId: "store-a",
      targetPlanId: "premium",
      termsVersion: "subscription-upgrade-v1",
      termsAccepted: true,
      quoteFingerprint: "a".repeat(64),
    }));
    expect(api.getSubscriptionUpgradeOptions).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/Premium is scheduled/i)).toBeInTheDocument();
  });

  it("allows cancellation while scheduled and refreshes the pending state", async () => {
    api.getSubscriptionUpgradeOptions
      .mockResolvedValueOnce(options({ eligiblePlans: [], pendingChange: pendingChange("scheduled") }))
      .mockResolvedValueOnce(options());
    const user = userEvent.setup();
    render(<StoreOwnerSubscription stores={[store]} />);

    await user.click(await screen.findByRole("button", { name: /Cancel scheduled upgrade/i }));
    await user.click(screen.getByRole("button", { name: /^Cancel upgrade$/i }));

    await waitFor(() =>
      expect(api.cancelSubscriptionUpgrade).toHaveBeenCalledWith("store-a", "change-a")
    );
    expect(api.getSubscriptionUpgradeOptions).toHaveBeenCalledTimes(2);
  });

  it("does not offer owner cancellation after the upgrade is invoice-locked", async () => {
    api.getSubscriptionUpgradeOptions.mockResolvedValue(
      options({ eligiblePlans: [], pendingChange: pendingChange("locked") }),
    );
    render(<StoreOwnerSubscription stores={[store]} />);

    expect(await screen.findByText(/Locked to renewal invoice/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel scheduled upgrade/i })).not.toBeInTheDocument();
  });

  it("requires acknowledgement again after a stale confirmation refreshes the quote", async () => {
    const { BackendOperationError } = await import("../../lib/adminBackend");
    api.confirmSubscriptionUpgrade.mockRejectedValueOnce(
      new BackendOperationError("Changed", "STALE_UPGRADE_QUOTE"),
    );
    api.quoteSubscriptionUpgrade
      .mockResolvedValueOnce(quote)
      .mockResolvedValueOnce({ ...quote, quoteFingerprint: "b".repeat(64) });
    const user = userEvent.setup();
    render(<StoreOwnerSubscription stores={[store]} />);
    await user.click(await screen.findByRole("button", { name: /Review upgrade to Premium/i }));

    const terms = screen.getByTestId("subscription-upgrade-terms");
    Object.defineProperties(terms, {
      scrollHeight: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: { configurable: true, value: 400, writable: true },
    });
    fireEvent.scroll(terms);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Confirm upgrade/i }));

    expect(await screen.findByText(/Billing details changed/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
