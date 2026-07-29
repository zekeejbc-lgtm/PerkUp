import { useEffect, useRef } from "react";
import { Star, UserRound, X } from "lucide-react";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { getPublicReviewer, getReviewDate, type StoreReview } from "../../lib/storeReviews";

type Props = {
  review: StoreReview;
  storeName: string;
  onClose: () => void;
  onOpenImage: (imageUrl: string, alt: string) => void;
  suspended?: boolean;
};

export function ReviewDetailsModal({ review, storeName, onClose, onOpenImage, suspended = false }: Props) {
  const reviewer = getPublicReviewer(review);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !suspended) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose, suspended]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Review from ${reviewer.name}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !suspended) onClose();
      }}
    >
      <article className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-gray-900 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 font-black text-gray-600 dark:bg-white/10 dark:text-gray-200">
              {reviewer.avatarUrl ? <img src={getDisplayImageUrl(reviewer.avatarUrl)} alt="" className="h-full w-full object-cover" /> : reviewer.initials ? <span>{reviewer.initials}</span> : <UserRound className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{reviewer.name}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{getReviewDate(review.createdAt) || "Recent review"}</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close full review" className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 flex text-[#1b1b1b] dark:text-white" aria-label={`${review.rating || 0} star rating`}>
          {[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-5 w-5 ${value <= Number(review.rating || 0) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />)}
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-gray-700 dark:text-gray-300">{review.comment || "No written comment."}</p>
        {Array.isArray(review.imageUrls) && review.imageUrls.filter(Boolean).length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {review.imageUrls.filter(Boolean).map((imageUrl, index) => {
              const alt = `Review photo ${index + 1}`;
              return <button key={`${imageUrl}-${index}`} type="button" onClick={() => onOpenImage(imageUrl, alt)} aria-label={`Open ${alt.toLowerCase()}`} className="h-20 w-20 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"><img src={getDisplayImageUrl(imageUrl)} alt="" className="h-full w-full object-cover" /></button>;
            })}
          </div>
        )}
        {review.ownerReply && (
          <div className="mt-6 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Response from {storeName}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-300">{review.ownerReply}</p>
            {review.ownerReplyUpdatedAt && <p className="mt-2 text-xs text-gray-400">Updated {getReviewDate(review.ownerReplyUpdatedAt)}</p>}
          </div>
        )}
      </article>
    </div>
  );
}

