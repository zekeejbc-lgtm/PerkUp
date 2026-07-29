import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewFormModal } from "./ReviewFormModal";

const props = {
  rating: 5,
  comment: "",
  anonymous: false,
  imageFiles: [] as File[],
  imagePreviews: [] as string[],
  submitting: false,
  onRatingChange: vi.fn(),
  onCommentChange: vi.fn(),
  onAnonymousChange: vi.fn(),
  onImagesChange: vi.fn(),
  onRemoveImage: vi.fn(),
  onSubmit: vi.fn(),
  onClose: vi.fn(),
};

describe("ReviewFormModal", () => {
  it("opens as a create-feedback dialog and promises complete anonymity", () => {
    render(<ReviewFormModal {...props} />);

    expect(screen.getByRole("dialog", { name: /create feedback/i })).toBeInTheDocument();
    expect(screen.getByText("Your name, profile image, or initials will not be shown.")).toBeInTheDocument();
  });

  it("closes through its close control", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReviewFormModal {...props} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: /close create feedback/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("submits only when a comment is present", () => {
    const { rerender } = render(<ReviewFormModal {...props} />);
    expect(screen.getByRole("button", { name: /submit review/i })).toBeDisabled();

    rerender(<ReviewFormModal {...props} comment="Great service" />);
    expect(screen.getByRole("button", { name: /submit review/i })).toBeEnabled();
  });
});
