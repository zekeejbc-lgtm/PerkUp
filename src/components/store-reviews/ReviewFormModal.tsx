import { useEffect, useRef, type FormEvent } from "react";
import { Image as ImageIcon, Send, Star, X } from "lucide-react";

type Props = {
  rating: number;
  comment: string;
  anonymous: boolean;
  imageFiles: File[];
  imagePreviews: string[];
  submitting: boolean;
  onRatingChange: (rating: number) => void;
  onCommentChange: (comment: string) => void;
  onAnonymousChange: (anonymous: boolean) => void;
  onImagesChange: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
  onSubmit: (event: FormEvent) => void | Promise<void>;
  onClose: () => void;
};

export function ReviewFormModal({
  rating,
  comment,
  anonymous,
  imageFiles,
  imagePreviews,
  submitting,
  onRatingChange,
  onCommentChange,
  onAnonymousChange,
  onImagesChange,
  onRemoveImage,
  onSubmit,
  onClose,
}: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      opener?.focus();
    };
  }, [onClose, submitting]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-feedback-heading"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl dark:bg-gray-900">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5 dark:border-gray-800 dark:bg-gray-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Customer review</p>
            <h2 id="create-feedback-heading" className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Create feedback</h2>
          </div>
          <button ref={closeButtonRef} type="button" disabled={submitting} onClick={onClose} aria-label="Close create feedback" className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 p-6">
          <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/60">
            <input type="checkbox" checked={anonymous} onChange={(event) => onAnonymousChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
            <span>
              <span className="block font-semibold text-gray-900 dark:text-gray-100">Stay anonymous</span>
              <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">Your name, profile image, or initials will not be shown.</span>
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-900 dark:text-gray-200">Rating</legend>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => onRatingChange(value)} className="rounded-xl p-1.5 text-[#1b1b1b] hover:bg-gray-100 dark:text-white dark:hover:bg-white/10" aria-label={`${value} star rating`}>
                  <Star className={`h-7 w-7 ${value <= rating ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="review-comment" className="text-sm font-semibold text-gray-900 dark:text-gray-200">Comments</label>
            <textarea id="review-comment" required rows={4} maxLength={500} value={comment} onChange={(event) => onCommentChange(event.target.value)} className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="Share your experience with this store..." />
            <p className="text-xs text-gray-400">{comment.length}/500</p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-sm font-semibold text-gray-900 dark:text-gray-200" htmlFor="review-images">Review photos</label>
              <span className="text-xs font-medium text-gray-400">{imageFiles.length}/3</span>
            </div>
            <label htmlFor="review-images" className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-600 hover:border-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <ImageIcon className="h-5 w-5" /> Add images
            </label>
            <input id="review-images" type="file" accept="image/*" multiple onChange={(event) => onImagesChange(event.target.files)} className="sr-only" />
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {imagePreviews.map((previewUrl, index) => (
                  <div key={previewUrl} className="relative aspect-square overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
                    <img src={previewUrl} alt={`Selected review photo ${index + 1}`} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => onRemoveImage(index)} aria-label={`Remove review photo ${index + 1}`} className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white hover:bg-black"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" disabled={submitting || !comment.trim()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900">
            <Send className="h-4 w-4" />
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </form>
      </div>
    </div>
  );
}
