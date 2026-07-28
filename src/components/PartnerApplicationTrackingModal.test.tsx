import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("../lib/partnerApplication", () => ({
  trackPartnerApplication: vi.fn().mockResolvedValue({
    trackingNumber: "APP-J42HXT4F",
    legacyTrackingNumber: "PKUP-COFFEE-F4A6-1656",
    applicationId: "f4a6ee1f-4a30-41cc-a8a0-2bdb414d1656",
    businessName: "Coffee Shop",
    subscriptionLevel: "Testing Plan",
    status: "pending",
    createdAt: "2026-07-28T14:32:43.000Z",
    updatedAt: "2026-07-28T14:32:43.000Z",
  }),
}));

import { PartnerApplicationTrackingModal } from "./PartnerApplicationTrackingModal";

describe("PartnerApplicationTrackingModal", () => {
  test("displays the canonical application code returned by tracking", async () => {
    render(<PartnerApplicationTrackingModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Application Code"), {
      target: { value: "APP-J42HXT4F" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    expect(await screen.findByText("APP-J42HXT4F")).toBeInTheDocument();
    expect(screen.queryByText("PKUP-COFFEE-F4A6-1656")).not.toBeInTheDocument();
  });
});
