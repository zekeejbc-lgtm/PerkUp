import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, updateDoc, setDoc, serverTimestamp, deleteDoc, addDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { Gift, Calendar, Plus, Save, Edit2, Trash2, X } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";

export default function StoreOwnerPromotions({ store }: { store: any }) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    requiredStamps: 10,
    startDate: "",
    endDate: "",
    active: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!store?.id) return;
    const fetchPromotions = async () => {
      try {
        const q = query(collection(db, "promotions"), where("storeId", "==", store.id));
        const snap = await getDocs(q);
        setPromotions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed to fetch promos", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPromotions();
  }, [store]);

  const handleOpenModal = (promo: any = null) => {
    if (promo) {
      setEditingPromo(promo);
      setFormData({
        title: promo.title || "",
        description: promo.description || "",
        requiredStamps: promo.requiredStamps || 10,
        startDate: promo.startDate || "",
        endDate: promo.endDate || "",
        active: promo.active ?? true
      });
    } else {
      setEditingPromo(null);
      setFormData({ title: "", description: "", requiredStamps: 10, startDate: "", endDate: "", active: true });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = {
        storeId: store.id,
        ...formData,
        updatedAt: serverTimestamp()
      };
      
      if (editingPromo) {
        await updateDoc(doc(db, "promotions", editingPromo.id), data);
        setPromotions(promotions.map(p => p.id === editingPromo.id ? { ...p, ...data } : p));
      } else {
        const newRef = await addDoc(collection(db, "promotions"), { ...data, createdAt: serverTimestamp() });
        setPromotions([...promotions, { id: newRef.id, ...data }]);
      }
      setIsModalOpen(false);
    } catch (error) {
      alert("Failed to save promotion");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promotion?")) return;
    try {
      await deleteDoc(doc(db, "promotions", id));
      setPromotions(promotions.filter(p => p.id !== id));
    } catch (error) {
      alert("Failed to delete promotion");
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Store Promotions</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Create and manage your loyalty and discount programs.</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Promotion
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {promotions.length === 0 ? (
           <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-950 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
             <Gift className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
             <p className="font-medium text-gray-900 dark:text-white">No promotions yet</p>
             <p className="text-sm text-gray-500 mt-1">Add your first promotional offer to attract customers.</p>
           </div>
        ) : (
          promotions.map(promo => (
            <div key={promo.id} className={`bg-white dark:bg-gray-900 border rounded-2xl p-6 ${promo.active ? 'border-orange-200 dark:border-orange-800 shadow-sm' : 'border-gray-200 dark:border-gray-800 opacity-75'}`}>
              <div className="flex justify-between items-start gap-4 mb-4">
                <div className="flex gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${promo.active ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400'}`}>
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{promo.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${promo.active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}`}>
                        {promo.active ? 'Active' : 'Inactive'}
                      </span>
                      <span className="text-xs text-gray-500 font-semibold">{promo.requiredStamps} Stamps Required</span>
                    </div>
                  </div>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{promo.description}</p>
              
              {(promo.startDate || promo.endDate) && (
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-4 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>
                    {promo.startDate ? new Date(promo.startDate).toLocaleString() : 'Anytime'} 
                    {' - '} 
                    {promo.endDate ? new Date(promo.endDate).toLocaleString() : 'No expiry'}
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <button onClick={() => handleOpenModal(promo)} className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded-lg transition-colors">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(promo.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-[500px] rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 my-auto shrink-0 overflow-hidden">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">{editingPromo ? 'Edit Promotion' : 'New Promotion'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 sm:p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Promotion Title</label>
                  <input 
                    type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="e.g. Buy 10 getting 1 Coffee Free!"
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Description / Terms</label>
                  <textarea 
                    rows={2} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})}
                    placeholder="Details about the promotion..."
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 resize-none" 
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-900 dark:text-gray-200">Stamps Required for Reward</label>
                  <input 
                    type="number" required min="1" max="20" value={formData.requiredStamps} onChange={e => setFormData({...formData, requiredStamps: parseInt(e.target.value) || 10})}
                    className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
                  />
                </div>

                <div className="space-y-2">
                   <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2">
                     <Calendar className="w-4 h-4 text-gray-500" /> Duration (Optional)
                   </label>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1">
                       <label className="text-xs text-gray-500">Start Date & Time</label>
                       <input 
                         type="datetime-local" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})}
                         className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" 
                       />
                     </div>
                     <div className="space-y-1">
                       <label className="text-xs text-gray-500">End Date & Time</label>
                       <input 
                         type="datetime-local" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})}
                         className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none" 
                       />
                     </div>
                   </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input type="checkbox" id="active" checked={formData.active} onChange={e => setFormData({...formData, active: e.target.checked})} className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                  <label htmlFor="active" className="text-sm font-medium text-gray-700 dark:text-gray-300">Run this promotion immediately</label>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
                 <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                   Cancel
                 </button>
                 <button type="submit" disabled={saving} className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2.5 rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50">
                   {saving ? 'Saving...' : 'Save Promotion'}
                 </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
