import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { StoreReview } from "../../lib/storeReviews";
import { ReviewCard } from "./ReviewCard";
import { ReviewDetailsModal } from "./ReviewDetailsModal";
import { ReviewImageModal } from "./ReviewImageModal";
import { ReviewMontage } from "./ReviewMontage";

const review: StoreReview = {
  id: "review-1",
  anonymous: true,
  customerName: "Secret Name",
  customerInitials: "SN",
  customerAvatarUrl: "https://example.com/secret.jpg",
  rating: 4,
  comment: "A complete anonymous review that must remain available in details.",
  imageUrls: ["https://example.com/review.jpg"],
  createdAt: "2026-07-29T00:00:00.000Z",
};

describe("store review experience", () => {
  it("never exposes stored anonymous identity", () => {
    render(<ReviewCard review={review} storeName="Perk Cafe" onOpenReview={vi.fn()} onOpenImage={vi.fn()} />);

    expect(screen.queryByText("SN")).not.toBeInTheDocument();
    expect(screen.queryByText("Secret Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /secret name/i })).not.toBeInTheDocument();
    expect(screen.getByText("Anonymous Customer")).toBeInTheDocument();
  });

  it("opens review details from the card but only the image from a thumbnail", async () => {
    const onOpenReview = vi.fn();
    const onOpenImage = vi.fn();
    const user = userEvent.setup();
    render(<ReviewCard review={review} storeName="Perk Cafe" onOpenReview={onOpenReview} onOpenImage={onOpenImage} />);

    await user.click(screen.getByRole("button", { name: /open full review/i }));
    expect(onOpenReview).toHaveBeenCalledWith(review);

    onOpenReview.mockClear();
    await user.click(screen.getByRole("button", { name: /open review photo 1/i }));
    expect(onOpenImage).toHaveBeenCalledWith("https://example.com/review.jpg", "Review photo 1");
    expect(onOpenReview).not.toHaveBeenCalled();
  });

  it("shows the complete comment in review details", () => {
    render(<ReviewDetailsModal review={review} storeName="Perk Cafe" onClose={vi.fn()} onOpenImage={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /review from anonymous customer/i })).toBeInTheDocument();
    expect(screen.getByText(review.comment!)).not.toHaveClass("line-clamp-2");
  });

  it("shows the full image without cropping", () => {
    render(<ReviewImageModal imageUrl="https://example.com/review.jpg" alt="Review photo 1" onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: /review photo 1/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Review photo 1" })).toHaveClass("object-contain");
  });

  it("keeps a single review stationary and duplicates multiple reviews for a seamless montage", () => {
    const props = { storeName: "Perk Cafe", onOpenReview: vi.fn(), onOpenImage: vi.fn() };
    const { rerender } = render(<ReviewMontage reviews={[review]} {...props} />);
    expect(screen.getAllByTestId("review-card-review-1")).toHaveLength(1);
    expect(screen.queryByTestId("review-montage-duplicate")).not.toBeInTheDocument();

    rerender(<ReviewMontage reviews={[review, { ...review, id: "review-2" }]} {...props} />);
    expect(screen.getByTestId("review-montage-duplicate")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks the montage as paused while hovered or keyboard-focused", () => {
    render(<ReviewMontage reviews={[review, { ...review, id: "review-2" }]} storeName="Perk Cafe" onOpenReview={vi.fn()} onOpenImage={vi.fn()} />);
    const montage = screen.getByTestId("review-montage");

    fireEvent.mouseEnter(montage);
    expect(montage).toHaveAttribute("data-paused", "true");
    fireEvent.mouseLeave(montage);
    expect(montage).toHaveAttribute("data-paused", "false");
    fireEvent.focus(screen.getAllByRole("button", { name: /open full review/i })[0]);
    expect(montage).toHaveAttribute("data-paused", "true");
  });
});
