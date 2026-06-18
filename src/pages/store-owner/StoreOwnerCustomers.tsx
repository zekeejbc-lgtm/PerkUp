import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Search, User, Star, ArrowLeft, Minus, Plus, Users, Clock, MessageSquare, Heart, CheckCircle2, Gift } from "lucide-react";

export default function StoreOwnerCustomers({ store }: { store: any }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);

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
      const q = query(collection(db, "cards"), where("storeId", "==", store.id));
      const snap = await getDocs(q);
      
      const custData = [];
      for (const d of snap.docs) {
        let name = "Unknown";
        let email = "";
        let joinedAt = null;
        let lifetimeStars = 0;
        let favorites = [];
        let recentHistory = [];
        let feedback = [];
        
        try {
           const cSnap = await getDoc(doc(db, "customers", d.data().customerId));
           if (cSnap.exists()) {
               name = cSnap.data().name || "Unknown";
               email = cSnap.data().email || "";
               joinedAt = cSnap.data().createdAt;
               lifetimeStars = cSnap.data().lifetimeStars || d.data().stars || 0;
               // Mocking additional data for dashboard
               favorites = cSnap.data().favorites || ["Iced Caramel Macchiato", "Blueberry Muffin"];
               recentHistory = [
                 { id: 1, action: "Earned points", points: "+2", date: new Date().toISOString() },
                 { id: 2, action: "Redeemed free coffee", points: "-10", date: new Date(Date.now() - 86400000).toISOString() },
               ];
               feedback = [
                 { id: 1, rating: 5, comment: "Always friendly staff!", date: new Date(Date.now() - 172800000).toISOString() }
               ];
           }
        } catch (e) {}

        custData.push({
          id: d.id, // card id
          customerId: d.data().customerId,
          name,
          email,
          joinedAt,
          lifetimeStars,
          stars: d.data().stars || 0,
          updatedAt: d.data().updatedAt,
          favorites,
          recentHistory,
          feedback,
          promoProgress: d.data().promoProgress || {}
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
      const newStars = Math.max(0, selectedCustomer.stars + delta);
      await updateDoc(doc(db, "cards", selectedCustomer.id), {
        stars: newStars,
        updatedAt: new Date()
      });
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

  const updatePromoProgress = async (promoId: string, promoTitle: string, delta: number) => {
    if (!selectedCustomer) return;
    const currentProgress = selectedCustomer.promoProgress?.[promoId] || 0;
    const newProgress = Math.max(0, currentProgress + delta);
    
    try {
      const cardRef = doc(db, "cards", selectedCustomer.id);
      await updateDoc(cardRef, {
        [`promoProgress.${promoId}`]: newProgress,
        updatedAt: new Date()
      });

      const updatedCustomer = { 
        ...selectedCustomer, 
        promoProgress: {
          ...(selectedCustomer.promoProgress || {}),
          [promoId]: newProgress
        },
        recentHistory: [
          { id: Date.now(), action: delta > 0 ? `Earned stamp: ${promoTitle}` : `Removed stamp: ${promoTitle}`, points: delta > 0 ? `+${delta}` : `${delta}`, date: new Date().toISOString() },
          ...selectedCustomer.recentHistory
        ]
      };
      setSelectedCustomer(updatedCustomer);
      setCustomers(customers.map(c => c.id === selectedCustomer.id ? updatedCustomer : c));
    } catch (e) {
      console.error(e);
      alert("Failed to update stamp card.");
    }
  };

  const loadDemoCustomers = async () => {
    try {
      const demoNames = ["Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Prince"];
      for (let i = 0; i < demoNames.length; i++) {
        const custId = `demo-cust-${Math.random().toString(36).substring(2, 9)}`;
        await setDoc(doc(db, "customers", custId), {
          name: demoNames[i],
          email: `${demoNames[i].split(" ")[0].toLowerCase()}@example.com`,
          createdAt: serverTimestamp(),
          lifetimeStars: Math.floor(Math.random() * 20) + 5
        });
        await setDoc(doc(collection(db, "cards")), {
          storeId: store.id,
          customerId: custId,
          stars: Math.floor(Math.random() * 10) + 1,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      await fetchCustomers();
    } catch (error) {
      console.error(error);
      alert("Failed to load demo data.");
    }
  };

  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.customerId.includes(search));

  if (loading) return <div className="text-gray-500 animate-pulse">Loading customers...</div>;

  if (selectedCustomer) {
    const isLoyal = selectedCustomer.lifetimeStars > 20;
    const customerSegment = isLoyal ? 'Loyal Regular' : (selectedCustomer.lifetimeStars > 5 ? 'Regular Customer' : 'New Customer');

    return (
      <div className="space-y-6 pb-20">
         <button onClick={() => setSelectedCustomer(null)} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" /> Back to Customers Directory
         </button>

         {/* Header Info */}
         <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-center sm:items-start gap-6 shadow-sm">
            <div className="w-24 h-24 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0 border-4 border-orange-50 dark:border-orange-950">
              <span className="text-3xl font-black text-orange-600 dark:text-orange-400">{selectedCustomer.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="flex-1 text-center sm:text-left">
               <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">{selectedCustomer.name}</h2>
               <p className="text-gray-500 font-mono text-sm tracking-widest mt-1 uppercase mb-3 text-orange-600 dark:text-orange-400">{selectedCustomer.customerId}</p>
               
               <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                 <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${isLoyal ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                   {isLoyal && <Star className="w-3 h-3 fill-current" />} {customerSegment}
                 </span>
                 <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full text-xs font-bold tracking-wide uppercase">
                   <CheckCircle2 className="w-3 h-3" /> Active Card
                 </span>
               </div>
            </div>
            <div className="shrink-0 bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 text-center min-w-[120px] shadow-inner">
               <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Current Points</p>
               <div className="text-4xl font-black text-gray-900 dark:text-white flex items-center justify-center gap-1">
                 {selectedCustomer.stars} <Star className="w-6 h-6 text-orange-500 fill-orange-500" />
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
                    <button onClick={() => updateStars(-1)} className="flex-1 h-12 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                      <Minus className="w-5 h-5" />
                    </button>
                    <button onClick={() => updateStars(1)} className="flex-[2] h-12 rounded-xl bg-orange-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-sm">
                      <Plus className="w-5 h-5" /> Add Point
                    </button>
                  </div>
               </div>

               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Profile Details</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Email Address</p>
                      <p className="font-semibold text-gray-900 dark:text-white truncate">{selectedCustomer.email || 'No email provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Lifetime Points Earned</p>
                      <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1">
                        {selectedCustomer.lifetimeStars} <Star className="w-3 h-3 text-orange-500" />
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">Member Since</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {selectedCustomer.joinedAt ? new Date(selectedCustomer.joinedAt?.toDate?.() || selectedCustomer.joinedAt).toLocaleDateString() : 'Unknown'}
                      </p>
                    </div>
                  </div>
               </div>
            </div>

            {/* Middle & Right Column */}
            <div className="lg:col-span-2 space-y-6">
               
               {/* Active Promos Showcase */}
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                   <Gift className="w-5 h-5 text-orange-500" />
                   <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Digital Stamp Cards</h3>
                 </div>
                 {promotions.length > 0 ? (
                   <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                     {promotions.map((promo: any) => {
                       const progress = selectedCustomer.promoProgress?.[promo.id] || 0;
                       const isClaimable = progress >= promo.requiredStamps;

                       return (
                         <div key={promo.id} className={`p-5 rounded-3xl border ${isClaimable ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 shadow-sm' : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50'} relative overflow-hidden transition-all flex flex-col`}>
                           {isClaimable && (
                             <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-bl-lg">
                               Ready to Claim
                             </div>
                           )}
                           <h4 className="font-bold text-gray-900 dark:text-white mb-1 pr-16">{promo.title}</h4>
                           <p className="text-xs text-gray-500 mb-4">{promo.description}</p>
                           
                           <div className="flex flex-wrap gap-2 mb-6">
                             {[...Array(promo.requiredStamps)].map((_, idx) => {
                                const isStamped = idx < progress;
                                return (
                                  <div key={idx} className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${isStamped ? 'bg-orange-100 border-orange-500 text-orange-500 shadow-inner dark:bg-orange-900/30 dark:border-orange-500/50' : 'bg-white dark:bg-gray-800 border-dashed border-gray-300 dark:border-gray-600 text-gray-300 dark:text-gray-600'}`}>
                                     <Star className={`w-5 h-5 ${isStamped ? 'fill-current' : ''}`} />
                                  </div>
                                )
                             })}
                           </div>
                           
                           <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700/50 pt-4 mt-auto">
                             <span className={`text-sm font-bold ${isClaimable ? 'text-orange-700 dark:text-orange-400' : 'text-gray-900 dark:text-white'}`}>
                               {progress} / {promo.requiredStamps} Stamps
                             </span>
                             <div className="flex items-center gap-2">
                                <button onClick={() => updatePromoProgress(promo.id, promo.title, -1)} className="w-8 h-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-900/30 dark:hover:border-red-800 transition-colors shadow-sm">
                                   <Minus className="w-4 h-4" />
                                </button>
                                <button onClick={() => updatePromoProgress(promo.id, promo.title, 1)} className="px-4 h-8 rounded-full bg-orange-600 text-white text-sm font-bold flex items-center gap-1 hover:bg-orange-700 transition-colors shadow-sm">
                                   <Plus className="w-4 h-4" /> Stamp
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
               <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                 <div className="flex items-center gap-2 mb-4">
                   <Heart className="w-5 h-5 text-red-500" />
                   <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">The Usual</h3>
                 </div>
                 <div className="flex flex-wrap gap-2">
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
                 <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                   <div className="flex items-center gap-2 mb-6">
                     <Clock className="w-5 h-5 text-gray-400" />
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Recent Activity</h3>
                   </div>
                   <div className="space-y-4">
                     {selectedCustomer.recentHistory?.map((item: any, i: number) => (
                       <div key={i} className="flex justify-between items-start gap-4 pb-4 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0">
                         <div>
                           <p className="font-semibold text-gray-900 dark:text-white text-sm">{item.action}</p>
                           <p className="text-xs text-gray-500 mt-0.5">{new Date(item.date).toLocaleDateString()}</p>
                         </div>
                         <span className={`font-black tracking-tight ${item.points.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                           {item.points}
                         </span>
                       </div>
                     ))}
                   </div>
                 </div>

                 {/* Feedback */}
                 <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
                   <div className="flex items-center gap-2 mb-6">
                     <MessageSquare className="w-5 h-5 text-gray-400" />
                     <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Feedback Left</h3>
                   </div>
                   <div className="space-y-4">
                     {selectedCustomer.feedback?.length > 0 ? (
                       selectedCustomer.feedback.map((item: any, i: number) => (
                         <div key={i} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl">
                           <div className="flex text-orange-500 mb-2">
                             {[...Array(5)].map((_, idx) => (
                               <Star key={idx} className={`w-3 h-3 ${idx < item.rating ? 'fill-current' : 'text-gray-300 dark:text-gray-700'}`} />
                             ))}
                           </div>
                           <p className="text-sm text-gray-700 dark:text-gray-300 font-medium italic">"{item.comment}"</p>
                           <p className="text-xs text-gray-500 mt-2">{new Date(item.date).toLocaleDateString()}</p>
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
        <div className="relative w-full sm:w-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search name or ID..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-72 pl-9 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 dark:text-white shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.length === 0 ? (
           <div className="col-span-full text-center py-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl">
             <Users className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-700 mb-4" />
             <p className="font-bold text-gray-900 dark:text-white mb-2">No customers found.</p>
             {!search && customers.length === 0 && (
               <button onClick={loadDemoCustomers} className="flex items-center gap-2 px-4 py-2 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-xl text-sm font-semibold hover:bg-orange-200 transition-colors mx-auto mt-4 inline-flex">
                 <Users className="w-4 h-4" /> Load Demo Customers
               </button>
             )}
           </div>
        ) : (
          filtered.map(c => (
            <button 
              key={c.id} 
              onClick={() => setSelectedCustomer(c)}
              className="flex flex-col bg-white dark:bg-gray-900 p-5 rounded-3xl border border-gray-200 dark:border-gray-800 hover:border-orange-500 dark:hover:border-orange-500 transition-all text-left shadow-sm group hover:shadow-md"
            >
              <div className="flex items-start justify-between w-full mb-4">
                <div className="w-12 h-12 rounded-full bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center shrink-0 border border-orange-100 dark:border-orange-900/50 group-hover:scale-105 transition-transform">
                  <User className="w-5 h-5 text-orange-500" />
                </div>
                <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-700">
                  <Star className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                  <span className="font-black text-sm text-gray-900 dark:text-white leading-none">{c.stars}</span>
                </div>
              </div>
              <div className="w-full">
                <p className="font-bold text-lg text-gray-900 dark:text-white truncate mb-0.5 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{c.name}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 uppercase tracking-widest">{c.customerId.slice(0, 8)}</span>
                  <span className="text-gray-300 dark:text-gray-700">&bull;</span>
                  <span className={`${c.lifetimeStars > 20 ? 'text-orange-600 dark:text-orange-400 font-bold' : 'text-gray-400'}`}>
                    {c.lifetimeStars > 20 ? 'Loyal' : (c.lifetimeStars > 5 ? 'Regular' : 'New')}
                  </span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
