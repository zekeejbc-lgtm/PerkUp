import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GetStartedModal } from "./GetStartedModal";

describe("GetStartedModal", () => {
  it("does not render when closed", () => {
    render(
      <GetStartedModal
        isOpen={false}
        onClose={vi.fn()}
        onCustomerSelect={vi.fn()}
        onBusinessSelect={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers customer and business paths", () => {
    const onCustomerSelect = vi.fn();
    const onBusinessSelect = vi.fn();

    render(
      <GetStartedModal
        isOpen
        onClose={vi.fn()}
        onCustomerSelect={onCustomerSelect}
        onBusinessSelect={onBusinessSelect}
      />,
    );

    expect(screen.getByRole("dialog", { name: "How would you like to use Perk?" })).toBeInTheDocument();
    expect(screen.getByText(/earn points and enjoy rewards/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /join as a customer/i }));
    fireEvent.click(screen.getByRole("button", { name: /apply as a business/i }));

    expect(onCustomerSelect).toHaveBeenCalledOnce();
    expect(onBusinessSelect).toHaveBeenCalledOnce();
  });

  it("can be dismissed with the close button", () => {
    const onClose = vi.fn();

    render(
      <GetStartedModal
        isOpen
        onClose={onClose}
        onCustomerSelect={vi.fn()}
        onBusinessSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close get started options" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
