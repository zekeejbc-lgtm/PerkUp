import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
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
import { BrandMark } from "../components/BrandMark";
import { ThemeToggle } from "../components/ThemeToggle";
import { PageSkeleton } from "../components/LoadingSkeleton";
import { PublicSiteFooter } from "../components/PublicPageShell";
import { useAuth } from "../contexts/AuthContext";
import { CustomDropdown } from "../components/CustomDropdown";
import { ViewModeButton } from "../components/ViewModeButton";
import { useCurrency } from "../contexts/CurrencyContext";
import { Seo } from "../components/Seo";

const catalogViewOptions = [
  { value: "tiles", label: "Card", icon: Grid2X2 },
  { value: "table", label: "Table", icon: List },
] as const;

interface CatalogStore {
  id: string;
  name: string;
  description?: string;
  logoUrl?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  price?: number | string;
  imageUrl?: string;
  ingredients?: string;
  available?: boolean;
}

type AvailabilityFilter = "all" | "available" | "unavailable";
type SortOption = "name-asc" | "price-asc" | "price-desc";
type ViewMode = "tiles" | "table";

export default function StoreProductsPage() {
  const { storeId } = useParams();
  const { user } = useAuth();
  const { currency, convertToPhp, formatCurrency } = useCurrency();
  const [store, setStore] = useState<CatalogStore | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeMissing, setStoreMissing] = useState(false);
  const [search, setSearch] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("tiles");

  useEffect(() => {
    let active = true;

    const fetchCatalog = async () => {
      if (!storeId) {
        setStoreMissing(true);
        setLoading(false);
        return;
      }

      try {
        const [storeSnapshot, productsSnapshot] = await Promise.all([
          getDoc(doc(db, "stores", storeId)),
          getDocs(query(collection(db, "products"), where("storeId", "==", storeId))),
        ]);

        if (!active) return;
        if (!storeSnapshot.exists()) {
          setStoreMissing(true);
          return;
        }

        setStore({ id: storeSnapshot.id, ...storeSnapshot.data() } as CatalogStore);
        setProducts(productsSnapshot.docs.map((productDoc) => ({
          id: productDoc.id,
          ...productDoc.data(),
        })) as CatalogProduct[]);
      } catch (error) {
        console.error("Failed to load store catalog:", error);
        if (active) setStoreMissing(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchCatalog();
    return () => {
      active = false;
    };
  }, [storeId]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const numericMin = minPrice === "" ? null : convertToPhp(Number(minPrice));
    const numericMax = maxPrice === "" ? null : convertToPhp(Number(maxPrice));

    return products
      .filter((product) => {
        const isAvailable = product.available !== false;
        const numericPrice = Number(product.price);
        const matchesSearch = !normalizedSearch
          || product.name.toLocaleLowerCase().includes(normalizedSearch)
          || String(product.ingredients || "").toLocaleLowerCase().includes(normalizedSearch);
        const matchesAvailability = availability === "all"
          || (availability === "available" ? isAvailable : !isAvailable);
        const matchesMin = numericMin === null || (Number.isFinite(numericPrice) && numericPrice >= numericMin);
        const matchesMax = numericMax === null || (Number.isFinite(numericPrice) && numericPrice <= numericMax);
        return matchesSearch && matchesAvailability && matchesMin && matchesMax;
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return Number(a.price ?? Number.POSITIVE_INFINITY) - Number(b.price ?? Number.POSITIVE_INFINITY);
        if (sortBy === "price-desc") return Number(b.price ?? Number.NEGATIVE_INFINITY) - Number(a.price ?? Number.NEGATIVE_INFINITY);
        return a.name.localeCompare(b.name);
      });
  }, [availability, convertToPhp, maxPrice, minPrice, products, search, sortBy]);

  const hasActiveFilters = Boolean(search || minPrice || maxPrice || availability !== "all");
  const clearFilters = () => {
    setSearch("");
    setAvailability("all");
    setMinPrice("");
    setMaxPrice("");
  };

  if (loading) return <PageSkeleton variant="products" />;

  if (storeMissing || !store) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center dark:bg-[#1b1b1b]">
        <Seo title="Store Not Found | PerkUp" canonicalPath={window.location.pathname} noIndex />
        <StoreIcon className="mb-4 h-10 w-10 text-gray-300 dark:text-gray-700" />
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Store not found</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">This store does not exist or is no longer available.</p>
        <Link to="/stores" className="mt-6 font-semibold text-gray-900 hover:underline dark:text-white">Back to stores</Link>
      </div>
    );
  }

  if (products.length === 0) {
    return <Navigate to={`/store/${store.id}`} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-white transition-colors dark:bg-[#1b1b1b]">
      <Seo
        title={`${store.name} Products | PerkUp`}
        description={`Browse products available from ${store.name}, a PerkUp partner store.`}
        canonicalPath={`/store/${store.id}/products`}
        image={store.logoUrl ? getDisplayImageUrl(store.logoUrl) : undefined}
      />
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
                <StoreIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Product catalog</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">{store.name}</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Browse {products.length} {products.length === 1 ? "product" : "products"} from this store.</p>
            </div>
          </div>
        </section>

        <section className="mt-6" aria-label="Catalog controls">
          <div className="grid gap-3 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[minmax(14rem,1fr)_auto_auto_auto]">
            <label className="relative block">
              <span className="sr-only">Search products</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or details"
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/10 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </label>

            <div className="flex items-center gap-2">
              <SlidersHorizontal className="hidden h-4 w-4 shrink-0 text-gray-400 lg:block" aria-hidden="true" />
              <CustomDropdown
                value={availability}
                onChange={(value) => setAvailability(value as AvailabilityFilter)}
                ariaLabel="Availability"
                className="min-w-44"
                options={[
                  { value: "all", label: "All availability" },
                  { value: "available", label: "Available" },
                  { value: "unavailable", label: "Unavailable" },
                ]}
              />
            </div>

            <div className="flex h-11 items-center gap-2" aria-label="Price range">
              <input aria-label={`Minimum price in ${currency}`} type="number" min="0" step="0.01" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} placeholder={`Min ${currency}`} className="h-full w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              <span className="text-gray-400">–</span>
              <input aria-label={`Maximum price in ${currency}`} type="number" min="0" step="0.01" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} placeholder={`Max ${currency}`} className="h-full w-28 rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
            </div>

            <CustomDropdown
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              ariaLabel="Sort products"
              className="min-w-48"
              options={[
                { value: "name-asc", label: "Name A–Z" },
                { value: "price-asc", label: "Price: low to high" },
                { value: "price-desc", label: "Price: high to low" },
              ]}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400" role="status">
              {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"} shown
            </p>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white">
                  <X className="h-4 w-4" /> Clear filters
                </button>
              )}
              <ViewModeButton value={viewMode} options={catalogViewOptions} onChange={setViewMode} ariaLabel="Change catalog view" />
            </div>
          </div>
        </section>

        {filteredProducts.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-gray-300 px-6 py-14 text-center dark:border-gray-700">
            <Search className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
            <h2 className="mt-3 font-bold text-gray-900 dark:text-white">No matching products</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try changing your search or filters.</p>
          </div>
        ) : viewMode === "tiles" ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="relative flex h-52 items-center justify-center bg-gray-100 dark:bg-gray-800">
                  {product.imageUrl ? <img src={getDisplayImageUrl(product.imageUrl)} alt={product.name} loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-gray-300 dark:text-gray-600" />}
                  {product.available === false && <span className="absolute right-3 top-3 rounded-full bg-gray-950/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">Unavailable</span>}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-bold text-gray-900 dark:text-white">{product.name}</h2>
                    <p className="shrink-0 font-black text-gray-900 dark:text-white">{Number.isFinite(Number(product.price)) ? formatCurrency(Number(product.price)) : "—"}</p>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{product.ingredients || "No additional product details."}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <table className="w-full min-w-[42rem] text-left">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-400">
                <tr><th className="px-5 py-4 font-bold">Product</th><th className="px-5 py-4 font-bold">Details</th><th className="px-5 py-4 font-bold">Availability</th><th className="px-5 py-4 text-right font-bold">Price</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">{product.imageUrl ? <img src={getDisplayImageUrl(product.imageUrl)} alt="" loading="lazy" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-gray-300" />}</div><span className="font-bold text-gray-900 dark:text-white">{product.name}</span></div></td>
                    <td className="max-w-md px-5 py-4 text-sm text-gray-500 dark:text-gray-400">{product.ingredients || "—"}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${product.available === false ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>{product.available === false ? "Unavailable" : "Available"}</span></td>
                    <td className="px-5 py-4 text-right font-black text-gray-900 dark:text-white">{Number.isFinite(Number(product.price)) ? formatCurrency(Number(product.price)) : "—"}</td>
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
