import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SubscriptionAccessActionModal,
  type SubscriptionAccessAssessment,
} from "./SubscriptionAccessActionModal";

const outsidePolicyAssessment: SubscriptionAccessAssessment = {
  valid: false,
  forced: true,
  code: "invoice_not_due",
  reason: "Grace is early because invoice inv-1 is not due yet.",
  facts: {
    assessedAt: "2026-07-29T12:00:00.000Z",
    currentStatus: "active",
    invoiceId: "inv-1",
    invoiceStatus: "link_created",
    dueAt: "2026-07-31T12:00:00.000Z",
    graceEndsAt: "2026-08-03T12:00:00.000Z",
    subscriptionEnd: "2026-07-31T12:00:00.000Z",
    initialPaymentRequired: false,
  },
};

const props = {
  action: "grace" as const,
  storeName: "Example Store",
  title: "Start the grace period?",
  description: "Starts three days of grace access.",
  confirmLabel: "Start",
  assessment: outsidePolicyAssessment,
  assessmentLoading: false,
  assessmentError: "",
  busy: false,
  mutationError: "",
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
};

describe("SubscriptionAccessActionModal", () => {
  it("keeps an outside-policy override enabled and labels it as forced", async () => {
    const onConfirm = vi.fn();
    render(<SubscriptionAccessActionModal {...props} onConfirm={onConfirm} />);

    expect(screen.getByText(/Outside expected billing policy/i)).toBeInTheDocument();
    expect(screen.getByText(outsidePolicyAssessment.reason)).toBeInTheDocument();
    const force = screen.getByRole("button", { name: /Force grace/i });
    expect(force).toBeEnabled();
    await userEvent.click(force);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("disables confirmation only while the policy check is loading", () => {
    render(
      <SubscriptionAccessActionModal
        {...props}
        assessment={null}
        assessmentLoading
      />,
    );

    expect(screen.getByText(/Checking current billing facts/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Checking policy/i })).toBeDisabled();
  });

  it("shows a valid verdict and the normal confirmation label", () => {
    render(
      <SubscriptionAccessActionModal
        {...props}
        assessment={{
          ...outsidePolicyAssessment,
          valid: true,
          forced: false,
          code: "policy_match",
          reason: "Grace matches policy.",
        }}
      />,
    );

    expect(screen.getByText(/Valid under billing policy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  it("allows a forced action when policy validation is unavailable", () => {
    render(
      <SubscriptionAccessActionModal
        {...props}
        assessment={null}
        assessmentError="The policy service could not be reached."
      />,
    );

    expect(screen.getByText(/Policy validation unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/could not be reached/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Force grace/i })).toBeEnabled();
  });

  it("renders the invoice and deadline facts used by the verdict", () => {
    render(<SubscriptionAccessActionModal {...props} />);

    expect(screen.getByText("inv-1")).toBeInTheDocument();
    expect(screen.getByText("link created")).toBeInTheDocument();
    expect(screen.getByText(/Jul 31, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Aug 3, 2026/i)).toBeInTheDocument();
  });

  it("prevents cancel and confirm while the mutation is running", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <SubscriptionAccessActionModal
        {...props}
        busy
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Wait/i })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
