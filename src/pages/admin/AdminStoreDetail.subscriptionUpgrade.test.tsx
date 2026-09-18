import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  AdminSubscriptionPlanChanges,
  type AdminSubscriptionPlanChange,
} from "../../components/AdminSubscriptionPlanChanges";

const change = (
  overrides: Partial<AdminSubscriptionPlanChange> = {},
): AdminSubscriptionPlanChange => ({
  id: "change-1",
  status: "scheduled",
  from_plan_snapshot: { id: "standard", name: "Standard" },
  to_plan_snapshot: { id: "premium", name: "Premium" },
  current_amount_centavos: 99_900,
  target_amount_centavos: 199_900,
  difference_centavos: 100_000,
  amount_due_today_centavos: 0,
  target_period_start: "2099-07-31T00:00:00.000Z",
  target_period_end: "2099-08-30T00:00:00.000Z",
  renewal_invoice_id: null,
  terms_version: "subscription-upgrade-v1",
  terms_accepted_at: "2099-07-20T01:02:03.000Z",
  terms_accepted_by: "owner-123",
  requested_at: "2099-07-20T01:02:03.000Z",
  cancelled_at: null,
  cancelled_by: null,
  cancellation_reason: null,
  failure_reason: null,
  ...overrides,
});

describe("AdminSubscriptionPlanChanges", () => {
  it("shows the accepted terms, plan computation, target renewal, and owner source", () => {
    render(
      <AdminSubscriptionPlanChanges
        changes={[change()]}
        loading={false}
        error=""
        message=""
        busy={false}
        onRefresh={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Store-owner self-service/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Standard to Premium/i)).toBeInTheDocument();
    expect(screen.getByText(/PHP 0/i)).toBeInTheDocument();
    expect(screen.getByText(/PHP 999/i)).toBeInTheDocument();
    expect(screen.getByText(/PHP 1,999/i)).toBeInTheDocument();
    expect(screen.getByText(/PHP 1,000/i)).toBeInTheDocument();
    expect(screen.getByText(/subscription-upgrade-v1/i)).toBeInTheDocument();
    expect(screen.getByText(/owner-123/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Jul 31, 2099/i).length).toBeGreaterThan(0);
  });

  it("allows cancellation only while a change is scheduled and unattached", async () => {
    const user = userEvent.setup();
    const onRequestCancel = vi.fn();
    const { rerender } = render(
      <AdminSubscriptionPlanChanges
        changes={[change()]}
        loading={false}
        error=""
        message=""
        busy={false}
        onRefresh={vi.fn()}
        onRequestCancel={onRequestCancel}
      />,
    );

    await user.click(screen.getByRole("button", { name: /cancel scheduled upgrade/i }));
    expect(onRequestCancel).toHaveBeenCalledWith(expect.objectContaining({ id: "change-1" }));

    rerender(
      <AdminSubscriptionPlanChanges
        changes={[change({ status: "locked", renewal_invoice_id: "invoice-123" })]}
        loading={false}
        error=""
        message=""
        busy={false}
        onRefresh={vi.fn()}
        onRequestCancel={onRequestCancel}
      />,
    );

    expect(screen.queryByRole("button", { name: /cancel scheduled upgrade/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Locked to renewal invoice invoice-123/i)).toBeInTheDocument();
    expect(screen.getByText(/resolve the attached invoice through billing controls/i)).toBeInTheDocument();
  });

  it("archives cancelled changes by default while preserving their audit trail", async () => {
    const user = userEvent.setup();
    render(
      <AdminSubscriptionPlanChanges
        changes={[
          change({
            status: "cancelled",
            cancellation_reason: "The owner requested a different package.",
          }),
          change({
            id: "change-2",
            status: "failed",
            failure_reason: "Subscription no longer active.",
          }),
        ]}
        loading={false}
        error=""
        message=""
        busy={false}
        onRefresh={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText(/The owner requested a different package/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Subscription no longer active/i)).toBeInTheDocument();

    const archiveButton = screen.getByRole("button", { name: /archived cancelled upgrades/i });
    expect(archiveButton).toHaveAttribute("aria-expanded", "false");

    await user.click(archiveButton);

    expect(archiveButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/The owner requested a different package/i)).toBeInTheDocument();
  });

  it("uses a compact archived state when every change was cancelled", () => {
    render(
      <AdminSubscriptionPlanChanges
        changes={[change({ status: "cancelled", cancellation_reason: "No longer needed." })]}
        loading={false}
        error=""
        message=""
        busy={false}
        onRefresh={vi.fn()}
        onRequestCancel={vi.fn()}
      />,
    );

    expect(screen.getByText(/No active plan changes/i)).toBeInTheDocument();
    expect(screen.queryByText(/No longer needed/i)).not.toBeInTheDocument();
  });
});
