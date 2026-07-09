import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { collection, doc, getDoc, query, where, getDocs } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { Calendar, Gift, ImageIcon, Store, Tag, X } from "lucide-react";
import { Link } from "react-router-dom";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { normalizeStampStyle, StoreStamp, StoreStampStyle } from "../../components/StoreStamp";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { formatPhilippineDate, getPhilippineDateTimeMillis } from "../../lib/dateTime";

const isPromotionAvailable = (promotion: any) => {
  const now = Date.now();
  const startsAt = promotion.startDate ? getPhilippineDateTimeMillis(promotion.startDate) : Number.NaN;
  const endsAt = promotion.endDate ? getPhilippineDateTimeMillis(promotion.endDate) : Number.NaN;

  if (promotion.active === false) return false;
  if (Number.isFinite(startsAt) && startsAt > now) return false;
  if (Number.isFinite(endsAt) && endsAt <= now) return false;
  return true;
};

const formatPromoDuration = (promotion: any) => {
  const start = promotion.startDate ? formatPhilippineDate(promotion.startDate, "") : "";
  const end = promotion.endDate ? formatPhilippineDate(promotion.endDate, "") : "";
  if (start && end) return `${start} - ${end}`;
  if (end) return `Until ${end}`;
  if (start) return `From ${start}`;
  return "No expiry";
};

export default function CustomerCards() {
  const { user } = useAuth();
  const [cards, setCards] = useState<any[]>([]);
  const [promoCards, setPromoCards] = useState<any[]>([]);
  const [storeStyles, setStoreStyles] = useState<Record<string, StoreStampStyle>>({});
  const [selectedPromo, setSelectedPromo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCards() {
      if (!user) return;
      try {
        // Query active cards for this customer
        const q = query(collection(db, "cards"), where("customerId", "==", user.id));
        const querySnapshot = await getDocs(q);
        const fetchedCards = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCards(fetchedCards);

        const storeIds = Array.from(new Set(fetchedCards.map((card) => String(card.storeId || "")).filter(Boolean)));
        const styleEntries = await Promise.all(
          storeIds.map(async (storeId) => {
            const storeSnap = await getDoc(doc(db, "stores", storeId));
            const store = storeSnap.data();
            return [storeId, normalizeStampStyle(store)] as const;
          }),
        );
        setStoreStyles(Object.fromEntries(styleEntries));

        if (storeIds.length === 0) {
          setPromoCards([]);
          return;
        }

        const promotionsSnapshot = await getDocs(query(collection(db, "promotions"), where("storeId", "in", storeIds)));
        const cardsByStoreId = fetchedCards.reduce<Record<string, any>>((result, card) => {
          const storeId = String(card.storeId || "");
          if (storeId) result[storeId] = card;
          return result;
        }, {});
        const nextPromoCards = promotionsSnapshot.docs
          .map((promotionDoc) => {
            const promotion = { id: promotionDoc.id, ...promotionDoc.data() };
            const card = cardsByStoreId[String((promotion as any).storeId || "")];
            const progress = Number(card?.promoProgress?.[promotionDoc.id] || 0);
            return { ...promotion, card, progress };
          })
          .filter(isPromotionAvailable)
          .filter((promotion: any) => Number(promotion.progress || 0) > 0)
          .sort((first: any, second: any) => String(first.title || "").localeCompare(String(second.title || "")));
        setPromoCards(nextPromoCards);
      } catch (error) {
        handleDataError(error, OperationType.GET, "cards");
      } finally {
        setLoading(false);
      }
    }
    fetchCards();
  }, [user]);

  if (loading) return <PageSkeleton variant="cards" />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Active Reward Cards</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Your progress at participating stores.</p>
        </div>
      </div>

      {promoCards.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-dashed border-gray-300 dark:border-gray-700 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
            <Gift className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          </div>
          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">No promo cards with stars yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 max-w-sm mb-6">Earn at least one promotion stamp at a participating store to show its reward card here.</p>
          <Link to="/customer/stores" className="text-[#1b1b1b] dark:text-white font-medium hover:underline">
            Find stores near you
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-4" aria-labelledby="promo-cards-heading">
            <div>
              <h3 id="promo-cards-heading" className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Promo Cards</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Promotion mechanics, banners, and reward progress.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {promoCards.map((promo) => {
                const stampStyle = storeStyles[String(promo.storeId || "")] || normalizeStampStyle(promo.card);
                const requiredStamps = Math.max(Number(promo.requiredStamps || 10), 1);
                const progress = Math.max(Number(promo.progress || 0), 0);
                const filledCount = Math.min(progress, requiredStamps);
                const isReady = progress >= requiredStamps;

                return (
                  <button
                    key={promo.id}
                    type="button"
                    onClick={() => setSelectedPromo(promo)}
                    className="overflow-hidden rounded-3xl border border-gray-100 bg-white text-left shadow-sm transition-colors hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] focus:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600 dark:focus:ring-white dark:focus:ring-offset-gray-950"
                    aria-label={`View details for ${promo.title || "special promotion"}`}
                  >
                      {promo.bannerImageUrl ? (
                        <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt={`${promo.title || "Promotion"} banner`} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-32 items-center justify-center bg-gray-100 text-gray-400 dark:bg-white/10">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                      <div className="space-y-5 p-6">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                              <Store className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{promo.card?.storeName || "Participating store"}</span>
                            </div>
                            <h4 className="mt-2 text-lg font-bold leading-snug text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h4>
                            {promo.linkedProductName && (
                              <p className="mt-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
                                Product: {promo.linkedProductName}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${isReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200"}`}>
                            {progress}/{requiredStamps}
                          </span>
                        </div>

                        <div className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">
                          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Mechanics</p>
                          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                            {promo.description || `Collect ${requiredStamps} ${normalizeStampStyle(stampStyle).stampLabel.toLowerCase()}s to claim this promotion.`}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {[...Array(filledCount)].map((_, i) => (
                            <StoreStamp key={i} style={stampStyle} size="sm" />
                          ))}
                          {[...Array(Math.max(0, requiredStamps - filledCount))].map((_, i) => (
                            <StoreStamp key={`empty-${i}`} style={stampStyle} filled={false} size="sm" />
                          ))}
                        </div>

                        <div className="grid gap-2 border-t border-gray-100 pt-4 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            <span>{formatPromoDuration(promo)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Gift className="h-4 w-4" />
                            <span>{isReady ? "Ready to claim" : `${Math.max(requiredStamps - progress, 0)} more to claim`}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {selectedPromo && (
        <PromoCardDetailsModal
          promo={selectedPromo}
          stampStyle={storeStyles[String(selectedPromo.storeId || "")] || normalizeStampStyle(selectedPromo.card)}
          onClose={() => setSelectedPromo(null)}
        />
      )}
    </div>
  );
}

function PromoCardDetailsModal({
  promo,
  stampStyle,
  onClose,
}: {
  promo: any;
  stampStyle: StoreStampStyle;
  onClose: () => void;
}) {
  const requiredStamps = Math.max(Number(promo.requiredStamps || 10), 1);
  const progress = Math.max(Number(promo.progress || 0), 0);
  const filledCount = Math.min(progress, requiredStamps);
  const isReady = progress >= requiredStamps;
  const normalizedStampStyle = normalizeStampStyle(stampStyle);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-card-details-title"
        className="max-h-[92vh] w-full overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900 sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Card details</p>
            <h2 id="promo-card-details-title" className="truncate text-lg font-bold text-gray-900 dark:text-white">
              {promo.title || "Special Promotion"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close card details"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
          {promo.bannerImageUrl ? (
            <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt={`${promo.title || "Promotion"} banner`} className="h-48 w-full object-cover sm:h-56" />
          ) : (
            <div className="flex h-40 items-center justify-center bg-gray-100 text-gray-400 dark:bg-white/10">
              <ImageIcon className="h-8 w-8" />
            </div>
          )}

          <div className="space-y-5 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                  <Store className="h-4 w-4 shrink-0" />
                  <span className="truncate">{promo.card?.storeName || "Participating store"}</span>
                </div>
                {promo.linkedProductName && (
                  <div className="mt-2 flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
                    <Tag className="h-4 w-4 shrink-0" />
                    <span className="truncate">{promo.linkedProductName}</span>
                  </div>
                )}
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${isReady ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200"}`}>
                {isReady ? "Ready to claim" : `${Math.max(requiredStamps - progress, 0)} more to claim`}
              </span>
            </div>

            <div>
              <h3 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                {promo.description || `Collect ${requiredStamps} ${normalizedStampStyle.stampLabel.toLowerCase()}s to claim this promotion.`}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">Progress</p>
                <p className="text-sm font-bold text-gray-900 dark:text-white">{progress}/{requiredStamps}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {[...Array(filledCount)].map((_, i) => (
                  <StoreStamp key={i} style={stampStyle} />
                ))}
                {[...Array(Math.max(0, requiredStamps - filledCount))].map((_, i) => (
                  <StoreStamp key={`empty-${i}`} style={stampStyle} filled={false} />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Calendar className="h-4 w-4" />
                  Validity
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{formatPromoDuration(promo)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  <Gift className="h-4 w-4" />
                  Reward
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">
                  {isReady ? "Ask staff to redeem this card." : `Collect ${Math.max(requiredStamps - progress, 0)} more ${normalizedStampStyle.stampLabel.toLowerCase()}${Math.max(requiredStamps - progress, 0) === 1 ? "" : "s"}.`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
