import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { BarChart3, CheckCircle2, Clock3, Inbox, MessageSquare, Star, TrendingDown, TrendingUp } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { Pagination } from "../../components/Pagination";

const REVIEWS_PER_PAGE = 6;

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
  const [filter, setFilter] = useState<"all" | "unanswered" | "low">("all");
  const [currentPage, setCurrentPage] = useState(1);

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

  const analytics = useMemo(() => {
    const distribution = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: feedback.filter((item) => Number(item.rating || 0) === rating).length,
    }));
    const replied = feedback.filter((item) => Boolean(item.ownerReply)).length;
    const lowRatings = feedback.filter((item) => Number(item.rating || 0) <= 3).length;
    const now = Date.now();
    const recentWindowMs = 30 * 24 * 60 * 60 * 1000;
    const recent = feedback.filter((item) => {
      const createdAt = toDate(item.createdAt);
      return createdAt ? now - createdAt.getTime() <= recentWindowMs : false;
    });
    const previous = feedback.filter((item) => {
      const createdAt = toDate(item.createdAt);
      if (!createdAt) return false;
      const age = now - createdAt.getTime();
      return age > recentWindowMs && age <= recentWindowMs * 2;
    });
    const average = (rows: any[]) => rows.length
      ? rows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / rows.length
      : 0;
    const recentAverage = average(recent);
    const previousAverage = average(previous);
    const trend = recentAverage && previousAverage ? recentAverage - previousAverage : 0;

    return {
      distribution,
      replied,
      unanswered: feedback.length - replied,
      responseRate: feedback.length ? Math.round((replied / feedback.length) * 100) : 0,
      lowRatings,
      recentCount: recent.length,
      recentAverage,
      trend,
    };
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    if (filter === "unanswered") return feedback.filter((item) => !item.ownerReply);
    if (filter === "low") return feedback.filter((item) => Number(item.rating || 0) <= 3);
    return feedback;
  }, [feedback, filter]);
  const totalPages = Math.max(1, Math.ceil(filteredFeedback.length / REVIEWS_PER_PAGE));
  const paginatedFeedback = filteredFeedback.slice((currentPage - 1) * REVIEWS_PER_PAGE, currentPage * REVIEWS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (loading) return <PageSkeleton variant="feedback" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Reviews</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Track rating patterns, response coverage, and customer issues.</p>
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
        <>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-gray-500">
              <MessageSquare className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-widest">Total Reviews</p>
            </div>
            <p className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{feedback.length}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{analytics.recentCount} in the last 30 days</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-gray-500">
              <CheckCircle2 className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-widest">Response Rate</p>
            </div>
            <p className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{analytics.responseRate}%</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{analytics.unanswered} unanswered</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-gray-500">
              <Clock3 className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-widest">30-Day Average</p>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <p className="text-3xl font-black text-gray-900 dark:text-white">{analytics.recentAverage ? analytics.recentAverage.toFixed(1) : "-"}</p>
              {analytics.trend !== 0 && (
                <span className={`mb-1 inline-flex items-center gap-1 text-sm font-bold ${analytics.trend > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                  {analytics.trend > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {Math.abs(analytics.trend).toFixed(1)}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Compared with prior 30 days</p>
          </div>
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 text-gray-500">
              <BarChart3 className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-widest">Needs Attention</p>
            </div>
            <p className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{analytics.lowRatings}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Reviews rated 3 stars or below</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Review Queue</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["unanswered", "Unanswered"],
                  ["low", "3 stars or below"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value as typeof filter)}
                    className={`rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                      filter === value
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
          {paginatedFeedback.map((item) => {
            const createdAt = toDate(item.createdAt);
            const replyUpdatedAt = toDate(item.ownerReplyUpdatedAt);
            return (
              <article key={item.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-black text-gray-600 dark:bg-white/10 dark:text-gray-200">
                      {!item.anonymous && item.customerAvatarUrl ? (
                        <img src={getDisplayImageUrl(item.customerAvatarUrl)} alt="" loading="lazy" className="h-full w-full object-cover" />
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
          {filteredFeedback.length === 0 && (
            <div className="rounded-2xl border border-dashed border-gray-200 p-8 text-center dark:border-gray-700">
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No reviews match this filter.</p>
            </div>
          )}
            </div>
            <Pagination
              page={currentPage}
              pageSize={REVIEWS_PER_PAGE}
              totalItems={filteredFeedback.length}
              itemLabel="reviews"
              onPageChange={setCurrentPage}
            />
          </div>

          <aside className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Rating Distribution</h3>
            <div className="mt-5 space-y-4">
              {analytics.distribution.map(({ rating, count }) => {
                const width = feedback.length ? Math.round((count / feedback.length) * 100) : 0;
                return (
                  <div key={rating} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                      <span>{rating} star</span>
                      <span>{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-gray-900 dark:bg-white" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
        </>
      )}
    </div>
  );
}
