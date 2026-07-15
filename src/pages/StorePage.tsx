import { useParams, Link, useLocation } from "react-router-dom";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { ArrowLeft, ArrowRight, MapPin, Phone, Globe, Clock, Star, Share2, MessageSquare, Send, Image as ImageIcon, Store as StoreIcon, Utensils, Gift, CalendarDays, X } from "lucide-react";
import { MapContainer, Marker, Popup } from "react-leaflet";
import * as ReactDOMServer from "react-dom/server";
import L from "leaflet";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { useAuth } from "../contexts/AuthContext";
import { useCurrency } from "../contexts/CurrencyContext";
import { DirectionsButton } from "../components/DirectionsButton";
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { MapBaseLayers } from "../components/MapBaseLayers";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../lib/imageStorage";
import { PublicSiteFooter } from "../components/PublicPageShell";
import { formatPhilippineDate, getPhilippineDateTimeMillis } from "../lib/dateTime";

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
  businessName?: string;
  branchName?: string;
  ownerId?: string;
  parentStoreId?: string;
  isPrimaryBranch?: boolean;
  status?: string;
}

interface StoreProduct {
  id: string;
  name: string;
  price?: number | string;
  imageUrl?: string;
  ingredients?: string;
  available?: boolean;
}

interface StorePromotion {
  id: string;
  title?: string;
  description?: string;
  bannerImageUrl?: string;
  requiredStamps?: number | string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  linkedProductId?: string;
  linkedProductName?: string;
}

interface StoreReview {
  id: string;
  customerName?: string;
  customerAvatarUrl?: string;
  customerInitials?: string;
  anonymous?: boolean;
  rating?: number;
  comment?: string;
  imageUrls?: string[];
  ownerReply?: string;
  createdAt?: string;
  ownerRepliedAt?: string;
  ownerReplyUpdatedAt?: string;
}

const toDate = (value?: any) => {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const reviewDate = (value?: any) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString() : "";
};

const getInitials = (name?: string) => {
  const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "C";
};

const promotionDate = (value?: string) => {
  return value ? formatPhilippineDate(value, "") : "";
};

const isPromotionRunning = (promotion: StorePromotion) => {
  if (promotion.active === false) return false;
  const now = Date.now();
  const startsAt = promotion.startDate ? getPhilippineDateTimeMillis(promotion.startDate) : Number.NaN;
  const endsAt = promotion.endDate ? getPhilippineDateTimeMillis(promotion.endDate) : Number.NaN;
  return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt > now);
};

const getCoordinates = (store: StoreContent): [number, number] | null => {
  const lat = Number(store.lat ?? store.latitude);
  const lng = Number(store.lng ?? store.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
};

function StoreGalleryCarousel({ images, storeName }: { images: string[]; storeName: string }) {
  const galleryImages = useMemo(() => images.filter(Boolean).slice(0, 10), [images]);
  const [slidePosition, setSlidePosition] = useState(0);
  const [transitionEnabled, setTransitionEnabled] = useState(true);
  const activeIndex = galleryImages.length > 0 ? slidePosition % galleryImages.length : 0;
  const carouselImages = galleryImages.length > 1 ? [...galleryImages, galleryImages[0]] : galleryImages;
  const visibleDotIndexes = useMemo(() => {
    if (galleryImages.length <= 5) return galleryImages.map((_, index) => index);
    const firstVisibleIndex = Math.min(Math.max(activeIndex - 2, 0), galleryImages.length - 5);
    return Array.from({ length: 5 }, (_, offset) => firstVisibleIndex + offset);
  }, [activeIndex, galleryImages]);

  useEffect(() => {
    setTransitionEnabled(false);
    setSlidePosition(0);
    const animationFrame = window.requestAnimationFrame(() => setTransitionEnabled(true));
    return () => window.cancelAnimationFrame(animationFrame);
  }, [galleryImages]);

  useEffect(() => {
    if (galleryImages.length <= 1) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const slideshowTimer = window.setTimeout(() => {
      setTransitionEnabled(true);
      setSlidePosition((current) => current + 1);
    }, 5000);

    return () => window.clearTimeout(slideshowTimer);
  }, [slidePosition, galleryImages]);

  if (galleryImages.length === 0) return null;

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:aspect-[16/7]">
      <div
        className={`flex h-full motion-reduce:transition-none ${transitionEnabled ? "transition-transform duration-700 ease-in-out" : ""}`}
        style={{ transform: `translateX(-${slidePosition * 100}%)` }}
        onTransitionEnd={() => {
          if (slidePosition !== galleryImages.length) return;
          setTransitionEnabled(false);
          setSlidePosition(0);
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => setTransitionEnabled(true));
          });
        }}
      >
        {carouselImages.map((image, index) => {
          const logicalIndex = index % galleryImages.length;
          const isVisibleSlide = index === slidePosition;
          return (
            <img
              key={`${image}-${index}`}
              src={getDisplayImageUrl(image)}
              alt={`${storeName} store photo ${logicalIndex + 1} of ${galleryImages.length}`}
              aria-hidden={!isVisibleSlide}
              data-image-viewer-ignore={isVisibleSlide ? undefined : "true"}
              tabIndex={isVisibleSlide ? 0 : -1}
              role={isVisibleSlide ? "button" : undefined}
              aria-label={isVisibleSlide ? `View ${storeName} store photo ${logicalIndex + 1}` : undefined}
              className="h-full w-full shrink-0 cursor-zoom-in object-cover"
              loading={index === 0 ? "lazy" : "eager"}
            />
          );
        })}
      </div>

      {galleryImages.length > 1 && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-white/20 bg-black/55 px-3 py-2 shadow-lg backdrop-blur-md sm:bottom-4 sm:right-4" aria-label={`Gallery image ${activeIndex + 1} of ${galleryImages.length}`}>
          <button
            type="button"
            onClick={() => {
              if (activeIndex > 0) {
                setTransitionEnabled(true);
                setSlidePosition(activeIndex - 1);
                return;
              }

              setTransitionEnabled(false);
              setSlidePosition(galleryImages.length);
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  setTransitionEnabled(true);
                  setSlidePosition(galleryImages.length - 1);
                });
              });
            }}
            aria-label="Show previous gallery image"
            className="mr-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {visibleDotIndexes.map((index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                setTransitionEnabled(true);
                setSlidePosition(index);
              }}
              aria-label={`Show gallery image ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${index === activeIndex ? "w-5 bg-white" : "w-2 bg-white/55 hover:bg-white/80"}`}
            />
          ))}
          <button
            type="button"
            onClick={() => {
              if (slidePosition >= galleryImages.length) return;
              setTransitionEnabled(true);
              setSlidePosition((current) => current + 1);
            }}
            aria-label="Show next gallery image"
            className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

const createBranchPin = (branch: StoreContent, selected: boolean) => {
  const markerContent = branch.logoUrl
    ? ReactDOMServer.renderToString(
        <img
          src={getDisplayImageUrl(branch.logoUrl)}
          alt=""
          style={{ width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover" }}
        />,
      )
    : ReactDOMServer.renderToString(
        <StoreIcon size={20} strokeWidth={2.5} color={selected ? "#ffffff" : "#1b1b1b"} />,
      );
  const background = selected ? "#1b1b1b" : "#ffffff";
  const border = selected ? "#ffffff" : "#1b1b1b";

  return L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:44px;height:50px;">
        <div style="box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:3px;overflow:hidden;border:3px solid ${border};border-radius:50%;background:${background};box-shadow:0 6px 16px rgba(0,0,0,.28);">
          ${markerContent}
        </div>
        <div style="position:absolute;bottom:0;left:50%;width:0;height:0;transform:translateX(-50%);border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${border};"></div>
      </div>
    `,
    iconSize: [44, 50],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
  });
};

export default function StorePage() {
  const { storeId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const { formatCurrency } = useCurrency();
  const [store, setStore] = useState<StoreContent | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [promotions, setPromotions] = useState<StorePromotion[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [selectedPromotion, setSelectedPromotion] = useState<StorePromotion | null>(null);
  const [branches, setBranches] = useState<StoreContent[]>([]);
  const [reviews, setReviews] = useState<StoreReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [anonymousReview, setAnonymousReview] = useState(false);
  const [reviewImageFiles, setReviewImageFiles] = useState<File[]>([]);
  const [reviewImagePreviews, setReviewImagePreviews] = useState<string[]>([]);
  const reviewImagePreviewsRef = useRef<string[]>([]);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [shareStatus, setShareStatus] = useState("");

  useEffect(() => () => {
    reviewImagePreviewsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  }, []);

  const fetchReviews = useCallback(async () => {
    if (!storeId) return;
    const snap = await getDocs(query(collection(db, "store_reviews"), where("storeId", "==", storeId)));
    setReviews(
      snap.docs
        .map((reviewDoc) => ({ id: reviewDoc.id, ...reviewDoc.data() } as StoreReview))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    );
  }, [storeId]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    return reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
  }, [reviews]);

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

  const handleReviewImageChange = (files: FileList | null) => {
    const selectedFiles = Array.from(files || []).filter((file) => file.type.startsWith("image/")).slice(0, 3);
    reviewImagePreviewsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    const nextPreviews = selectedFiles.map((file) => URL.createObjectURL(file));
    reviewImagePreviewsRef.current = nextPreviews;
    setReviewImageFiles(selectedFiles);
    setReviewImagePreviews(nextPreviews);
  };

  const removeReviewImage = (index: number) => {
    setReviewImageFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setReviewImagePreviews((current) => {
      current[index] && URL.revokeObjectURL(current[index]);
      const nextPreviews = current.filter((_, itemIndex) => itemIndex !== index);
      reviewImagePreviewsRef.current = nextPreviews;
      return nextPreviews;
    });
  };

  useEffect(() => {
    async function fetchStore() {
      if (!storeId) return;
      try {
        const docSnap = await getDoc(doc(db, "stores", storeId));

        if (!docSnap.exists()) {
          setStore(null);
          setProducts([]);
          return;
        }

        const storeData = { id: docSnap.id, ...docSnap.data() } as StoreContent;
        setStore(storeData);

        const [productsResult, promotionsResult, reviewsResult, branchesResult] = await Promise.allSettled([
          getDocs(query(collection(db, "products"), where("storeId", "==", storeId))),
          getDocs(query(collection(db, "promotions"), where("storeId", "==", storeId))),
          fetchReviews(),
          storeData.ownerId
            ? getDocs(query(collection(db, "stores"), where("ownerId", "==", storeData.ownerId)))
            : Promise.resolve(null),
        ]);

        if (productsResult.status === "fulfilled") {
          setProducts(productsResult.value.docs.map((productDoc) => ({
            id: productDoc.id,
            ...productDoc.data(),
          })) as StoreProduct[]);
        } else {
          console.error("Error fetching store products:", productsResult.reason);
          setProducts([]);
        }

        if (promotionsResult.status === "fulfilled") {
          setPromotions(
            promotionsResult.value.docs
              .map((promotionDoc) => ({ id: promotionDoc.id, ...promotionDoc.data() } as StorePromotion))
              .filter(isPromotionRunning)
              .sort((a, b) => {
                const aEnd = a.endDate ? getPhilippineDateTimeMillis(a.endDate) : Number.POSITIVE_INFINITY;
                const bEnd = b.endDate ? getPhilippineDateTimeMillis(b.endDate) : Number.POSITIVE_INFINITY;
                return aEnd - bEnd;
              }),
          );
        } else {
          console.error("Error fetching store promotions:", promotionsResult.reason);
          setPromotions([]);
        }

        if (reviewsResult.status === "rejected") {
          console.error("Error fetching store reviews:", reviewsResult.reason);
          setReviews([]);
        }

        if (branchesResult.status === "fulfilled" && branchesResult.value) {
          const siblingBranches = branchesResult.value.docs
            .map((branchDoc) => ({ id: branchDoc.id, ...branchDoc.data() } as StoreContent))
            .filter((branch) => !branch.status || branch.status === "active")
            .sort((a, b) => {
              if (a.isPrimaryBranch !== b.isPrimaryBranch) return a.isPrimaryBranch ? -1 : 1;
              return (a.branchName || a.name).localeCompare(b.branchName || b.name);
            });
          setBranches(siblingBranches.length ? siblingBranches : [storeData]);
        } else {
          if (branchesResult.status === "rejected") {
            console.error("Error fetching store branches:", branchesResult.reason);
          }
          setBranches([storeData]);
        }
      } catch (error) {
        console.error("Error fetching store:", error);
        setStore(null);
        setProducts([]);
        setPromotions([]);
        setBranches([]);
      } finally {
        setLoading(false);
      }
    }
    fetchStore();
  }, [fetchReviews, storeId]);

  useEffect(() => {
    if (!selectedProduct) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProduct(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedProduct]);

  const handleFeedbackSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!storeId || !store || !user || user.role !== "customer") return;

    setSubmittingFeedback(true);
    setFeedbackSent(false);
    let uploadedImageUrls: string[] = [];
    let reviewPersisted = false;
    try {
      await Promise.all(reviewImageFiles.map(async (file, index) => {
        const uploadedUrl = await uploadImageFileToDriveSecure(file, {
          owner: user.username || user.email || user.id,
          purpose: `store-review-${storeId}-${index + 1}`,
        });
        uploadedImageUrls.push(uploadedUrl);
      }));
      const imageUrls = uploadedImageUrls;
      const customerInitials = getInitials(user.name);
      await addDoc(collection(db, "store_reviews"), {
        storeId,
        storeName: store.name,
        customerId: user.id,
        customerName: anonymousReview ? "Anonymous Customer" : user.name || "Customer",
        customerAvatarUrl: anonymousReview ? "" : user.avatarUrl || user.photoURL || "",
        customerInitials,
        anonymous: anonymousReview,
        rating,
        comment: comment.trim(),
        imageUrls,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      reviewPersisted = true;
      setComment("");
      setRating(5);
      setAnonymousReview(false);
      reviewImagePreviewsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
      reviewImagePreviewsRef.current = [];
      setReviewImageFiles([]);
      setReviewImagePreviews([]);
      setFeedbackSent(true);
      await fetchReviews();
    } catch (error) {
      if (!reviewPersisted && uploadedImageUrls.length) {
        await Promise.allSettled(uploadedImageUrls.map((url) => deleteImageFromDriveSecure(url)));
      }
      console.error("Failed to submit feedback:", error);
      const message = error instanceof Error && /duplicate|unique/i.test(error.message)
        ? "You have already reviewed this store."
        : "Failed to submit review. Please try again.";
      alert(message);
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

  const mappedBranches = branches
    .map((branch) => ({ branch, coordinates: getCoordinates(branch) }))
    .filter((entry): entry is { branch: StoreContent; coordinates: [number, number] } => Boolean(entry.coordinates));
  const selectedCoordinates = getCoordinates(store);
  const mapCenter = selectedCoordinates ?? mappedBranches[0]?.coordinates ?? null;
  const selectedProductPromotions = selectedProduct
    ? promotions.filter((promotion) => {
        const linkedProductId = String(promotion.linkedProductId || "");
        return linkedProductId === selectedProduct.id;
      })
    : [];
  const selectedPromotionProduct = selectedPromotion?.linkedProductId
    ? products.find((product) => product.id === selectedPromotion.linkedProductId)
    : null;
  const navigationState = location.state as { storesPath?: string } | null;
  const backToStoresPath = navigationState?.storesPath || (user?.role === "customer" ? "/customer/stores" : "/stores");

  return (
    <div className="flex min-h-screen flex-col bg-white selection:bg-[#1b1b1b] selection:text-white transition-colors dark:bg-[#1b1b1b] dark:selection:bg-white dark:selection:text-[#1b1b1b]">
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

      <div className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link
            to={backToStoresPath}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to stores</span>
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

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 lg:px-8">
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
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Shop name</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 transition-colors dark:text-white sm:text-5xl">{store.name}</h1>
            </div>
            <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Description</p>
              <p className="mt-2 max-w-2xl text-base leading-7 text-gray-500 transition-colors dark:text-gray-400 sm:text-lg">
                {store.description || "A participating partner in our digital rewards program."}
              </p>
            </div>
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

        <section className="mb-10" aria-labelledby="branches-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <StoreIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <h2 id="branches-heading" className="text-2xl font-bold text-gray-900 dark:text-white">
                  Branches
                </h2>
              </div>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {branches.length} active {branches.length === 1 ? "location" : "locations"}
              </p>
            </div>
          </div>

          {mapCenter ? (
            <div className="relative z-0 mb-5 h-80 overflow-hidden rounded-[2rem] border border-gray-200 shadow-sm dark:border-gray-800 sm:h-96">
              <MapContainer
                key={`${store.id}-${mappedBranches.length}`}
                center={mapCenter}
                zoom={mappedBranches.length > 1 ? 12 : 15}
                scrollWheelZoom
                touchZoom
                className="h-full w-full"
              >
                <MapBaseLayers />
                {mappedBranches.map(({ branch, coordinates }) => (
                  <Marker
                    key={branch.id}
                    position={coordinates}
                    icon={createBranchPin(branch, branch.id === store.id)}
                  >
                    <Popup>
                      <div className="min-w-48">
                        <p className="font-bold text-gray-900">{branch.branchName || branch.name}</p>
                        <p className="mt-1 text-sm text-gray-600">{branch.address || "Address unavailable"}</p>
                        <div className="mt-3 flex gap-2">
                          {branch.id !== store.id && (
                            <Link to={`/store/${branch.id}`} className="text-sm font-semibold text-gray-900 underline">
                              View branch
                            </Link>
                          )}
                          <DirectionsButton
                            destination={{ lat: coordinates[0], lng: coordinates[1], address: branch.address, name: branch.name }}
                            className="text-sm font-semibold text-gray-900 underline"
                          />
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          ) : (
            <div className="mb-5 rounded-3xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Map unavailable because no branch coordinates have been added.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {branches.map((branch) => (
              <article
                key={branch.id}
                className={`rounded-3xl border p-5 shadow-sm ${
                  branch.id === store.id
                    ? "border-gray-900 bg-gray-50 dark:border-white dark:bg-white/10"
                    : "border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{branch.branchName || branch.name}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{branch.address || "Address unavailable"}</p>
                  </div>
                  {branch.id === store.id && (
                    <span className="shrink-0 rounded-full bg-gray-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-white dark:text-gray-900">
                      Viewing
                    </span>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {branch.id !== store.id && (
                    <Link to={`/store/${branch.id}`} className="text-sm font-semibold text-gray-900 hover:underline dark:text-white">
                      View branch
                    </Link>
                  )}
                  <DirectionsButton
                    destination={{
                      lat: branch.lat ?? branch.latitude,
                      lng: branch.lng ?? branch.longitude,
                      address: branch.address,
                      name: branch.name,
                    }}
                    className="text-sm font-semibold text-gray-900 hover:underline dark:text-white"
                  />
                </div>
              </article>
            ))}
          </div>
        </section>

        {Array.isArray(store.images) && store.images.length > 0 && (
          <section className="mb-10" aria-labelledby="gallery-heading">
            <div className="mb-4 flex items-center gap-3">
              <ImageIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
              <h2 id="gallery-heading" className="text-xl font-bold text-gray-900 dark:text-white">Store Gallery</h2>
            </div>
            <StoreGalleryCarousel key={store.id} images={store.images} storeName={store.name} />
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

        {promotions.length > 0 && (
          <section className="mb-10" aria-labelledby="promotions-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Gift className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <div>
                  <h2 id="promotions-heading" className="text-xl font-bold text-gray-900 dark:text-white">Current Promotions</h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">A preview of offers available at this shop right now.</p>
                </div>
              </div>
              <Link
                to={`/store/${store.id}/promotions`}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {promotions.length > 1 ? `Show ${promotions.length - 1} more` : "View promotions"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {promotions.slice(0, 1).map((promotion) => (
                <button
                  key={promotion.id}
                  type="button"
                  onClick={() => setSelectedPromotion(promotion)}
                  className="overflow-hidden rounded-3xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-white"
                  aria-label={`View details for ${promotion.title || "special promotion"}`}
                >
                  {promotion.bannerImageUrl && (
                    <img
                      src={getDisplayImageUrl(promotion.bannerImageUrl)}
                      alt=""
                      className="h-40 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="p-5">
                    <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">Running now</span>
                    <h3 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">{promotion.title || "Special promotion"}</h3>
                    {promotion.description && <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{promotion.description}</p>}
                    {(promotion.startDate || promotion.endDate) && (
                      <p className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                        <CalendarDays className="h-4 w-4" />
                        {promotion.startDate ? promotionDate(promotion.startDate) : "Available now"}
                        {" – "}
                        {promotion.endDate ? promotionDate(promotion.endDate) : "No end date"}
                      </p>
                    )}
                  </div>
                  <span className="sr-only">Open promotion details</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {products.length > 0 && (
          <section className="mb-10" aria-labelledby="products-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Utensils className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                <div>
                  <h2 id="products-heading" className="text-xl font-bold text-gray-900 dark:text-white">Food & Products</h2>
                  <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">A preview from this store's catalog.</p>
                </div>
              </div>
              <Link
                to={`/store/${store.id}/products`}
                className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                {products.length > 1 ? `Show ${products.length - 1} more` : "View catalog"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 1).map((product) => {
                const numericPrice = Number(product.price);
                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => setSelectedProduct(product)}
                    className="overflow-hidden rounded-3xl border border-gray-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:focus-visible:ring-white"
                    aria-label={`View details for ${product.name}`}
                  >
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
                          <span className="shrink-0 font-bold text-gray-900 dark:text-white">{formatCurrency(numericPrice)}</span>
                        )}
                      </div>
                      {product.ingredients && <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{product.ingredients}</p>}
                      {product.available === false && !product.imageUrl && <p className="mt-2 text-xs font-bold uppercase tracking-wide text-gray-400">Unavailable</p>}
                    </div>
                    <span className="sr-only">Open product details</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {selectedPromotion && (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-gray-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedPromotion(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="promotion-dialog-title"
              className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:max-w-2xl sm:rounded-[2rem]"
            >
              <button
                type="button"
                onClick={() => setSelectedPromotion(null)}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-gray-700 shadow-sm backdrop-blur transition hover:bg-white dark:bg-gray-900/90 dark:text-gray-200"
                aria-label="Close promotion details"
                autoFocus
              >
                <X className="h-5 w-5" />
              </button>
              {selectedPromotion.bannerImageUrl && (
                <div className="relative h-64 bg-gray-100 dark:bg-gray-800 sm:h-80">
                  <img
                    src={getDisplayImageUrl(selectedPromotion.bannerImageUrl)}
                    alt={`${selectedPromotion.title || "Promotion"} banner`}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-4 left-5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">Running now</span>
                </div>
              )}
              <div className="p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Promotion</p>
                <h2 id="promotion-dialog-title" className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {selectedPromotion.title || "Special promotion"}
                </h2>
                <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Details</p>
                  <p className="mt-2 leading-7 text-gray-600 dark:text-gray-300">
                    {selectedPromotion.description || "No additional promotion details have been provided."}
                  </p>
                </div>
                <div className="mt-6 grid gap-3 border-t border-gray-200 pt-5 dark:border-gray-800 sm:grid-cols-2">
                  <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Duration</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                      <CalendarDays className="h-4 w-4" />
                      {selectedPromotion.startDate ? promotionDate(selectedPromotion.startDate) : "Available now"}
                      {" - "}
                      {selectedPromotion.endDate ? promotionDate(selectedPromotion.endDate) : "No end date"}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Reward Goal</p>
                    <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Collect {Math.max(Number(selectedPromotion.requiredStamps || 10), 1)} stamps to complete this offer.
                    </p>
                  </div>
                </div>
                {(selectedPromotion.linkedProductName || selectedPromotionProduct) && (
                  <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <Utensils className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      <h3 className="font-bold text-gray-900 dark:text-white">Featured product</h3>
                    </div>
                    {selectedPromotionProduct ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPromotion(null);
                          setSelectedProduct(selectedPromotionProduct);
                        }}
                        className="mt-3 flex w-full items-center gap-4 rounded-2xl bg-gray-50 p-3 text-left transition hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-gray-800/70 dark:hover:bg-gray-800 dark:focus-visible:ring-white"
                        aria-label={`View details for ${selectedPromotionProduct.name}`}
                      >
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
                          {selectedPromotionProduct.imageUrl ? (
                            <img
                              src={getDisplayImageUrl(selectedPromotionProduct.imageUrl)}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Utensils className="h-6 w-6 text-gray-400 dark:text-gray-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white">{selectedPromotionProduct.name}</p>
                          {Number.isFinite(Number(selectedPromotionProduct.price)) && (
                            <p className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">{formatCurrency(Number(selectedPromotionProduct.price))}</p>
                          )}
                          <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">View product</p>
                        </div>
                      </button>
                    ) : (
                      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                        {selectedPromotion.linkedProductName}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {selectedProduct && (
          <div
            className="fixed inset-0 z-[100] flex items-end justify-center bg-gray-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedProduct(null);
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-dialog-title"
              className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:max-w-2xl sm:rounded-[2rem]"
            >
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-gray-700 shadow-sm backdrop-blur transition hover:bg-white dark:bg-gray-900/90 dark:text-gray-200"
                aria-label="Close product details"
                autoFocus
              >
                <X className="h-5 w-5" />
              </button>
              {selectedProduct.imageUrl && (
                <div className="relative h-64 bg-gray-100 dark:bg-gray-800 sm:h-80">
                  <img src={getDisplayImageUrl(selectedProduct.imageUrl)} alt={selectedProduct.name} className="h-full w-full object-cover" />
                  {selectedProduct.available === false && (
                    <span className="absolute bottom-4 left-5 rounded-full bg-gray-950/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">Unavailable</span>
                  )}
                </div>
              )}
              <div className="p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Shop name</p>
                <p className="mt-1 font-semibold text-gray-600 dark:text-gray-300">{store.name}</p>
                <div className="mt-5 flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Product</p>
                    <h2 id="product-dialog-title" className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{selectedProduct.name}</h2>
                  </div>
                  {Number.isFinite(Number(selectedProduct.price)) && (
                    <p className="shrink-0 text-xl font-black text-gray-900 dark:text-white">{formatCurrency(Number(selectedProduct.price))}</p>
                  )}
                </div>
                <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Description</p>
                  <p className="mt-2 leading-7 text-gray-600 dark:text-gray-300">
                    {selectedProduct.ingredients || "No additional product details have been provided."}
                  </p>
                </div>
                {selectedProductPromotions.length > 0 && (
                  <div className="mt-6 border-t border-gray-200 pt-5 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <Gift className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                      <h3 className="font-bold text-gray-900 dark:text-white">Current promotions</h3>
                    </div>
                    <div className="mt-3 space-y-3">
                      {selectedProductPromotions.map((promotion) => (
                        <div key={promotion.id} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
                          <p className="font-bold text-gray-900 dark:text-white">{promotion.title || "Special promotion"}</p>
                          {promotion.description && <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{promotion.description}</p>}
                          {promotion.endDate && <p className="mt-2 text-xs font-medium text-gray-500 dark:text-gray-400">Ends {promotionDate(promotion.endDate)}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <section className="mb-10" aria-labelledby="reviews-heading">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="reviews-heading" className="text-2xl font-bold text-gray-900 dark:text-white">Customer Reviews</h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {reviews.length ? `${averageRating.toFixed(1)} out of 5 · ${reviews.length} review${reviews.length === 1 ? "" : "s"}` : "No reviews yet."}
              </p>
            </div>
            {reviews.length > 0 && (
              <div className="flex text-[#1b1b1b] dark:text-white" aria-label={`${averageRating.toFixed(1)} average rating`}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star key={value} className={`h-5 w-5 ${value <= Math.round(averageRating) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
                ))}
              </div>
            )}
          </div>
          {reviews.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 text-sm font-black text-gray-600 dark:bg-white/10 dark:text-gray-200">
                        {!review.anonymous && review.customerAvatarUrl ? (
                          <img src={getDisplayImageUrl(review.customerAvatarUrl)} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>{review.customerInitials || getInitials(review.customerName)}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{review.customerName || "Customer"}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{reviewDate(review.createdAt) || "Recent review"}</p>
                      </div>
                    </div>
                    <div className="flex text-[#1b1b1b] dark:text-white" aria-label={`${review.rating || 0} star rating`}>
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star key={value} className={`h-4 w-4 ${value <= Number(review.rating || 0) ? "fill-current" : "text-gray-300 dark:text-gray-700"}`} />
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-gray-700 dark:text-gray-300">{review.comment}</p>
                  {Array.isArray(review.imageUrls) && review.imageUrls.length > 0 && (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {review.imageUrls.filter(Boolean).map((imageUrl, index) => (
                        <a
                          key={`${review.id}-${imageUrl}-${index}`}
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
                  {review.ownerReply && (
                    <div className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/70">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Response from {store.name}</p>
                        {review.ownerReplyUpdatedAt && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                            Updated {reviewDate(review.ownerReplyUpdatedAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-300">{review.ownerReply}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

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
            <h3 className="font-semibold text-gray-900 dark:text-white text-lg transition-colors">Leave a Review</h3>
          </div>

          {user?.role === "customer" ? (
            <form onSubmit={handleFeedbackSubmit} className="p-6 space-y-5">
              <label className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/60">
                <input
                  type="checkbox"
                  checked={anonymousReview}
                  onChange={(event) => setAnonymousReview(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900 dark:border-gray-600"
                />
                <span>
                  <span className="block font-semibold text-gray-900 dark:text-gray-100">Stay anonymous</span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                    Your review will show initials instead of your profile photo.
                  </span>
                </span>
              </label>

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

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200" htmlFor="review-images">Review photos</label>
                  <span className="text-xs font-medium text-gray-400">{reviewImageFiles.length}/3</span>
                </div>
                <label
                  htmlFor="review-images"
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm font-semibold text-gray-600 transition hover:border-gray-500 hover:text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:text-white"
                >
                  <ImageIcon className="h-5 w-5" />
                  Add images
                </label>
                <input
                  id="review-images"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => handleReviewImageChange(event.target.files)}
                  className="sr-only"
                />
                {reviewImagePreviews.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {reviewImagePreviews.map((previewUrl, index) => (
                      <div key={previewUrl} className="relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <img src={previewUrl} alt={`Selected review photo ${index + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeReviewImage(index)}
                          className="absolute right-1.5 top-1.5 rounded-full bg-black/70 p-1 text-white transition hover:bg-black"
                          aria-label={`Remove review photo ${index + 1}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={submittingFeedback || !comment.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                >
                  <Send className="h-4 w-4" />
                  {submittingFeedback ? "Submitting..." : "Submit Review"}
                </button>
                {feedbackSent && (
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">Review submitted.</p>
                )}
              </div>
            </form>
          ) : !user ? (
            <div className="flex flex-col items-start gap-4 p-6 text-sm text-gray-500 dark:text-gray-400">
              <p>Sign in as a customer to rate and review this store.</p>
              <Link
                to="/"
                state={{ authRequired: true, returnTo: window.location.pathname }}
                className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-5 py-3 font-bold text-white transition-colors hover:bg-black dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                Sign in to leave a review
              </Link>
            </div>
          ) : (
            <div className="p-6 text-sm text-gray-500 dark:text-gray-400">
              Reviews can only be submitted from a customer account.
            </div>
          )}
        </div>
        </div>
      </main>
      <PublicSiteFooter />
    </div>
  );
}
