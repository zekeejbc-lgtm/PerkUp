import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calendar, CheckCircle2, Clock3, Gift, Grid2X2, ImageIcon, List, Search, Store, Tag, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { collection, doc, getDoc, getDocs, getDocsFromServer, query, where } from "@/src/lib/dataCompat";
import { db, handleDataError, OperationType } from "../../lib/backend";
import { supabase } from "../../lib/supabase";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { normalizeStampStyle, StoreStamp, StoreStampStyle } from "../../components/StoreStamp";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { formatPhilippineDate, formatPhilippineDateTime, getPhilippineDateTimeMillis } from "../../lib/dateTime";
import { claimPromotion, listPromotionClaims, PromotionClaim } from "../../lib/promotionClaims";
import { ViewModeButton } from "../../components/ViewModeButton";

const cardViewOptions = [
  { value: "grid", label: "Card", icon: Grid2X2 },
  { value: "list", label: "List", icon: List },
] as const;

const isPromotionAvailable = (promotion: any) => {
  const now = Date.now();
  const startsAt = promotion.startDate ? getPhilippineDateTimeMillis(promotion.startDate) : Number.NaN;
  const endsAt = promotion.endDate ? getPhilippineDateTimeMillis(promotion.endDate) : Number.NaN;
  return promotion.active !== false
    && (!Number.isFinite(startsAt) || startsAt <= now)
    && (!Number.isFinite(endsAt) || endsAt > now);
};

const formatPromoDuration = (promotion: any) => {
  const start = promotion.startDate ? formatPhilippineDate(promotion.startDate, "") : "";
  const end = promotion.endDate ? formatPhilippineDate(promotion.endDate, "") : "";
  if (start && end) return `${start} - ${end}`;
  if (end) return `Until ${end}`;
  if (start) return `From ${start}`;
  return "No promotion expiry";
};

type ProgressGroup = "Claimed" | "Ready to claim" | "In progress" | "Redeemed" | "Expired";

const getProgressGroup = (promo: any): ProgressGroup => {
  if (promo.claim?.status === "claimed") return "Claimed";
  if (promo.claim?.status === "redeemed") return "Redeemed";
  if (promo.claim?.status === "expired") return "Expired";
  return Number(promo.progress || 0) >= Math.max(Number(promo.requiredStamps || 10), 1)
    ? "Ready to claim"
    : "In progress";
};

const groupOrder: ProgressGroup[] = ["Claimed", "Ready to claim", "In progress", "Redeemed", "Expired"];

export default function CustomerCards() {
  const { user } = useAuth();
  const [promoCards, setPromoCards] = useState<any[]>([]);
  const [storeStyles, setStoreStyles] = useState<Record<string, StoreStampStyle>>({});
  const [selectedPromo, setSelectedPromo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    let active = true;

    async function fetchCards() {
      if (!user) return;
      try {
        const [cardsSnapshot, claims] = await Promise.all([
          getDocsFromServer(query(collection(db, "cards"), where("customerId", "==", user.id))),
          listPromotionClaims().catch((error) => {
            console.error("Could not load promotion claims", error);
            return [];
          }),
        ]);
        if (!active) return;
        const cards = cardsSnapshot.docs.map((cardDoc) => ({ id: cardDoc.id, ...cardDoc.data() }));
        const storeIds = Array.from(new Set(cards.map((card) => String(card.storeId || "")).filter(Boolean)));
        const styleEntries = await Promise.all(storeIds.map(async (storeId) => {
          const storeSnap = await getDoc(doc(db, "stores", storeId));
          return [storeId, normalizeStampStyle(storeSnap.data())] as const;
        }));
        if (!active) return;
        setStoreStyles(Object.fromEntries(styleEntries));
        if (!storeIds.length) return setPromoCards([]);

        const promotionsSnapshot = await getDocs(query(collection(db, "promotions"), where("storeId", "in", storeIds)));
        if (!active) return;
        const cardsByStore = cards.reduce<Record<string, any[]>>((result, card) => {
          const storeId = String(card.storeId || "");
          if (storeId) (result[storeId] ||= []).push(card);
          return result;
        }, {});
        const claimsByPromotion = new Map<string, PromotionClaim>();
        claims.forEach((claim) => {
          if (!claimsByPromotion.has(claim.promotionId)) claimsByPromotion.set(claim.promotionId, claim);
        });
        setPromoCards(promotionsSnapshot.docs.map((promotionDoc) => {
          const promotion = { id: promotionDoc.id, ...promotionDoc.data() } as any;
          const matchingCards = cardsByStore[String(promotion.storeId || "")] || [];
          const card = matchingCards.reduce<any | undefined>((best, candidate) => (
            Number(candidate?.promoProgress?.[promotionDoc.id] || 0) > Number(best?.promoProgress?.[promotionDoc.id] || 0)
              ? candidate
              : best
          ), matchingCards[0]);
          return {
            ...promotion,
            card,
            progress: Number(card?.promoProgress?.[promotionDoc.id] || 0),
            claim: claimsByPromotion.get(promotionDoc.id),
          };
        }).filter((promotion) => isPromotionAvailable(promotion) || Boolean(promotion.claim)).filter((promotion) => promotion.progress > 0));
      } catch (error) {
        if (active) handleDataError(error, OperationType.GET, "cards");
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchCards();
    if (!user?.id) return () => { active = false; };

    const channel = supabase
      .channel(`customer-reward-cards-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cards" },
        (payload) => {
          const row = (payload.new || payload.old) as { data?: Record<string, unknown> };
          if (String(row?.data?.customerId || "") === user.id) void fetchCards();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void fetchCards();
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const groupedCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = promoCards.filter((promo) => !term || [promo.publicId, promo.card?.publicId, promo.title, promo.description, promo.card?.storeName, promo.linkedProductName]
      .some((value) => String(value || "").toLowerCase().includes(term)));
    return groupOrder.map((status) => ({
      status,
      stores: Object.entries(filtered.filter((promo) => getProgressGroup(promo) === status).reduce<Record<string, any[]>>((groups, promo) => {
        const storeName = String(promo.card?.storeName || "Participating store");
        (groups[storeName] ||= []).push(promo);
        return groups;
      }, {})).sort(([a], [b]) => a.localeCompare(b)),
    })).filter((group) => group.stores.length);
  }, [promoCards, search]);

  const handleClaim = async (promo: any) => {
    if (claimingId) return;
    setClaimingId(promo.id);
    try {
      const claim = await claimPromotion(promo.id);
      const nextPromo = { ...promo, claim };
      setPromoCards((current) => current.map((item) => item.id === promo.id ? { ...item, claim } : item));
      setSelectedPromo(nextPromo);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not reserve this reward.");
    } finally {
      setClaimingId("");
    }
  };

  if (loading) return <PageSkeleton variant="cards" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Reward Cards</h2>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Track progress, reserve earned rewards, and show your one-time code at the store.</p>
        </div>
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1 lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rewards or stores" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-white" />
          </label>
          <ViewModeButton value={viewMode} options={cardViewOptions} onChange={setViewMode} ariaLabel="Change card view" />
        </div>
      </div>

      {!promoCards.length ? (
        <EmptyCards />
      ) : !groupedCards.length ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">No reward cards match “{search}”.</div>
      ) : (
        <div className="space-y-9">
          {groupedCards.map((group) => (
            <section key={group.status} className="space-y-4">
              <div className="flex items-center gap-2">
                {group.status === "Claimed" || group.status === "Redeemed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-gray-400" />}
                <h3 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">{group.status}</h3>
              </div>
              {group.stores.map(([storeName, promotions]) => (
                <div key={storeName} className="space-y-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400"><Store className="h-3.5 w-3.5" />{storeName}</p>
                  <div className={viewMode === "grid" ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
                    {promotions.map((promo) => <RewardCard key={promo.id} promo={promo} compact={viewMode === "list"} stampStyle={storeStyles[String(promo.storeId || "")] || normalizeStampStyle(promo.card)} claiming={claimingId === promo.id} onOpen={() => setSelectedPromo(promo)} onClaim={() => handleClaim(promo)} />)}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {selectedPromo && <PromoCardDetailsModal promo={selectedPromo} stampStyle={storeStyles[String(selectedPromo.storeId || "")] || normalizeStampStyle(selectedPromo.card)} claiming={claimingId === selectedPromo.id} onClaim={() => handleClaim(selectedPromo)} onClose={() => setSelectedPromo(null)} />}
    </div>
  );
}

function EmptyCards() {
  return <div className="flex flex-col items-center rounded-3xl border border-dashed border-gray-300 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900"><Gift className="mb-4 h-9 w-9 text-gray-300" /><p className="font-medium text-gray-600 dark:text-gray-300">No promo cards with stamps yet</p><p className="mb-5 mt-1 max-w-sm text-sm text-gray-400">Earn at least one promotion stamp to see a reward here.</p><Link to="/customer/stores" className="font-medium hover:underline">Find stores near you</Link></div>;
}

function RewardCard({ promo, stampStyle, compact, claiming, onOpen, onClaim }: any) {
  const required = Math.max(Number(promo.requiredStamps || 10), 1);
  const progress = Math.max(Number(promo.progress || 0), 0);
  const ready = progress >= required;
  const activeClaim = promo.claim?.status === "claimed";
  return (
    <article className={`overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 ${compact ? "flex min-h-32" : ""}`}>
      <button type="button" onClick={onOpen} className={`min-w-0 flex-1 text-left ${compact ? "flex" : "block"}`}>
        {promo.bannerImageUrl ? <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" className={`${compact ? "w-36 sm:w-48" : "h-28 w-full"} shrink-0 object-cover`} /> : <div className={`${compact ? "w-32" : "h-24 w-full"} flex shrink-0 items-center justify-center bg-gray-100 dark:bg-white/10`}><ImageIcon className="h-6 w-6 text-gray-400" /></div>}
        <div className="min-w-0 p-4">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h4 className="truncate text-sm font-bold text-gray-900 dark:text-white">{promo.title || "Special Promotion"}</h4>{promo.linkedProductName && <p className="mt-1 truncate text-xs text-gray-500">{promo.linkedProductName}</p>}</div><span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold dark:bg-white/10">{progress}/{required}</span></div>
          {(promo.card?.publicId || promo.publicId) && <p className="mt-1 font-mono text-[10px] font-semibold text-gray-400">{promo.card?.publicId || promo.publicId}</p>}
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{promo.description || `Collect ${required} stamps to claim this reward.`}</p>
          {!compact && <div className="mt-3 flex flex-wrap gap-1.5">{Array.from({ length: Math.min(required, 10) }, (_, index) => <StoreStamp key={index} style={stampStyle} filled={index < Math.min(progress, required)} size="sm" />)}</div>}
        </div>
      </button>
      {(ready || activeClaim) && <div className={`${compact ? "flex items-center pr-4" : "px-4 pb-4"}`}><button type="button" onClick={activeClaim ? onOpen : onClaim} disabled={claiming} className="w-full rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{activeClaim ? "View claim" : claiming ? "Reserving…" : "Claim!"}</button></div>}
    </article>
  );
}

function PromoCardDetailsModal({ promo, stampStyle, claiming, onClaim, onClose }: { promo: any; stampStyle: StoreStampStyle; claiming: boolean; onClaim: () => void; onClose: () => void }) {
  const required = Math.max(Number(promo.requiredStamps || 10), 1);
  const progress = Math.max(Number(promo.progress || 0), 0);
  const ready = progress >= required;
  const claim = promo.claim as PromotionClaim | undefined;
  const activeClaim = claim?.status === "claimed";
  return <div className="fixed inset-0 z-50 flex items-end bg-black/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:justify-center" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <div role="dialog" aria-modal="true" aria-labelledby="promo-card-details-title" className="max-h-[92vh] w-full overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900 sm:max-w-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-800"><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">{activeClaim ? "Your reserved reward" : "Card details"}</p><h2 id="promo-card-details-title" className="truncate text-lg font-bold dark:text-white">{promo.title || "Special Promotion"}</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button></div>
      <div className="max-h-[calc(92vh-73px)] overflow-y-auto">
        {promo.bannerImageUrl && <img src={getDisplayImageUrl(promo.bannerImageUrl)} alt="" className="h-44 w-full object-cover sm:h-52" />}
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="flex items-center gap-2 text-sm font-semibold text-gray-500"><Store className="h-4 w-4" />{promo.card?.storeName || "Participating store"}</p>{promo.card?.publicId && <p className="mt-1 font-mono text-[11px] font-semibold text-gray-400">{promo.card.publicId}</p>}</div>{promo.linkedProductName && <p className="flex items-center gap-2 text-sm text-gray-500"><Tag className="h-4 w-4" />{promo.linkedProductName}</p>}</div>
          {activeClaim ? <ClaimPanel claim={claim!} redemptionInstructions={promo.redemptionInstructions} /> : <>
            <div><h3 className="text-xs font-bold uppercase tracking-wide text-gray-400">Mechanics</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600 dark:text-gray-300">{promo.description || `Collect ${required} ${normalizeStampStyle(stampStyle).stampLabel.toLowerCase()}s to claim this promotion.`}</p></div>
            <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800"><div className="flex justify-between text-sm font-bold"><span>Progress</span><span>{progress}/{required}</span></div><div className="mt-4 flex flex-wrap gap-2">{Array.from({ length: required }, (_, index) => <StoreStamp key={index} style={stampStyle} filled={index < Math.min(progress, required)} />)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2"><Info icon={<Calendar className="h-4 w-4" />} label="Validity" value={formatPromoDuration(promo)} /><Info icon={<Gift className="h-4 w-4" />} label="Reward" value={ready ? `Reserve within ${Math.max(Number(promo.claimExpiryDays || 7), 1)} days.` : `${required - progress} more to claim.`} /></div>
            {ready && claim?.status !== "redeemed" && <button type="button" onClick={onClaim} disabled={claiming} className="w-full rounded-xl bg-gray-900 px-5 py-3 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">{claiming ? "Reserving your reward…" : claim?.status === "expired" ? "Claim again" : "Claim!"}</button>}
            {claim?.status === "redeemed" && <div className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200">Redeemed {claim.redeemedAt ? formatPhilippineDateTime(claim.redeemedAt) : "successfully"}.</div>}
            {claim?.status === "expired" && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">This reservation expired. The reward is no longer reserved.</div>}
          </>}
        </div>
      </div>
    </div>
  </div>;
}

function ClaimPanel({ claim, redemptionInstructions }: { claim: PromotionClaim; redemptionInstructions?: string }) {
  const instructions = redemptionInstructions?.trim()
    || "Show this one-time QR to staff. If scanning fails, give them the redeem code below. The store can also confirm the claim manually.";

  return <div className="space-y-4">
    <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-100"><p className="font-bold">How to redeem</p><p className="mt-1 whitespace-pre-wrap leading-6">{instructions}</p></div>
    <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-center"><div className="mx-auto rounded-2xl border bg-white p-4"><QRCodeSVG value={claim.qrToken} size={180} level="M" /></div><div className="space-y-3">{claim.publicId && <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Claim ID</p><p className="mt-1 select-all font-mono text-sm font-bold text-gray-700 dark:text-gray-200">{claim.publicId}</p></div>}<div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Redeem code</p><p className="mt-1 select-all font-mono text-3xl font-black tracking-[0.18em] text-gray-900 dark:text-white">{claim.redeemCode}</p></div><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Reserved until</p><p className="mt-1 text-sm font-semibold dark:text-white">{formatPhilippineDateTime(claim.expiresAt)}</p></div><p className="text-xs leading-5 text-gray-500">This QR and code can be used once only and only at the issuing store.</p></div></div>
  </div>;
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-gray-100 p-4 dark:border-gray-800"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-gray-400">{icon}{label}</p><p className="mt-2 text-sm font-semibold dark:text-white">{value}</p></div>;
}
