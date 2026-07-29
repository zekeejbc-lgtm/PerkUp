import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "./supabase";
import { moderateStoreReview } from "./storeReviewModeration";

vi.mock("./supabase", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

describe("moderateStoreReview", () => {
  beforeEach(() => vi.mocked(supabase.functions.invoke).mockReset());

  it("sends only the moderation action and review id", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { action: "remove", reviewId: "review-1", removed: true },
      error: null,
    } as never);

    await expect(moderateStoreReview({ action: "remove", reviewId: "review-1" })).resolves.toEqual({
      action: "remove",
      reviewId: "review-1",
      removed: true,
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith("store-review-moderation", {
      body: { action: "remove", reviewId: "review-1" },
    });
  });

  it("surfaces a server moderation error", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { error: "You are not allowed to moderate this review." },
      error: null,
    } as never);

    await expect(moderateStoreReview({ action: "hide", reviewId: "review-1" }))
      .rejects.toThrow("You are not allowed to moderate this review.");
  });
});
