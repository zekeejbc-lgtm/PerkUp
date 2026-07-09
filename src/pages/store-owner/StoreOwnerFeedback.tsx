import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Inbox, MessageSquare, Star } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";

const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getInitials = (name?: string) => {
  const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "C";
};

export default function StoreOwnerFeedback({ store }: { store: any }) {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingReplyId, setSavingReplyId] = useState("");

  useEffect(() => {
    async function fetchFeedback() {
      if (!store?.id) return;
      setLoading(true);
      try {
        const q = query(collection(db, "store_reviews"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        const rows = snap.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .sort((a: any, b: any) => {
            const aTime = toDate(a.createdAt)?.getTime() ?? 0;
            const bTime = toDate(b.createdAt)?.getTime() ?? 0;
            return bTime - aTime;
          });
        setFeedback(rows);
      } catch (error) {
        console.error("Failed to fetch feedback", error);
      } finally {
        setLoading(false);
      }
    }

    fetchFeedback();
  }, [store?.id]);

  const saveReply = async (review: any) => {
    const reply = (replyDrafts[review.id] ?? review.ownerReply ?? "").trim();
    if (!reply) return;
    setSavingReplyId(review.id);
    try {
      const isUpdatingExistingReply = Boolean(review.ownerReply) && reply !== review.ownerReply;
      const replyPatch = {
        ownerReply: reply,
        ownerRepliedAt: serverTimestamp(),
        ...(isUpdatingExistingReply ? { ownerReplyUpdatedAt: serverTimestamp() } : {}),
      };
      await updateDoc(doc(db, "store_reviews", review.id), replyPatch);
      setFeedback((current) => current.map((item) => (
        item.id === review.id
          ? {
              ...item,
              ownerReply: reply,
              ownerRepliedAt: new Date().toISOString(),
              ...(isUpdatingExistingReply ? { ownerReplyUpdatedAt: new Date().toISOString() } : {}),
            }
          : item
      )));
      setReplyDrafts((current) => ({ ...current, [review.id]: reply }));
    } catch (error) {
      console.error("Failed to save store reply", error);
      alert("Failed to save reply. Please try again.");
    } finally {
      setSavingReplyId("");
    }
  };

  const averageRating = useMemo(() => {
    if (feedback.length === 0) return 0;
    const total = feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return total / feedback.length;
  }, [feedback]);

  if (loading) return <PageSkeleton variant="feedback" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Reviews</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Read customer reviews and publish a store response.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-800/60">
          <Star className="h-5 w-5 fill-[#1b1b1b] text-[#1b1b1b] dark:fill-white dark:text-white" />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Average</p>
            <p className="text-lg font-black text-gray-900 dark:text-white">
              {feedback.length > 0 ? averageRating.toFixed(1) : "No ratings"}
            </p>
          </div>
        </div>
      </div>

      {feedback.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-900">
          <Inbox className="mx-auto mb-4 h-12 w-12 text-gray-300 dark:text-gray-700" />
          <p className="font-bold text-gray-900 dark:text-white">No feedback yet.</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Customer feedback submitted from the store page will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {feedback.map((item) => {
            const createdAt = toDate(item.createdAt);
            const replyUpdatedAt = toDate(item.ownerReplyUpdatedAt);
            return (
              <article key={item.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-black text-gray-600 dark:bg-white/10 dark:text-gray-200">
                      {!item.anonymous && item.customerAvatarUrl ? (
                        <img src={getDisplayImageUrl(item.customerAvatarUrl)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span>{item.customerInitials || getInitials(item.customerName)}</span>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{item.customerName || "Customer"}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{createdAt ? createdAt.toLocaleDateString() : "Date unavailable"}</p>
                    </div>
                  </div>
                  <div className="flex text-[#1b1b1b] dark:text-white" aria-label={`${item.rating || 0} star rating`}>
                    {[...Array(5)].map((_, index) => (
                      <Star key={index} className={`h-4 w-4 ${index < Number(item.rating || 0) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/60">
                  <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <p className="text-sm font-medium leading-6 text-gray-700 dark:text-gray-300">{item.comment}</p>
                </div>
                {Array.isArray(item.imageUrls) && item.imageUrls.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {item.imageUrls.filter(Boolean).map((imageUrl: string, index: number) => (
                      <a
                        key={`${item.id}-${imageUrl}-${index}`}
                        href={getDisplayImageUrl(imageUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
                      >
                        <img src={getDisplayImageUrl(imageUrl)} alt={`Review photo ${index + 1}`} className="h-full w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                {item.ownerReply && (
                  <div className="mt-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Your public response</p>
                      {replyUpdatedAt && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          Updated {replyUpdatedAt.toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{item.ownerReply}</p>
                  </div>
                )}
                <div className="mt-4">
                  <label htmlFor={`reply-${item.id}`} className="text-sm font-semibold text-gray-900 dark:text-gray-200">
                    {item.ownerReply ? "Edit response" : "Reply to this review"}
                  </label>
                  <textarea
                    id={`reply-${item.id}`}
                    rows={3}
                    maxLength={500}
                    value={replyDrafts[item.id] ?? item.ownerReply ?? ""}
                    onChange={(event) => setReplyDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Write a public response from the store..."
                    className="mt-2 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => saveReply(item)}
                    disabled={savingReplyId === item.id || !(replyDrafts[item.id] ?? item.ownerReply ?? "").trim()}
                    className="mt-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
                  >
                    {savingReplyId === item.id ? "Saving..." : item.ownerReply ? "Update response" : "Publish response"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
