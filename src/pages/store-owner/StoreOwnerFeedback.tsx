import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Inbox, MessageSquare, Star, User } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";

const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export default function StoreOwnerFeedback({ store }: { store: any }) {
  const [feedback, setFeedback] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFeedback() {
      if (!store?.id) return;
      setLoading(true);
      try {
        const q = query(collection(db, "feedback"), where("storeId", "==", store.id));
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

  const averageRating = useMemo(() => {
    if (feedback.length === 0) return 0;
    const total = feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0);
    return total / feedback.length;
  }, [feedback]);

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Feedback</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Read customer comments and ratings for this branch.</p>
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
            return (
              <article key={item.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300">
                      <User className="h-5 w-5" />
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
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
