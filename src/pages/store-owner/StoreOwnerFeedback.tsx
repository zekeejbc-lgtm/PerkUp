import { useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { BarChart3, CheckCircle2, Clock3, Eye, EyeOff, Inbox, MessageSquare, Star, Trash2, TrendingDown, TrendingUp, UserRound, X } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { Pagination } from "../../components/Pagination";
import { CategorySearchInput } from "../../components/CategorySearchInput";
import { moderateStoreReview } from "../../lib/storeReviewModeration";
import { ScrollableRegion, ScrollableTableRegion } from "../../components/ScrollableRegion";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [moderatingReviewId, setModeratingReviewId] = useState("");
  const [reviewToRemove, setReviewToRemove] = useState<any | null>(null);
  const [moderationError, setModerationError] = useState("");

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

  const toggleReviewVisibility = async (review: any) => {
    const action = review.hidden ? "show" : "hide";
    setModeratingReviewId(review.id);
    setModerationError("");
    try {
      await moderateStoreReview({ action, reviewId: review.id });
      setFeedback((current) => current.map((item) => (
        item.id === review.id
          ? {
              ...item,
              hidden: action === "hide",
              hiddenAt: action === "hide" ? new Date().toISOString() : undefined,
              hiddenBy: action === "hide" ? "current-store-owner" : undefined,
            }
          : item
      )));
    } catch (error) {
      console.error("Failed to change review visibility", error);
      setModerationError(error instanceof Error ? error.message : "Failed to change review visibility.");
    } finally {
      setModeratingReviewId("");
    }
  };

  const removeReview = async () => {
    if (!reviewToRemove) return;
    const review = reviewToRemove;
    setModeratingReviewId(review.id);
    setModerationError("");
    try {
      const result = await moderateStoreReview({ action: "remove", reviewId: review.id });
      setFeedback((current) => current.filter((item) => item.id !== review.id));
      setReplyDrafts((current) => {
        const next = { ...current };
        delete next[review.id];
        return next;
      });
      setReviewToRemove(null);
      if (result.cleanupFailures) {
        setModerationError(`Review removed, but ${result.cleanupFailures} image${result.cleanupFailures === 1 ? "" : "s"} could not be cleaned up.`);
      }
    } catch (error) {
      console.error("Failed to remove review", error);
      setModerationError(error instanceof Error ? error.message : "Failed to remove review.");
    } finally {
      setModeratingReviewId("");
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
      monthlyPerformance: Array.from({ length: 6 }, (_, index) => {
        const month = new Date(now);
        month.setDate(1);
        month.setHours(0, 0, 0, 0);
        month.setMonth(month.getMonth() - (5 - index));
        const nextMonth = new Date(month);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const rows = feedback.filter((item) => {
          const createdAt = toDate(item.createdAt);
          return createdAt && createdAt >= month && createdAt < nextMonth;
        });
        const monthReplied = rows.filter((item) => Boolean(item.ownerReply)).length;
        return {
          key: `${month.getFullYear()}-${month.getMonth()}`,
          label: month.toLocaleDateString(undefined, { month: "short" }),
          fullLabel: month.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
          count: rows.length,
          average: average(rows),
          responseRate: rows.length ? Math.round((monthReplied / rows.length) * 100) : 0,
        };
      }),
    };
  }, [feedback]);

  const filteredFeedback = useMemo(() => {
    const terms = searchQuery.toLocaleLowerCase().split(",").map((term) => term.trim()).filter(Boolean);
    return feedback.filter((item) => {
      if (filter === "unanswered" && item.ownerReply) return false;
      if (filter === "low" && Number(item.rating || 0) > 3) return false;
      if (!terms.length) return true;
      const rating = Number(item.rating || 0);
      const responseStatus = item.ownerReply ? "responded" : "unanswered";
      const searchable = [
        item.publicId,
        item.anonymous ? "anonymous" : item.customerName,
        item.comment,
        item.ownerReply,
        `${rating} star`,
        `${rating} stars`,
        responseStatus,
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => {
        if (["responded", "unanswered"].includes(term)) return responseStatus === term;
        if (term === "anonymous") return Boolean(item.anonymous);
        const ratingMatch = term.match(/^([1-5]) stars?$/);
        if (ratingMatch) return rating === Number(ratingMatch[1]);
        return searchable.includes(term);
      });
    });
  }, [feedback, filter, searchQuery]);
  const totalPages = Math.max(1, Math.ceil(filteredFeedback.length / REVIEWS_PER_PAGE));
  const paginatedFeedback = filteredFeedback.slice((currentPage - 1) * REVIEWS_PER_PAGE, currentPage * REVIEWS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

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

      <CategorySearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        categories={["Unanswered", "Responded", "Anonymous", "5 Stars", "4 Stars", "3 Stars", "2 Stars", "1 Star"]}
        placeholder="Search reviews or filter by rating, response..."
        ariaLabel="Search and filter store reviews"
        suggestionLabel="review filter"
        collapsibleFilters
        resultsId="store-review-results"
        className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-12 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-gray-500"
      />

      {moderationError && (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {moderationError}
        </div>
      )}

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

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(28rem,1.15fr)]">
          <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900" aria-labelledby="review-volume-heading">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="review-volume-heading" className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Review Volume</h3>
                <p className="mt-1 text-xs text-gray-500">Last six calendar months</p>
              </div>
              <BarChart3 className="h-5 w-5 text-gray-400" />
            </div>
            <div className="mt-6 flex h-48 items-end gap-3" role="img" aria-label="Monthly review volume bar chart">
              {analytics.monthlyPerformance.map((month) => {
                const maximum = Math.max(1, ...analytics.monthlyPerformance.map((row) => row.count));
                const height = month.count ? Math.max(12, Math.round((month.count / maximum) * 100)) : 4;
                return (
                  <div key={month.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{month.count}</span>
                    <div className="flex h-32 w-full items-end overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
                      <div className="w-full rounded-xl bg-gray-900 transition-[height] dark:bg-white" style={{ height: `${height}%` }} title={`${month.fullLabel}: ${month.count} reviews`} />
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{month.label}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900" aria-labelledby="monthly-performance-heading">
            <div className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <h3 id="monthly-performance-heading" className="text-sm font-bold uppercase tracking-widest text-gray-900 dark:text-white">Monthly Performance</h3>
              <p className="mt-1 text-xs text-gray-500">Volume, average rating, and response coverage</p>
            </div>
            <ScrollableTableRegion label="Monthly review performance">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500 dark:bg-gray-800/60">
                  <tr><th className="px-5 py-3">Month</th><th className="px-4 py-3 text-right">Reviews</th><th className="px-4 py-3 text-right">Avg. rating</th><th className="px-5 py-3 text-right">Response rate</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {[...analytics.monthlyPerformance].reverse().map((month) => (
                    <tr key={month.key}>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white">{month.fullLabel}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{month.count}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{month.count ? month.average.toFixed(1) : "—"}</td>
                      <td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">{month.count ? `${month.responseRate}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollableTableRegion>
          </section>
        </div>

        <div id="store-review-results" className="scroll-mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
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

            <ScrollableRegion label="Customer feedback" className="grid gap-4 pr-1">
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
                      ) : !item.anonymous ? (
                        <span>{item.customerInitials || getInitials(item.customerName)}</span>
                      ) : (
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-gray-900 dark:text-white">{item.anonymous ? "Anonymous Customer" : item.customerName || "Customer"}</p>
                        {item.hidden && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">Hidden</span>}
                      </div>
                      {item.publicId && <p className="font-mono text-[10px] font-semibold text-gray-400">{item.publicId}</p>}
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
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => toggleReviewVisibility(item)}
                    disabled={moderatingReviewId === item.id}
                    aria-label={`${item.hidden ? "Show" : "Hide"} review from ${item.anonymous ? "Anonymous Customer" : item.customerName || "Customer"}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    {item.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    {moderatingReviewId === item.id ? "Updating..." : item.hidden ? "Show review" : "Hide review"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewToRemove(item)}
                    disabled={moderatingReviewId === item.id}
                    aria-label={`Remove review from ${item.anonymous ? "Anonymous Customer" : item.customerName || "Customer"}`}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-4 w-4" /> Remove review
                  </button>
                </div>
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
                    aria-label={item.ownerReply ? "Update public response" : "Publish public response"}
                    className="mt-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900"
                  >
                    {savingReplyId === item.id ? "Saving..." : item.ownerReply ? "Update" : "Publish"}
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
            </ScrollableRegion>
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

      {reviewToRemove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-review-heading"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !moderatingReviewId) setReviewToRemove(null);
          }}
        >
          <div className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-600 dark:text-red-400">Permanent action</p>
                <h2 id="remove-review-heading" className="mt-1 text-xl font-bold text-gray-900 dark:text-white">Permanently remove review</h2>
              </div>
              <button type="button" disabled={Boolean(moderatingReviewId)} onClick={() => setReviewToRemove(null)} aria-label="Close remove review confirmation" className="rounded-full p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-4 text-sm leading-6 text-gray-600 dark:text-gray-300">This deletes the review and its uploaded images. It cannot be undone.</p>
            <blockquote className="mt-4 line-clamp-3 rounded-2xl bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-300">{reviewToRemove.comment || "No written comment."}</blockquote>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" disabled={Boolean(moderatingReviewId)} onClick={() => setReviewToRemove(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800">Cancel</button>
              <button type="button" disabled={Boolean(moderatingReviewId)} onClick={removeReview} aria-label="Confirm permanent removal" className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                <Trash2 className="h-4 w-4" /> {moderatingReviewId ? "Removing..." : "Remove permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
