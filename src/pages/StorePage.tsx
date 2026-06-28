import { useParams, Link } from "react-router-dom";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { ArrowLeft, MapPin, Phone, Globe, Clock, Star, Share2, MessageSquare, Send, Image as ImageIcon, Utensils } from "lucide-react";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { DirectionsButton } from "../components/DirectionsButton";
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { PublicSiteFooter } from "../components/PublicPageShell";

interface StoreContent {
  id: string;
  name: string;
  description?: string;
  contact?: string;
  website?: string;
  address?: string;
  hours?: string;
  openingHours?: string;
  lat?: number | string;
  lng?: number | string;
  latitude?: number | string;
  longitude?: number | string;
  logoUrl?: string;
  images?: string[];
  menuUrl?: string;
}

interface StoreProduct {
  id: string;
  name: string;
  price?: number | string;
  imageUrl?: string;
  ingredients?: string;
  available?: boolean;
}

export default function StorePage() {
  const { storeId } = useParams();
  const { user } = useAuth();
  const [store, setStore] = useState<StoreContent | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  const handleShare = async () => {
    if (!store) return;

    const shareData = {
      title: `${store.name} | PerkUp`,
      text: `View ${store.name} on PerkUp.`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus("Shared");
      } else {
        await navigator.clipboard.writeText(window.location.href);
        setShareStatus("Link copied");
      }
      window.setTimeout(() => setShareStatus(""), 2500);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("Unable to share");
      window.setTimeout(() => setShareStatus(""), 2500);
    }
  };

  useEffect(() => {
    async function fetchStore() {
      if (!storeId) return;
      try {
        const [docSnap, productsSnap] = await Promise.all([
          getDoc(doc(db, "stores", storeId)),
          getDocs(query(collection(db, "products"), where("storeId", "==", storeId))),
        ]);
        
        if (docSnap.exists()) {
          setStore({ id: docSnap.id, ...docSnap.data() } as StoreContent);
          setProducts(productsSnap.docs.map((productDoc) => ({
            id: productDoc.id,
            ...productDoc.data(),
          })) as StoreProduct[]);
        } else {
          setStore(null);
          setProducts([]);
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        setStore(null);
      } finally {
        setLoading(false);
      }
    }
    fetchStore();
  }, [storeId]);

  const handleFeedbackSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || !store || !user || user.role !== "customer") return;

    setSubmittingFeedback(true);
    setFeedbackSent(false);
    try {
      const feedbackRef = doc(collection(db, "feedback"));
      await setDoc(feedbackRef, {
        storeId,
        storeName: store.name,
        customerId: user.id,
        customerName: user.name || "Customer",
        customerEmail: user.email || "",
        rating,
        comment: comment.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setComment("");
      setRating(5);
      setFeedbackSent(true);
    } catch (error) {
      console.error("Failed to submit feedback:", error);
      alert("Failed to submit feedback. Please try again.");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  if (loading) {
    return <PageSkeleton variant="store" />;
  }

  if (!store) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1b1b1b] flex flex-col justify-center items-center transition-colors">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Store Not Found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">The store you are looking for does not exist or has been removed.</p>
        <Link to="/" className="text-[#1b1b1b] dark:text-white hover:text-[#1b1b1b] dark:hover:text-white font-medium">Return to Home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1b1b1b] selection:bg-[#1b1b1b] selection:text-white dark:selection:bg-white dark:selection:text-[#1b1b1b] pb-20 transition-colors">
      <header className="sticky top-0 z-50 border-b border-[#1b1b1b]/10 bg-white/85 backdrop-blur-md transition-colors dark:border-white/10 dark:bg-[#1b1b1b]/85">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="PerkUp home">
            <BrandMark compact />
          </Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <Link
                to="/dashboard"
                className="rounded-full bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/"
                state={{ authRequired: true, returnTo: window.location.pathname }}
                className="text-sm font-medium text-[#1b1b1b] transition-opacity hover:opacity-70 dark:text-white"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>

      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            {shareStatus && <span className="text-xs font-medium text-gray-500 dark:text-gray-400" role="status">{shareStatus}</span>}
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label={`Share ${store.name}`}
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="mb-12 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          {/* Store overview */}
          <section className="flex min-h-72 flex-col justify-center rounded-[2rem] border border-gray-200 bg-gray-50 p-7 dark:border-gray-800 dark:bg-gray-900 sm:p-10">
            <div className="mb-6 flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1b1b1b]">
              {store.logoUrl ? (
                <img src={getDisplayImageUrl(store.logoUrl)} alt={`${store.name} logo`} className="h-full w-full object-cover" />
              ) : (
                <Star className="h-10 w-10 text-gray-300 dark:text-gray-700" />
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 transition-colors dark:text-white sm:text-5xl">{store.name}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-500 transition-colors dark:text-gray-400 sm:text-lg">
              {store.description || "A participating partner in our digital rewards program."}
            </p>
          </section>

          {/* Essential information */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-start gap-4 transition-colors">
            <div className="bg-gray-100 dark:bg-white/10 p-3 rounded-2xl text-[#1b1b1b] dark:text-white shrink-0 transition-colors">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 transition-colors">Location</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">{store.address || "Tagum City, Philippines"}</p>
              <DirectionsButton
                destination={{
                  lat: store.lat ?? store.latitude,
                  lng: store.lng ?? store.longitude,
                  address: store.address,
                  name: store.name,
                }}
                className="text-[#1b1b1b] dark:text-white text-sm font-medium mt-2 hover:underline transition-colors"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-start gap-4 transition-colors">
            <div className="bg-gray-100 dark:bg-white/10 p-3 rounded-2xl text-[#1b1b1b] dark:text-white shrink-0 transition-colors">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 transition-colors">Hours</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">{store.hours || "Store hours vary. Contact for details."}</p>
            </div>
          </div>
          </div>
        </div>

        {Array.isArray(store.images) && store.images.length > 0 && (
          <section className="mb-10" aria-labelledby="gallery-heading">
            <div className="mb-4 flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h2 id="gallery-heading" className="text-xl font-bold text-gray-900 dark:text-white">Store Gallery</h2>
            </div>
            <div className={`grid gap-3 ${store.images.length > 1 ? "sm:grid-cols-2" : ""}`}>
              {store.images.filter(Boolean).map((image, index) => (
                <img
                  key={`${image}-${index}`}
                  src={getDisplayImageUrl(image)}
                  alt={`${store.name} store photo ${index + 1}`}
                  className={`h-64 w-full rounded-3xl border border-gray-200 object-cover dark:border-gray-800 ${store.images!.length === 3 && index === 0 ? "sm:col-span-2 sm:h-80" : ""}`}
                  loading="lazy"
                />
              ))}
            </div>
          </section>
        )}

        {store.menuUrl && (
          <section className="mb-10" aria-labelledby="menu-heading">
            <div className="mb-4 flex items-center gap-3">
              <Utensils className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h2 id="menu-heading" className="text-xl font-bold text-gray-900 dark:text-white">Menu</h2>
            </div>
            <a href={getDisplayImageUrl(store.menuUrl)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-3xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
              <img src={getDisplayImageUrl(store.menuUrl)} alt={`${store.name} menu`} className="max-h-[48rem] w-full object-contain" loading="lazy" />
            </a>
          </section>
        )}

        {products.length > 0 && (
          <section className="mb-10" aria-labelledby="products-heading">
            <div className="mb-4 flex items-center gap-3">
              <Utensils className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h2 id="products-heading" className="text-xl font-bold text-gray-900 dark:text-white">Food & Products</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => {
                const numericPrice = Number(product.price);
                return (
                  <article key={product.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    {product.imageUrl && (
                      <div className="relative h-48 bg-gray-100 dark:bg-gray-800">
                        <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} className="h-full w-full object-cover" loading="lazy" />
                        {product.available === false && (
                          <span className="absolute right-3 top-3 rounded-full bg-gray-900/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Unavailable</span>
                        )}
                      </div>
                    )}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-bold text-gray-900 dark:text-white">{product.name}</h3>
                        {Number.isFinite(numericPrice) && (
                          <span className="shrink-0 font-bold text-gray-900 dark:text-white">₱{numericPrice.toFixed(2)}</span>
                        )}
                      </div>
                      {product.ingredients && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{product.ingredients}</p>}
                      {product.available === false && !product.imageUrl && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">Unavailable</p>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Contact Links */}
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 transition-colors">
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg transition-colors">Contact Information</h3>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800 transition-colors">
            {store.contact && (
              <a href={`tel:${store.contact}`} className="flex items-center gap-4 p-6 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <Phone className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300 font-medium transition-colors">{store.contact}</span>
              </a>
            )}
            {store.website && (
              <a href={store.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 p-6 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                <Globe className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-gray-700 dark:text-gray-300 font-medium truncate transition-colors">{store.website.replace(/^https?:\/\//, '')}</span>
              </a>
            )}
            {!store.contact && !store.website && (
              <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm transition-colors">No contact information provided.</div>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 transition-colors flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg transition-colors">Leave Feedback</h3>
          </div>

          {user?.role === "customer" ? (
            <form onSubmit={handleFeedbackSubmit} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Rating</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRating(value)}
                      className="rounded-xl p-1.5 text-[#1b1b1b] transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-white/10"
                      aria-label={`${value} star rating`}
                    >
                      <Star className={`h-7 w-7 ${value <= rating ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Comments</label>
                <textarea
                  required
                  rows={4}
                  maxLength={500}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="Share your experience with this store..."
                />
                <p className="text-xs text-gray-400">{comment.length}/500</p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={submittingFeedback || !comment.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  <Send className="h-4 w-4" />
                  {submittingFeedback ? "Submitting..." : "Submit Feedback"}
                </button>
                {feedbackSent && (
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">Feedback submitted.</p>
                )}
              </div>
            </form>
          ) : !user ? (
            <div className="flex flex-col items-start gap-4 p-6 text-sm text-gray-500 dark:text-gray-400">
              <p>Sign in as a customer to leave feedback for this store.</p>
              <Link
                to="/"
                state={{ authRequired: true, returnTo: window.location.pathname }}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 font-bold text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Sign in to leave feedback
              </Link>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              Feedback can only be submitted from a customer account.
            </div>
          )}
        </div>
        </div>
      </main>
      <PublicSiteFooter />
    </div>
  );
}
