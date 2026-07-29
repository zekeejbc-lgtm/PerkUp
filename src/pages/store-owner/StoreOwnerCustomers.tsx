import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { User, Star, ArrowLeft, Minus, Plus, Users, Clock, MessageSquare, Heart, CheckCircle2, FileText, Gift, Loader2 } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { formatCustomerCode } from "../../lib/customerId";
import { CategorySearchInput } from "../../components/CategorySearchInput";
import {
  getCustomerLoyaltyLabel,
  getCustomerLoyaltySegment,
} from "../../lib/customerLoyaltySegment";

const CUSTOMERS_PER_PAGE = 12;
const SCROLL_PANEL_CLASS = "overflow-y-auto pr-1";
const STAMP_COOLDOWN_MS = 2000;

const toDate = (value: any) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getInitial = (name?: string) => String(name || "C").trim().charAt(0).toUpperCase() || "C";

const buildScanActivity = (scans: any[]) =>
  scans
    .map((scan) => {
      const date = toDate(scan.timestamp) || toDate(scan.issuedAt) || toDate(scan.createdAt);
      const points = Number(scan.points || 0);
      return {
        id: scan.id,
        action: scan.promotionTitle ? `Earned stamp: ${scan.promotionTitle}` : "Earned points",
        points: points > 0 ? `+${points}` : `${points}`,
        date: date?.toISOString() || new Date().toISOString(),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

const buildUsuals = (scans: any[]) => {
  const counts = new Map<string, number>();
  scans.forEach((scan) => {
    const label = String(scan.promotionTitle || "").trim();
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([label]) => label);
};

export default function StoreOwnerCustomers({ store }: { store: any }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [updatingPromotionId, setUpdatingPromotionId] = useState<string | null>(null);
  const [promotionCooldowns, setPromotionCooldowns] = useState<Record<string, boolean>>({});

  const fetchPromotions = async () => {
    if (!store?.id) return;
    try {
      const q = query(collection(db, "promotions"), where("storeId", "==", store.id));
      const snap = await getDocs(q);
      setPromotions(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })).filter(p => p.active !== false));
    } catch (error) {
      console.error("Failed to fetch promotions", error);
    }
  };

  const fetchCustomers = async () => {
    if (!store?.id) return;
    setLoading(true);
    try {
      const reviewQuery = query(collection(db, "store_reviews"), where("storeId", "==", store.id));
      const reviewSnap = await getDocs(reviewQuery);
      const feedbackByCustomer = reviewSnap.docs.reduce<Record<string, any[]>>((acc, reviewDoc) => {
        const item = { id: reviewDoc.id, ...reviewDoc.data() } as any;
        if (!item.customerId) return acc;
        acc[item.customerId] = [...(acc[item.customerId] || []), item];
        return acc;
      }, {});

      const scansQuery = query(collection(db, "promotions_scanned"), where("storeId", "==", store.id));
      const scansSnap = await getDocs(scansQuery);
      const scansByCustomer = scansSnap.docs.reduce<Record<string, any[]>>((acc, scanDoc) => {
        const item = { id: scanDoc.id, ...scanDoc.data() } as any;
        if (!item.customerId) return acc;
        acc[item.customerId] = [...(acc[item.customerId] || []), item];
        return acc;
      }, {});

      const q = query(collection(db, "cards"), where("storeId", "==", store.id));
      const snap = await getDocs(q);
      
      const custData = [];
      for (const d of snap.docs) {
        const card = d.data() as any;
        let name = card.accountDeleted ? "Deleted account" : (card.customerName || "Unknown");
        let email = "";
        let username = "";
        let avatarUrl = "";
        let bio = "";
        let joinedAt = null;
        const customerScans = scansByCustomer[card.customerId] || [];
        let favorites = buildUsuals(customerScans);
        let recentHistory = buildScanActivity(customerScans);
        let feedback = (feedbackByCustomer[card.customerId] || []).sort((a, b) => {
          const aTime = toDate(a.createdAt)?.getTime() ?? 0;
          const bTime = toDate(b.createdAt)?.getTime() ?? 0;
          return bTime - aTime;
        });
        
        try {
           const [userSnap, customerSnap] = await Promise.all([
             getDoc(doc(db, "users", card.customerId)),
             getDoc(doc(db, "customers", card.customerId)),
           ]);
           if (userSnap.exists()) {
               const profile = userSnap.data() as any;
               name = card.accountDeleted ? "Deleted account" : (profile.name || profile.displayName || name);
               email = profile.email || "";
               username = profile.username || "";
               avatarUrl = profile.avatarUrl || profile.photoURL || profile.profilePic || "";
               bio = profile.bio || "";
               joinedAt = profile.createdAt || card.joinedAt || card.createdAt || null;
           }
           if (customerSnap.exists()) {
               const customer = customerSnap.data() as any;
               joinedAt = joinedAt || customer.createdAt || null;
               bio = bio || customer.bio || "";
           }
        } catch (e) {
          console.error("Failed to load customer profile", card.customerId, e);
        }

        custData.push({
          id: d.id, // card id
          customerId: card.customerId,
          name,
          email,
          username,
          avatarUrl,
          bio,
          joinedAt,
          stars: card.stars || 0,
          updatedAt: card.updatedAt,
          favorites,
          recentHistory,
          feedback,
          promoProgress: card.promoProgress || {},
          accountDeleted: Boolean(card.accountDeleted),
        });
      }
      setCustomers(custData.sort((a,b) => b.stars - a.stars));
    } catch (error) {
      console.error("Failed to fetch customers", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchPromotions();
  }, [store]);

  const updateStars = async (delta: number) => {
    if (!selectedCustomer) return;
    try {
      const result = await invokeAdminBackend<{ stars: number }>({
        action: "adjust_card_stars",
        cardId: selectedCustomer.id,
        delta,
      });
      const newStars = result.stars;
      const updatedCustomer = { 
        ...selectedCustomer, 
        stars: newStars,
        recentHistory: [
          { id: Date.now(), action: delta > 0 ? "Earned universal point(s)" : "Deducted universal point(s)", points: delta > 0 ? `+${delta}` : `${delta}`, date: new Date().toISOString() },
          ...selectedCustomer.recentHistory
        ]
      };
      setSelectedCustomer(updatedCustomer);
      setCustomers(customers.map(c => c.id === selectedCustomer.id ? updatedCustomer : c));
    } catch (e) {
      alert("Failed to update points");
    }
  };

  const updatePromoProgress = async (promoId: string, promoTitle: string, delta: number, requiredStamps: number) => {
    if (!selectedCustomer || updatingPromotionId || promotionCooldowns[promoId]) return;
    const currentProgress = Number(selectedCustomer.promoProgress?.[promoId] || 0);
    if (delta > 0 && currentProgress >= requiredStamps) return;

    setUpdatingPromotionId(promoId);
    try {
      const result = await invokeAdminBackend<{ progress: number }>({
        action: "adjust_card_promotion",
        cardId: selectedCustomer.id,
        promotionId: promoId,
        delta,
      });
      const savedProgress = result.progress;

      const updatedCustomer = { 
        ...selectedCustomer, 
        promoProgress: {
          ...(selectedCustomer.promoProgress || {}),
          [promoId]: savedProgress
        },
        recentHistory: [
          { id: Date.now(), action: delta > 0 ? `Earned stamp: ${promoTitle}` : `Removed stamp: ${promoTitle}`, points: delta > 0 ? `+${delta}` : `${delta}`, date: new Date().toISOString() },
          ...selectedCustomer.recentHistory
        ]
      };
      setSelectedCustomer(updatedCustomer);
      setCustomers(customers.map(c => c.id === selectedCustomer.id ? updatedCustomer : c));

      if (delta > 0 && savedProgress < requiredStamps) {
        setPromotionCooldowns(current => ({ ...current, [promoId]: true }));
        window.setTimeout(() => {
          setPromotionCooldowns(current => {
            const next = { ...current };
            delete next[promoId];
            return next;
          });
        }, STAMP_COOLDOWN_MS);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to update stamp card.");
    } finally {
      setUpdatingPromotionId(null);
    }
  };

  const filtered = useMemo(() => {
    const terms = search.toLocaleLowerCase().split(",").map((term) => term.trim()).filter(Boolean);
    if (!terms.length) return customers;
    return customers.filter((customer) => {
      const segment = getCustomerLoyaltySegment(Number(customer.stars || 0));
      const status = customer.accountDeleted ? "deleted" : "active";
      const searchable = [
        customer.name,
        customer.email,
        customer.username,
        customer.customerId,
        formatCustomerCode(customer.customerId),
        segment,
        status,
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => {
        if (["loyal", "regular", "new"].includes(term)) return segment === term;
        if (["active", "deleted"].includes(term)) return status === term;
        return searchable.includes(term);
      });
    });
  }, [customers, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / CUSTOMERS_PER_PAGE));
  const paginatedCustomers = filtered.slice((currentPage - 1) * CUSTOMERS_PER_PAGE, currentPage * CUSTOMERS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  if (loading) return <PageSkeleton variant="table" />;

  if (selectedCustomer) {
    const isLoyal = getCustomerLoyaltySegment(Number(selectedCustomer.stars || 0)) === "loyal";
    const customerSegment = getCustomerLoyaltyLabel(Number(selectedCustomer.stars || 0));

    return (
      <div className="space-y-6 pb-20">
         <button onClick={() => setSelectedCustomer(null)} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" /> Back
         </button>

         {/* Header Info */}
         <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-sm">
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0 border-4 border-gray-100 dark:border-white/10">
              {selectedCustomer.avatarUrl && !selectedCustomer.accountDeleted ? (
                <img src={getDisplayImageUrl(selectedCustomer.avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-[#1b1b1b] dark:text-white">{getInitial(selectedCustomer.name)}</span>
              )}
            </div>
            <div className="flex-1 text-center sm:text-left">
               <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{selectedCustomer.name}</h2>
               <p className="text-gray-500 font-mono text-sm tracking-widest mt-1 uppercase mb-3 text-[#1b1b1b] dark:text-white">
                 {selectedCustomer.accountDeleted ? "Customer identifier removed" : (selectedCustomer.username ? `@${selectedCustomer.username}` : formatCustomerCode(selectedCustomer.customerId))}
               </p>
               
               <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                 <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${isLoyal ? 'bg-gray-100 text-[#1b1b1b] dark:bg-white/15 dark:text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                   {isLoyal && <Star className="w-3 h-3 fill-current" />} {customerSegment}
                 </span>
                 <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white rounded-full text-xs font-bold tracking-wide uppercase">
                   <CheckCircle2 className="w-3 h-3" /> {selectedCustomer.accountDeleted ? "Account deleted" : "Active Card"}
                 </span>
               </div>
            </div>
            <div className="shrink-0 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 text-center min-w-[120px] shadow-inner">
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Points</p>
               <div className="text-4xl font-black text-gray-900 dark:text-white flex items-center justify-center gap-1">
                 {selectedCustomer.stars} <Star className="w-6 h-6 text-[#1b1b1b] fill-[#1b1b1b] dark:text-white dark:fill-white" />
               </div>
            </div>
         </div>

         {/* Dashboard Grid */}
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column (Actions & Profile) */}
            <div className="space-y-6">
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Manage Points</h3>
                  <div className="flex items-center justify-center gap-3">
                    <button disabled={selectedCustomer.accountDeleted} onClick={() => updateStars(-1)} className="flex-1 h-12 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors">
                      <Minus className="w-5 h-5" />
                    </button>
                    <button disabled={selectedCustomer.accountDeleted} onClick={() => updateStars(1)} className="flex-[2] h-12 rounded-xl bg-[#1b1b1b] text-white font-bold flex items-center justify-center gap-2 hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 transition-colors shadow-sm">
                      <Plus className="w-5 h-5" /> Add Point
                    </button>
                  </div>
               </div>

               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Profile Details</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Customer ID</p>
                      <p className="font-mono text-xs font-semibold text-gray-900 dark:text-white break-all" title={selectedCustomer.customerId}>
                        {formatCustomerCode(selectedCustomer.customerId)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Email Address</p>
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{selectedCustomer.email || 'No email provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Member Since</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {selectedCustomer.joinedAt ? (toDate(selectedCustomer.joinedAt) || new Date(selectedCustomer.joinedAt)).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                    <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
                      <p className="mb-1 flex items-center gap-1.5 text-xs text-gray-500"><FileText className="h-3.5 w-3.5" /> Bio</p>
                      <p className="whitespace-pre-wrap break-words text-sm font-medium leading-6 text-gray-900 dark:text-gray-200">
                        {selectedCustomer.bio || "No bio added yet."}
                      </p>
                    </div>
                  </div>
               </div>
            </div>

            {/* Middle & Right Column */}
            <div className="lg:col-span-2 space-y-6">
               
               {/* Active Promos Showcase */}
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                 <div className="flex items-center gap-2 mb-4">
                   <Gift className="w-5 h-5 text-[#1b1b1b] dark:text-white" />
                   <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Digital Stamp Cards</h3>
                 </div>
                 {promotions.length > 0 ? (
                   <div className={`grid max-h-[34rem] grid-cols-1 gap-4 xl:grid-cols-2 ${SCROLL_PANEL_CLASS}`}>
                     {promotions.map((promo: any) => {
                       const progress = selectedCustomer.promoProgress?.[promo.id] || 0;
                       const isClaimable = progress >= promo.requiredStamps;
                       const isUpdating = updatingPromotionId === promo.id;
                       const isCoolingDown = Boolean(promotionCooldowns[promo.id]);
                       const controlsDisabled = Boolean(updatingPromotionId);

                       return (
                         <div key={promo.id} className={`p-5 rounded-3xl border ${isClaimable ? 'border-[#1b1b1b] bg-gray-100 dark:bg-white/10 shadow-sm' : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'} relative overflow-hidden transition-all flex flex-col`}>
                           {isClaimable && (
                             <div className="absolute top-0 right-0 bg-[#1b1b1b] text-white text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-bl-lg">
                               Ready to Claim
                             </div>
                           )}
                           <h4 className="font-bold text-gray-900 dark:text-white mb-1 pr-16">{promo.title}</h4>
                           <p className="text-xs text-gray-500 mb-4">{promo.description}</p>
                           
                           <div className="flex flex-wrap gap-2 mb-6">
                             {[...Array(promo.requiredStamps)].map((_, idx) => {
                                const isStamped = idx < progress;
                                return (
                                  <div key={idx} className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${isStamped ? 'bg-gray-100 border-[#1b1b1b] text-[#1b1b1b] shadow-inner dark:bg-white/10 dark:border-[#1b1b1b]/50' : 'bg-white dark:bg-gray-800 border-dashed border-gray-300 dark:border-gray-600 text-gray-300 dark:text-gray-600'}`}>
                                     <Star className={`w-5 h-5 ${isStamped ? 'fill-current' : ''}`} />
                                  </div>
                                )
                             })}
                           </div>
                           
                           <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700/50 pt-4 mt-auto">
                             <span className={`text-sm font-bold ${isClaimable ? 'text-[#1b1b1b] dark:text-white' : 'text-gray-900 dark:text-white'}`}>
                               {progress} / {promo.requiredStamps} Stamps
                             </span>
                             <div className="flex items-center gap-2">
                                <button disabled={controlsDisabled || progress <= 0} onClick={() => updatePromoProgress(promo.id, promo.title, -1, promo.requiredStamps)} className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-900/30 dark:hover:border-red-800 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-inherit dark:disabled:hover:bg-gray-800">
                                   <Minus className="w-4 h-4" />
                                </button>
                                <button disabled={controlsDisabled || isCoolingDown || isClaimable} onClick={() => updatePromoProgress(promo.id, promo.title, 1, promo.requiredStamps)} className="min-w-[102px] px-4 h-8 rounded-full bg-[#1b1b1b] text-white text-sm font-bold flex items-center justify-center gap-1 hover:bg-black transition-colors shadow-sm disabled:cursor-not-allowed disabled:bg-gray-400 dark:disabled:bg-gray-700">
                                   {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : isClaimable ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                                   {isUpdating ? "Adding..." : isClaimable ? "Complete" : isCoolingDown ? "Wait..." : "Stamp"}
                                </button>
                             </div>
                           </div>
                         </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div className="text-sm text-gray-500 italic p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-center border border-gray-200 dark:border-gray-800">
                     No active store promotions created yet. Add promos in the Promotions tab.
                   </div>
                 )}
               </div>

               {/* Favourites */}
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col">
                 <div className="flex items-center gap-2 mb-4">
                   <Heart className="w-5 h-5 text-red-500" />
                   <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">The Usual</h3>
                 </div>
                 <div className={`flex max-h-36 flex-wrap gap-2 ${SCROLL_PANEL_CLASS}`}>
                   {selectedCustomer.favorites?.length > 0 ? (
                     selectedCustomer.favorites.map((fav: string, index: number) => (
                       <span key={index} className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300">
                         {fav}
                       </span>
                     ))
                   ) : (
                     <p className="text-sm text-gray-500">Not enough data to determine favorites.</p>
                   )}
                 </div>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {/* Activity History */}
                 <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm flex max-h-[28rem] min-h-[20rem] flex-col">
                   <div className="flex items-center gap-2 mb-6">
                     <Clock className="w-5 h-5 text-gray-400" />
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Recent Activity</h3>
                   </div>
                   <div className={`min-h-0 flex-1 space-y-4 ${SCROLL_PANEL_CLASS}`}>
                     {selectedCustomer.recentHistory?.map((item: any, i: number) => (
                       <div key={i} className="flex justify-between items-start gap-4 pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
                         <div>
                           <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.action}</p>
                           <p className="text-xs text-gray-500 mt-0.5">{new Date(item.date).toLocaleDateString()}</p>
                         </div>
                       <span className={`font-black tracking-tight ${String(item.points).startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                           {item.points}
                         </span>
                       </div>
                     ))}
                     {(!selectedCustomer.recentHistory || selectedCustomer.recentHistory.length === 0) && (
                       <p className="text-sm text-gray-500 italic p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-center">No scan activity yet.</p>
                     )}
                   </div>
                 </div>

                 {/* Feedback */}
                 <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm flex max-h-[28rem] min-h-[20rem] flex-col">
                   <div className="flex items-center gap-2 mb-6">
                     <MessageSquare className="w-5 h-5 text-gray-400" />
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Feedback Left</h3>
                   </div>
                   <div className={`min-h-0 flex-1 space-y-4 ${SCROLL_PANEL_CLASS}`}>
                     {selectedCustomer.feedback?.length > 0 ? (
                       selectedCustomer.feedback.map((item: any, i: number) => (
                         <div key={i} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl">
                           <div className="flex text-[#1b1b1b] dark:text-white mb-2">
                             {[...Array(5)].map((_, idx) => (
                               <Star key={idx} className={`w-3 h-3 ${idx < item.rating ? 'fill-current' : 'text-gray-300 dark:text-gray-700'}`} />
                             ))}
                           </div>
                           <p className="text-sm text-gray-700 dark:text-gray-300 font-medium italic">"{item.comment}"</p>
                           <p className="text-xs text-gray-500 mt-2">
                             {(toDate(item.createdAt) || toDate(item.date) || new Date()).toLocaleDateString()}
                           </p>
                         </div>
                       ))
                     ) : (
                       <p className="text-sm text-gray-500 italic p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl text-center">No feedback left yet.</p>
                     )}
                   </div>
                 </div>
               </div>

            </div>
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Customer Database</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Manage regulars, add points, and see activity histories.</p>
        </div>
      </div>

      <CategorySearchInput
        value={search}
        onChange={setSearch}
        categories={["Active", "Deleted", "Loyal", "Regular", "New"]}
        placeholder="Search customers or filter by segment, status..."
        ariaLabel="Search and filter customer database"
        suggestionLabel="customer filter"
        collapsibleFilters
        resultsId="customer-database-results"
        className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-12 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-gray-500"
      />

      <ScrollableRegion label="Customer database" id="customer-database-results" className="scroll-mt-6 grid grid-cols-1 gap-4 pr-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.length === 0 ? (
           <div className="col-span-full text-center py-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl">
             <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
             <p className="font-bold text-gray-900 dark:text-white mb-2">No customers found.</p>
           </div>
        ) : (
          paginatedCustomers.map(c => (
            <button 
              key={c.id} 
              onClick={() => setSelectedCustomer(c)}
              className="flex flex-col bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 hover:border-[#1b1b1b] dark:hover:border-[#1b1b1b] transition-all text-left shadow-sm group hover:shadow-md"
            >
              <div className="flex items-start justify-between w-full mb-4">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0 border border-gray-200 dark:border-white/15 group-hover:scale-105 transition-transform">
                  {c.avatarUrl && !c.accountDeleted ? (
                    <img src={getDisplayImageUrl(c.avatarUrl)} alt="" loading="lazy" className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-[#1b1b1b] dark:text-white" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                  <Star className="w-3.5 h-3.5 text-[#1b1b1b] fill-[#1b1b1b] dark:text-white dark:fill-white" />
                  <span className="font-black text-sm text-gray-900 dark:text-white leading-none">{c.stars}</span>
                </div>
              </div>
              <div className="w-full">
                <p className="font-bold text-lg text-gray-900 dark:text-white truncate mb-0.5 group-hover:text-[#1b1b1b] dark:group-hover:text-white transition-colors">{c.name}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 uppercase tracking-widest" title={c.customerId}>
                    {c.accountDeleted ? "Deleted" : formatCustomerCode(c.customerId)}
                  </span>
                  <span className="text-gray-300 dark:text-gray-700">&bull;</span>
                  <span className={`${getCustomerLoyaltySegment(Number(c.stars || 0)) === "loyal" ? 'text-[#1b1b1b] dark:text-white font-bold' : 'text-gray-400'}`}>
                    {getCustomerLoyaltySegment(Number(c.stars || 0)) === "loyal" ? 'Loyal' : (getCustomerLoyaltySegment(Number(c.stars || 0)) === "regular" ? 'Regular' : 'New')}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </ScrollableRegion>
      <Pagination
        page={currentPage}
        pageSize={CUSTOMERS_PER_PAGE}
        totalItems={filtered.length}
        itemLabel="customers"
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
