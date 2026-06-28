import { useParams, Link } from "react-router-dom";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { collection, doc, getDoc, serverTimestamp, setDoc } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { ArrowLeft, MapPin, Phone, Globe, Clock, Star, Share2, MessageSquare, Send } from "lucide-react";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";

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
}

export default function StorePage() {
  const { storeId } = useParams();
  const { user } = useAuth();
  const [store, setStore] = useState<StoreContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const directionsQuery = store
    ? [
        store.lat ?? store.latitude,
        store.lng ?? store.longitude,
      ].every((value) => Number.isFinite(Number(value)))
      ? `${Number(store.lat ?? store.latitude)},${Number(store.lng ?? store.longitude)}`
      : store.address || store.name
    : "";

  useEffect(() => {
    async function fetchStore() {
      if (!storeId) return;
      try {
        const docRef = doc(db, "stores", storeId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setStore({ id: docSnap.id, ...docSnap.data() } as StoreContent);
        } else {
          setStore(null);
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
      <nav className="bg-white dark:bg-[#1b1b1b] border-b border-gray-100 dark:border-gray-800 sticky top-0 z-10 transition-colors">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div className="font-semibold text-gray-900 dark:text-white">Store Details</div>
          <button className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pt-10">
        {/* Header section */}
        <div className="mb-10 text-center">
          <div className="w-24 h-24 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-full mx-auto mb-6 flex items-center justify-center transition-colors">
            <Star className="w-10 h-10 text-gray-300 dark:text-gray-700" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 dark:text-white mb-4 transition-colors">{store.name}</h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 max-w-xl mx-auto transition-colors">{store.description || "A participating partner in our digital rewards program."}</p>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 sm:grid-cols-2 mb-10">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm flex items-start gap-4 transition-colors">
            <div className="bg-gray-100 dark:bg-white/10 p-3 rounded-2xl text-[#1b1b1b] dark:text-white shrink-0 transition-colors">
              <MapPin className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1 transition-colors">Location</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm transition-colors">{store.address || "Tagum City, Philippines"}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(directionsQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[#1b1b1b] dark:text-white text-sm font-medium mt-2 inline-block hover:underline transition-colors"
              >
                Get Directions
              </a>
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

        <div className="mt-10 bg-white dark:bg-gray-900 rounded-3xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden transition-colors">
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
          ) : (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              Sign in as a customer to leave feedback for this store.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
