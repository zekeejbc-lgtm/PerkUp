import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  Gift,
  Grid2X2,
  Image as ImageIcon,
  List,
  Search,
  SlidersHorizontal,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { collection, doc, getDoc, getDocs, query, where } from "@/src/lib/dataCompat";
import { db } from "../lib/backend";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { formatPhilippineDate, getPhilippineDateTimeMillis } from "../lib/dateTime";
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { PublicSiteFooter } from "../components/PublicPageShell";
import { useAuth } from "../contexts/AuthContext";
import { CustomDropdown } from "../components/CustomDropdown";
import { ViewModeButton } from "../components/ViewModeButton";

const promotionViewOptions = [
  { value: "tiles", label: "Card", icon: Grid2X2 },
  { value: "table", label: "Table", icon: List },
] as const;

interface PromotionStore {
  id: string;
  name: string;
  logoUrl?: string;
}

interface CatalogPromotion {
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

type OfferFilter = "all" | "product" | "other";
type SortOption = "ending-soon" | "title-asc" | "stamps-asc" | "stamps-desc";
type ViewMode = "tiles" | "table";

const promotionTitle = (promotion: CatalogPromotion) => promotion.title || "Special promotion";
const promotionDate = (value?: string) => value ? formatPhilippineDate(value, "") : "";
const requiredStampCount = (promotion: CatalogPromotion) => Math.max(Number(promotion.requiredStamps || 10), 1);
const isPromotionRunning = (promotion: CatalogPromotion) => {
  if (promotion.active === false) return false;
  const now = Date.now();
  const startsAt = promotion.startDate ? getPhilippineDateTimeMillis(promotion.startDate) : Number.NaN;
  const endsAt = promotion.endDate ? getPhilippineDateTimeMillis(promotion.endDate) : Number.NaN;
  return (!Number.isFinite(startsAt) || startsAt <= now) && (!Number.isFinite(endsAt) || endsAt > now);
};

export default function StorePromotionsPage() {
  const { storeId } = useParams();
  const { user } = useAuth();
  const [store, setStore] = useState<PromotionStore | null>(null);
  const [promotions, setPromotions] = useState<CatalogPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeMissing, setStoreMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [offerType, setOfferType] = useState<OfferFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("ending-soon");
  const [minStamps, setMinStamps] = useState("");
  const [maxStamps, setMaxStamps] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tiles");

  useEffect(() => {
    let active = true;

    const fetchPromotions = async () => {
      if (!storeId) {
        setStoreMissing(true);
        setLoading(false);
        return;
      }

      try {
        const [storeSnapshot, promotionsSnapshot] = await Promise.all([
          getDoc(doc(db, "stores", storeId)),
          getDocs(query(collection(db, "promotions"), where("storeId", "==", storeId))),
        ]);

        if (!active) return;
        if (!storeSnapshot.exists()) {
          setStoreMissing(true);
          return;
        }

        setStore({ id: storeSnapshot.id, ...storeSnapshot.data() } as PromotionStore);
        setPromotions(
          promotionsSnapshot.docs
            .map((promotionDoc) => ({ id: promotionDoc.id, ...promotionDoc.data() } as CatalogPromotion))
            .filter(isPromotionRunning),
        );
      } catch (error) {
        console.error("Failed to load store promotions:", error);
        if (active) setStoreMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchPromotions();
    return () => {
      active = false;
    };
  }, [storeId]);

  const filteredPromotions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const numericMin = minStamps === "" ? null : Number(minStamps);
    const numericMax = maxStamps === "" ? null : Number(maxStamps);

    return promotions
      .filter((promotion) => {
        const stampCount = requiredStampCount(promotion);
        const hasLinkedProduct = Boolean(promotion.linkedProductId || promotion.linkedProductName);
        const matchesSearch = !normalizedSearch
          || promotionTitle(promotion).toLocaleLowerCase().includes(normalizedSearch)
          || String(promotion.description || "").toLocaleLowerCase().includes(normalizedSearch)
          || String(promotion.linkedProductName || "").toLocaleLowerCase().includes(normalizedSearch);
        const matchesOfferType = offerType === "all" || (offerType === "product" ? hasLinkedProduct : !hasLinkedProduct);
        const matchesMin = numericMin === null || stampCount >= numericMin;
        const matchesMax = numericMax === null || stampCount <= numericMax;
        return matchesSearch && matchesOfferType && matchesMin && matchesMax;
      })
      .sort((a, b) => {
        if (sortBy === "title-asc") return promotionTitle(a).localeCompare(promotionTitle(b));
        if (sortBy === "stamps-asc") return requiredStampCount(a) - requiredStampCount(b);
        if (sortBy === "stamps-desc") return requiredStampCount(b) - requiredStampCount(a);
        const aEnd = a.endDate ? getPhilippineDateTimeMillis(a.endDate) : Number.POSITIVE_INFINITY;
        const bEnd = b.endDate ? getPhilippineDateTimeMillis(b.endDate) : Number.POSITIVE_INFINITY;
        return aEnd - bEnd;
      });
  }, [maxStamps, minStamps, offerType, promotions, search, sortBy]);

  const hasActiveFilters = Boolean(search || minStamps || maxStamps || offerType !== "all");
  const clearFilters = () => {
    setSearch("");
    setOfferType("all");
    setMinStamps("");
    setMaxStamps("");
  };

  if (loading) return <PageSkeleton variant="promotions" />;

  if (storeMissing || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-[#1b1b1b]">
        <StoreIcon className="mb-4 h-10 w-10 text-gray-300 dark:text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Store not found</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">This store does not exist or is no longer available.</p>
        <Link to="/stores" className="mt-6 font-semibold text-gray-900 hover:underline dark:text-white">Back to stores</Link>
      </div>
    );
  }

  if (promotions.length === 0) {
    return <Navigate to={`/store/${store.id}`} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white transition-colors dark:bg-[#1b1b1b]">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-white/10 dark:bg-[#1b1b1b]/90">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link to="/" aria-label="PerkUp home"><BrandMark compact /></Link>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              to={user ? "/dashboard" : "/"}
              state={user ? undefined : { authRequired: true, returnTo: window.location.pathname }}
              className="text-sm font-medium text-gray-900 hover:opacity-70 dark:text-white"
            >
              {user ? "Dashboard" : "Sign in"}
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Link
          to={`/store/${store.id}`}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {store.name}
        </Link>

        <section className="mt-6 rounded-[2rem] border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900 sm:p-8">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              {store.logoUrl ? (
                <img src={getDisplayImageUrl(store.logoUrl)} alt="" className="h-full w-full object-cover" />
              ) : (
                <Gift className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Current promotions</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">{store.name}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse {promotions.length} active {promotions.length === 1 ? "offer" : "offers"} from this store.</p>
            </div>
          </div>
        </section>

        <section className="mt-6" aria-label="Promotion controls">
          <div className="grid gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]">
            <label className="relative block">
              <span className="sr-only">Search promotions</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search offers or rewards"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </label>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-gray-400 lg:block" aria-hidden="true" />
              <CustomDropdown
                value={offerType}
                onChange={(value) => setOfferType(value as OfferFilter)}
                ariaLabel="Offer type"
                className="min-w-44"
                options={[
                  { value: "all", label: "All offers" },
                  { value: "product", label: "Product rewards" },
                  { value: "other", label: "Other rewards" },
                ]}
              />
            </div>

            <div className="flex h-11 items-center gap-2" aria-label="Required stamp range">
              <input aria-label="Minimum required stamps" type="number" min="1" step="1" value={minStamps} onChange={(event) => setMinStamps(event.target.value)} placeholder="Min stamps" className="h-full w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              <span className="text-gray-400">–</span>
              <input aria-label="Maximum required stamps" type="number" min="1" step="1" value={maxStamps} onChange={(event) => setMaxStamps(event.target.value)} placeholder="Max stamps" className="h-full w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>

            <CustomDropdown
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              ariaLabel="Sort promotions"
              className="min-w-48"
              options={[
                { value: "ending-soon", label: "Ending soon" },
                { value: "title-asc", label: "Name A–Z" },
                { value: "stamps-asc", label: "Stamps: low to high" },
                { value: "stamps-desc", label: "Stamps: high to low" },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400" role="status">
              {filteredPromotions.length} {filteredPromotions.length === 1 ? "promotion" : "promotions"} shown
            </p>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white">
                  <X className="h-4 w-4" /> Clear filters
                </button>
              )}
              <ViewModeButton value={viewMode} options={promotionViewOptions} onChange={setViewMode} ariaLabel="Change promotion view" />
            </div>
          </div>
        </section>

        {filteredPromotions.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
            <Search className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <h2 className="mt-3 font-bold text-gray-900 dark:text-white">No matching promotions</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try changing your search or filters.</p>
          </div>
        ) : viewMode === "tiles" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPromotions.map((promotion) => (
              <article key={promotion.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="relative flex h-52 items-center justify-center bg-gray-100 dark:bg-gray-800">
                  {promotion.bannerImageUrl ? <img src={getDisplayImageUrl(promotion.bannerImageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />}
                  <span className="absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Running now</span>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-bold text-gray-900 dark:text-white">{promotionTitle(promotion)}</h2>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">{requiredStampCount(promotion)} stamps</span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{promotion.description || "No additional promotion details."}</p>
                  {promotion.linkedProductName && <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Reward: {promotion.linkedProductName}</p>}
                  <p className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                    <CalendarDays className="h-4 w-4" />
                    {promotion.startDate ? promotionDate(promotion.startDate) : "Available now"} – {promotion.endDate ? promotionDate(promotion.endDate) : "No end date"}
                  </p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full min-w-[48rem] text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
                <tr><th className="px-5 py-4 font-bold">Promotion</th><th className="px-5 py-4 font-bold">Reward</th><th className="px-5 py-4 font-bold">Schedule</th><th className="px-5 py-4 text-right font-bold">Required stamps</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredPromotions.map((promotion) => (
                  <tr key={promotion.id}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">{promotion.bannerImageUrl ? <img src={getDisplayImageUrl(promotion.bannerImageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Gift className="h-5 w-5 text-gray-300" />}</div><div><p className="font-bold text-gray-900 dark:text-white">{promotionTitle(promotion)}</p><p className="mt-0.5 max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">{promotion.description || "No additional details"}</p></div></div></td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{promotion.linkedProductName || "Other reward"}</td>
                    <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{promotion.startDate ? promotionDate(promotion.startDate) : "Available now"} – {promotion.endDate ? promotionDate(promotion.endDate) : "No end date"}</td>
                    <td className="px-5 py-4 text-right font-black text-gray-900 dark:text-white">{requiredStampCount(promotion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
      <PublicSiteFooter />
    </div>
  );
}
