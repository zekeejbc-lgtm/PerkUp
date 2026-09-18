import { MessageSquare, Star, UserRound } from "lucide-react";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { getPublicReviewer, getReviewDate, type StoreReview } from "../../lib/storeReviews";

type Props = {
  review: StoreReview;
  storeName: string;
  onOpenReview: (review: StoreReview) => void;
  onOpenImage: (imageUrl: string, alt: string) => void;
  compact?: boolean;
};

export function ReviewCard({ review, storeName, onOpenReview, onOpenImage, compact = false }: Props) {
  const reviewer = getPublicReviewer(review);
  const imageUrls = Array.isArray(review.imageUrls) ? review.imageUrls.filter(Boolean) : [];

  return (
    <article
      data-testid={`review-card-${review.id}`}
      className={`flex h-full flex-col rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 ${compact ? "w-[19rem] sm:w-[22rem]" : "w-full"}`}
    >
      <button
        type="button"
        onClick={() => onOpenReview(review)}
        aria-label={`Open full review from ${reviewer.name}`}
        className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 dark:focus-visible:ring-white/40"
      >
        <span className="flex w-full items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-black text-gray-600 dark:bg-white/10 dark:text-gray-200">
              {reviewer.avatarUrl ? (
                <img src={getDisplayImageUrl(reviewer.avatarUrl)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              ) : reviewer.initials ? (
                <span>{reviewer.initials}</span>
              ) : (
                <UserRound className="h-5 w-5" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold text-gray-900 dark:text-white">{reviewer.name}</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">{getReviewDate(review.createdAt) || "Recent review"}</span>
            </span>
          </span>
          <span className="flex shrink-0 text-[#1b1b1b] dark:text-white" aria-label={`${review.rating || 0} star rating`}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Star key={value} className={`h-3.5 w-3.5 ${value <= Number(review.rating || 0) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
            ))}
          </span>
        </span>
        <span className="mt-4 line-clamp-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
          {review.comment || "No written comment."}
        </span>
        {review.ownerReply && (
          <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
            <MessageSquare className="h-3.5 w-3.5" />
            Response from {storeName}
          </span>
        )}
      </button>

      {imageUrls.length > 0 && (
        <div className="mt-4 flex gap-2">
          {imageUrls.map((imageUrl, index) => {
            const alt = `Review photo ${index + 1}`;
            return (
              <button
                key={`${review.id}-${imageUrl}-${index}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenImage(imageUrl, alt);
                }}
                aria-label={`Open ${alt.toLowerCase()}`}
                className="h-14 w-14 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30 dark:border-gray-700 dark:bg-gray-800 dark:focus-visible:ring-white/40"
              >
                <img src={getDisplayImageUrl(imageUrl)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
              </button>
            );
          })}
        </div>
      )}
    </article>
  );
}
