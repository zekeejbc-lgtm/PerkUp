import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Star, Store as StoreIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { PublicSiteFooter } from "../components/PublicPageShell";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { Seo } from "../components/Seo";
import { isStorePubliclyVisible } from "../lib/storeDirectory";
import { getAverageRating, getPublicReviews, toReviewDate, type StoreReview } from "../lib/storeReviews";
import { ReviewCard } from "../components/store-reviews/ReviewCard";
import { ReviewDetailsModal } from "../components/store-reviews/ReviewDetailsModal";
import { ReviewImageModal } from "../components/store-reviews/ReviewImageModal";
import { ScrollableRegion } from "../components/ScrollableRegion";
import { Pagination } from "../components/Pagination";
import { useCollectionPagination } from "../hooks/useCollectionPagination";

type ReviewStore = { id: string; name: string; logoUrl?: string; status?: string };

export default function StoreReviewsPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState<ReviewStore | null>(null);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [selectedReview, setSelectedReview] = useState<StoreReview | null>(null);
  const [selectedImage, setSelectedImage] = useState<{ url: string; alt: string } | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!storeId) {
        setMissing(true);
        setLoading(false);
        return;
      }
      try {
        const [storeSnapshot, reviewsSnapshot] = await Promise.all([
          getDoc(doc(db, "stores", storeId)),
          getDocs(query(collection(db, "store_reviews"), where("storeId", "==", storeId))),
        ]);
        if (!active) return;
        if (!storeSnapshot.exists() || !isStorePubliclyVisible(storeSnapshot.data())) {
          setMissing(true);
          return;
        }
        setStore({ id: storeSnapshot.id, ...storeSnapshot.data() } as ReviewStore);
        setReviews(
          getPublicReviews(reviewsSnapshot.docs.map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() } as StoreReview)))
            .sort((a, b) => (toReviewDate(b.createdAt)?.getTime() || 0) - (toReviewDate(a.createdAt)?.getTime() || 0)),
        );
      } catch (error) {
        console.error("Failed to load store reviews:", error);
        if (active) setMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [storeId]);

  const average = useMemo(() => getAverageRating(reviews), [reviews]);
  const reviewPagination = useCollectionPagination(reviews, 12);

  if (loading) return <PageSkeleton variant="reviews" />;
  if (missing || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-[#1b1b1b]">
        <Seo title="Store Not Found | Perk" canonicalPath={window.location.pathname} noIndex />
        <StoreIcon className="mb-4 h-10 w-10 text-gray-300 dark:text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Store not found</h1>
        <Link to="/stores" className="mt-6 font-semibold text-gray-900 hover:underline dark:text-white">Back to stores</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-[#1b1b1b]">
      <Seo title={`${store.name} Reviews | Perk`} description={`Read customer reviews for ${store.name}.`} canonicalPath={`/store/${store.id}/reviews`} />
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-white/10 dark:bg-[#1b1b1b]/90">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="Perk home"><BrandMark compact /></Link>
          <ThemeToggle />
        </nav>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Link to={`/store/${store.id}`} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to {store.name}
        </Link>
        <section className="mt-6 rounded-[2rem] border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">{store.name}</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">Customer Reviews</h1>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {reviews.length ? `${average.toFixed(1)} out of 5 · ${reviews.length} review${reviews.length === 1 ? "" : "s"}` : "No reviews yet."}
              </p>
            </div>
            {reviews.length > 0 && (
              <div className="flex text-gray-900 dark:text-white" aria-label={`${average.toFixed(1)} average rating`}>
                {[1, 2, 3, 4, 5].map((value) => <Star key={value} className={`h-5 w-5 ${value <= Math.round(average) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />)}
              </div>
            )}
          </div>
        </section>
        {reviews.length ? (
          <>
          <ScrollableRegion label={`${store.name} customer reviews`} data-testid="all-reviews-grid" className="mt-6 grid gap-4 pr-1 md:grid-cols-2 xl:grid-cols-3">
            {reviewPagination.pageItems.map((review) => <ReviewCard key={review.id} review={review} storeName={store.name} onOpenReview={setSelectedReview} onOpenImage={(url, alt) => setSelectedImage({ url, alt })} />)}
          </ScrollableRegion>
          <Pagination page={reviewPagination.page} pageSize={reviewPagination.pageSize} totalItems={reviewPagination.totalItems} onPageChange={reviewPagination.setPage} itemLabel="reviews" />
          </>
        ) : (
          <div className="mt-6 rounded-3xl border border-dashed border-gray-300 p-12 text-center text-gray-500 dark:border-gray-700 dark:text-gray-400">No customer reviews have been published yet.</div>
        )}
      </main>
      <PublicSiteFooter />
      {selectedReview && <ReviewDetailsModal review={selectedReview} storeName={store.name} onClose={() => setSelectedReview(null)} onOpenImage={(url, alt) => setSelectedImage({ url, alt })} suspended={Boolean(selectedImage)} />}
      {selectedImage && <ReviewImageModal imageUrl={selectedImage.url} alt={selectedImage.alt} onClose={() => setSelectedImage(null)} />}
    </div>
  );
}
