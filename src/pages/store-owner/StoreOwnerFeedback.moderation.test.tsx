import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoreOwnerFeedback from "./StoreOwnerFeedback";
import { moderateStoreReview } from "../../lib/storeReviewModeration";

const getDocs = vi.fn();

vi.mock("@/src/lib/dataCompat", () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: (...args: unknown[]) => getDocs(...args),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => "server-time"),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock("../../lib/backend", () => ({ db: {} }));
vi.mock("../../lib/storeReviewModeration", () => ({ moderateStoreReview: vi.fn() }));
vi.mock("../../components/CategorySearchInput", () => ({ CategorySearchInput: () => null }));
vi.mock("../../components/Pagination", () => ({ Pagination: () => null }));

const snapshot = (id: string, data: Record<string, unknown>) => ({ id, data: () => data });

describe("StoreOwnerFeedback moderation", () => {
  beforeEach(() => {
    vi.mocked(moderateStoreReview).mockReset();
    getDocs.mockResolvedValue({
      docs: [
        snapshot("visible", { customerName: "Visible Customer", rating: 5, comment: "Visible review" }),
        snapshot("hidden", { customerName: "Hidden Customer", rating: 2, comment: "Hidden review", hidden: true }),
      ],
    });
  });

  it("labels hidden reviews and restores one after the server succeeds", async () => {
    vi.mocked(moderateStoreReview).mockResolvedValue({ action: "show", reviewId: "hidden", hidden: false });
    const user = userEvent.setup();
    render(<StoreOwnerFeedback store={{ id: "store-1" }} />);

    expect(await screen.findByText("Hidden")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /show review from hidden customer/i }));
    await waitFor(() => expect(screen.queryByText("Hidden")).not.toBeInTheDocument());
  });

  it("requires confirmation before permanent removal", async () => {
    vi.mocked(moderateStoreReview).mockResolvedValue({ action: "remove", reviewId: "visible", removed: true });
    const user = userEvent.setup();
    render(<StoreOwnerFeedback store={{ id: "store-1" }} />);

    await user.click(await screen.findByRole("button", { name: /remove review from visible customer/i }));
    expect(screen.getByRole("dialog", { name: /permanently remove review/i })).toBeInTheDocument();
    expect(screen.getAllByText("Visible review")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: /confirm permanent removal/i }));
    await waitFor(() => expect(screen.queryByText("Visible review")).not.toBeInTheDocument());
  });
});
