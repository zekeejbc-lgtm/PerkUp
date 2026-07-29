import { supabase } from "./supabase";

export type ReviewModerationAction = "hide" | "show" | "remove";

export type ReviewModerationResult = {
  action: ReviewModerationAction;
  reviewId: string;
  hidden?: boolean;
  removed?: boolean;
  cleanupFailures?: number;
};

export async function moderateStoreReview(input: {
  action: ReviewModerationAction;
  reviewId: string;
}): Promise<ReviewModerationResult> {
  const { data, error } = await supabase.functions.invoke<ReviewModerationResult & { error?: string }>(
    "store-review-moderation",
    { body: { action: input.action, reviewId: input.reviewId } },
  );
  if (error || !data || data.error) {
    throw new Error(data?.error || error?.message || "Review moderation failed.");
  }
  return data;
}

