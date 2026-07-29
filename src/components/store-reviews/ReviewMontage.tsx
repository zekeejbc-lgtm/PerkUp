import { useState } from "react";
import type { StoreReview } from "../../lib/storeReviews";
import { ReviewCard } from "./ReviewCard";

type Props = {
  reviews: StoreReview[];
  storeName: string;
  onOpenReview: (review: StoreReview) => void;
  onOpenImage: (imageUrl: string, alt: string) => void;
};

export function ReviewMontage({ reviews, storeName, onOpenReview, onOpenImage }: Props) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const shouldLoop = reviews.length > 1;
  const cards = (copy = false) => reviews.map((review) => (
    <ReviewCard
      key={`${copy ? "copy-" : ""}${review.id}`}
      review={review}
      storeName={storeName}
      onOpenReview={onOpenReview}
      onOpenImage={onOpenImage}
      compact
    />
  ));

  return (
    <div
      data-testid="review-montage"
      data-paused={hovered || focused ? "true" : "false"}
      className="review-montage overflow-x-auto pb-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className={`flex w-max gap-4 ${shouldLoop ? "review-montage-track" : ""}`}>
        <div className="flex gap-4">{cards()}</div>
        {shouldLoop && <div data-testid="review-montage-duplicate" aria-hidden="true" inert className="flex gap-4">{cards(true)}</div>}
      </div>
    </div>
  );
}
