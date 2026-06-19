import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, addDoc, serverTimestamp, deleteDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { BadgeCheck, Plus, Shield, UserCircle, X, Mail, Key, Trash2 } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";

export default function StoreOwnerStaff({ store }: { store: any }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: ""
  });

  useEffect(() => {
    if (!store?.id) return;
    const fetchStaff = async () => {
      try {
        const q = query(collection(db, "users"), where("storeId", "==", store.id), where("role", "==", "staff"));
        const snap = await getDocs(q);
        setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (error) {
        console.error("Failed to fetch staff", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStaff();
  }, [store]);

  const handleOpenModal = () => {
    setFormData({ name: "", email: "", password: "" });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // In a real application, you would create the user in Supabase Auth via a backend function.
      // For this preview, we create a document in the users collection to simulate the staff account allocation.
      const newStaffRef = await addDoc(collection(db, "users"), {
        storeId: store.id,
        role: "staff",
        name: formData.name,
        email: formData.email,
        createdAt: serverTimestamp()
      });
      
      setStaff([...staff, { 
        id: newStaffRef.id, 
        storeId: store.id,
        role: "staff",
        name: formData.name,
        email: formData.email
      }]);
      setIsModalOpen(false);
    } catch (error) {
      alert("Failed to add staff member.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this staff member? They will lose access to scanning customers immediately.")) return;
    try {
      await deleteDoc(doc(db, "users", id));
      setStaff(staff.filter(s => s.id !== id));
    } catch (error) {
      alert("Failed to remove staff member");
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Staff Management</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">Add staff accounts so they can scan customer loyalty cards.</p>
        </div>
        <button 
          onClick={handleOpenModal}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Staff
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {staff.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-gray-950 rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <BadgeCheck className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">No staff accounts found</p>
            <p className="text-sm text-gray-500 mt-1">Add staff to allow them to process rewards in your store.</p>
          </div>
        ) : (
          staff.map(member => (
            <div key={member.id} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 flex flex-col justify-between h-full shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-start gap-4 mb-4">
                 <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                    <span className="font-bold text-blue-600 dark:text-blue-400 text-lg uppercase">{member.name ? member.name.charAt(0) : 'S'}</span>
                 </div>
                 <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">{member.name || 'Unnamed Staff'}</h3>
                    <p className="text-sm text-gray-500 truncate mb-2">{member.email}</p>
                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                       <Shield className="w-3 h-3" /> Scanner Ready
                    </span>
                 </div>
               </div>
               <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                 <button onClick={() => handleDelete(member.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors" title="Remove Access">
                   <Trash2 className="w-4 h-4" />
                 </button>
               </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-[2rem] shadow-xl relative border border-gray-100 dark:border-gray-800 overflow-hidden my-auto shrink-0">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Add Staff Member</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-4">
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><UserCircle className="w-4 h-4 text-gray-400" /> Full Name</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. John Doe" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email Address</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="staff@store.com" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Key className="w-4 h-4 text-gray-400" /> Temporary Password</label>
                <input required type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm" placeholder="Randomly generated or custom" />
                <p className="text-xs text-gray-500 mt-1">Provide this password to your staff member so they can login. They can change it later.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add Staff Access'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
