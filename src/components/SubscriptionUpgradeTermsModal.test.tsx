import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SubscriptionUpgradeQuote } from "../lib/subscriptionUpgrade";
import { SubscriptionUpgradeTermsModal } from "./SubscriptionUpgradeTermsModal";

const quote = (
  overrides: Partial<SubscriptionUpgradeQuote> = {},
): SubscriptionUpgradeQuote => ({
  storeId: "store-a",
  subscriptionId: "subscription-a",
  currentPlan: {
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
  },
  targetPlan: {
    id: "premium",
    name: "Premium",
    order: 1,
    priceCentavos: 199_900,
    interval: "month",
    intervalDays: 30,
    features: ["Basic analytics", "Priority support", "Custom promotions"],
    dependencies: {
      customerLimit: 10_000,
      staffLimit: 5,
      branchLimit: 3,
      galleryPhotoLimit: 6,
    },
  },
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
  quoteToken: "signed-quote-token",
  ...overrides,
});

const defaultProps = {
  isOpen: true,
  quote: quote(),
  isSubmitting: false,
  error: "",
  onConfirm: vi.fn(async () => undefined),
  onClose: vi.fn(),
  onRefreshQuote: vi.fn(async () => undefined),
};

const reachTermsEnd = () => {
  const terms = screen.getByTestId("subscription-upgrade-terms");
  Object.defineProperties(terms, {
    scrollHeight: { configurable: true, value: 600 },
    clientHeight: { configurable: true, value: 200 },
    scrollTop: { configurable: true, value: 400, writable: true },
  });
  fireEvent.scroll(terms);
};

describe("SubscriptionUpgradeTermsModal", () => {
  it("shows PHP 0 today, target renewal amount, difference, and effective date", () => {
    render(<SubscriptionUpgradeTermsModal {...defaultProps} />);

    expect(screen.getByText(/Charged today: PHP 0/i)).toBeInTheDocument();
    expect(screen.getAllByText("PHP 1,999").length).toBeGreaterThan(0);
    expect(screen.getAllByText("PHP 1,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Jul 31, 2099/i).length).toBeGreaterThan(0);
  });

  it("explains that an already-issued next invoice remains unchanged", () => {
    render(<SubscriptionUpgradeTermsModal
      {...defaultProps}
      quote={quote({
        nextRenewal: {
          periodStart: "2099-07-31T00:00:00.000Z",
          periodEnd: "2099-08-30T00:00:00.000Z",
          amountCentavos: 99_900,
          planId: "standard",
          alreadyIssued: true,
          invoiceId: "invoice-current",
        },
        targetRenewal: {
          periodStart: "2099-08-30T00:00:00.000Z",
          periodEnd: "2099-09-29T00:00:00.000Z",
          amountCentavos: 199_900,
          planId: "premium",
        },
      })}
    />);

    expect(screen.getByText(/already issued and remains unchanged/i)).toBeInTheDocument();
    expect(screen.getAllByText(/following renewal/i).length).toBeGreaterThan(0);
  });

  it("shows gained features and every before/after limit", () => {
    render(<SubscriptionUpgradeTermsModal {...defaultProps} />);

    expect(screen.getByText("Priority support")).toBeInTheDocument();
    expect(screen.getByText("Custom promotions")).toBeInTheDocument();
    for (const label of ["Customers", "Staff accounts", "Branches", "Gallery photos"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("1,000 → 10,000")).toBeInTheDocument();
  });

  it("keeps acknowledgement and confirmation disabled before terms end", () => {
    render(<SubscriptionUpgradeTermsModal {...defaultProps} />);

    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeDisabled();
  });

  it("enables acknowledgement only after terms scroll reaches the end", () => {
    render(<SubscriptionUpgradeTermsModal {...defaultProps} />);
    reachTermsEnd();

    expect(screen.getByRole("checkbox")).toBeEnabled();
    expect(screen.getByText(/Terms read/i)).toBeInTheDocument();
  });

  it("requires acknowledgement before confirmation", async () => {
    const user = userEvent.setup();
    render(<SubscriptionUpgradeTermsModal {...defaultProps} />);
    reachTermsEnd();

    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeEnabled();
  });

  it("resets acknowledgement when the quote fingerprint changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SubscriptionUpgradeTermsModal {...defaultProps} />);
    reachTermsEnd();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    rerender(<SubscriptionUpgradeTermsModal
      {...defaultProps}
      quote={quote({ quoteFingerprint: "b".repeat(64) })}
    />);

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("requires a fresh terms review when a new token has the same fingerprint", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SubscriptionUpgradeTermsModal {...defaultProps} />);
    reachTermsEnd();
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeEnabled();

    rerender(<SubscriptionUpgradeTermsModal
      {...defaultProps}
      quote={quote({
        quoteToken: "refreshed-signed-quote-token",
        quotedAt: "2099-07-20T00:05:00.000Z",
        expiresAt: "2099-07-20T00:20:00.000Z",
      })}
    />);

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByRole("checkbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeDisabled();
  });

  it("blocks an expired quote and offers refresh", async () => {
    const onRefreshQuote = vi.fn(async () => undefined);
    const user = userEvent.setup();
    render(<SubscriptionUpgradeTermsModal
      {...defaultProps}
      quote={quote({ expiresAt: "2020-01-01T00:00:00.000Z" })}
      onRefreshQuote={onRefreshQuote}
    />);

    expect(screen.getByText(/quote has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirm upgrade/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Refresh quote/i }));
    expect(onRefreshQuote).toHaveBeenCalledTimes(1);
  });

  it("submits terms version and fingerprint exactly once", async () => {
    let release: (() => void) | undefined;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => {
      release = resolve;
    }));
    const user = userEvent.setup();
    render(<SubscriptionUpgradeTermsModal {...defaultProps} onConfirm={onConfirm} />);
    reachTermsEnd();
    await user.click(screen.getByRole("checkbox"));

    const confirm = screen.getByRole("button", { name: /Confirm upgrade/i });
    await user.dblClick(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      termsVersion: "subscription-upgrade-v1",
      termsAccepted: true,
      quoteFingerprint: "a".repeat(64),
    });
    release?.();
  });

  it("restores focus and supports Escape before submission", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    function Harness() {
      const [open, setOpen] = useState(true);
      return <SubscriptionUpgradeTermsModal
        {...defaultProps}
        isOpen={open}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />;
    }

    render(<Harness />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Close upgrade terms/i })).toHaveFocus()
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
