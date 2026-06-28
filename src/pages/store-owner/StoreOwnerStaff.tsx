import React, { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { Activity, ArrowLeft, BadgeCheck, Calendar, Gift, Mail, Plus, Shield, Star, Trash2, TrendingUp, UserCircle, Users, X, Key } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
  const date = toDate(value);
  return date ? date.toLocaleDateString() : "Unknown";
};

const formatDateTime = (value: any) => {
  const date = toDate(value);
  return date ? date.toLocaleString() : "Unknown";
};

export default function StoreOwnerStaff({ store }: { store: any }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [scanLogs, setScanLogs] = useState<any[]>([]);
  const [promotionsById, setPromotionsById] = useState<Record<string, any>>({});
  const [customersById, setCustomersById] = useState<Record<string, any>>({});
  
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

  useEffect(() => {
    if (!selectedStaff?.id || !store?.id) return;

    const fetchAnalytics = async () => {
      setAnalyticsLoading(true);
      try {
        const q = query(
          collection(db, "promotions_scanned"),
          where("storeId", "==", store.id),
          where("staffId", "==", selectedStaff.id),
        );
        const snap = await getDocs(q);
        const logs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (toDate(b.timestamp)?.getTime() || 0) - (toDate(a.timestamp)?.getTime() || 0));

        const promotionIds = Array.from(new Set(logs.map(log => log.promotionId).filter(Boolean)));
        const customerIds = Array.from(new Set(logs.map(log => log.customerId).filter(Boolean)));

        const promotionEntries = await Promise.all(
          promotionIds.map(async (promotionId) => {
            const snap = await getDoc(doc(db, "promotions", String(promotionId)));
            return [promotionId, snap.exists() ? { id: snap.id, ...snap.data() } : null] as const;
          }),
        );

        const customerEntries = await Promise.all(
          customerIds.map(async (customerId) => {
            let customerSnap = await getDoc(doc(db, "users", String(customerId)));
            if (!customerSnap.exists()) {
              customerSnap = await getDoc(doc(db, "customers", String(customerId)));
            }
            return [customerId, customerSnap.exists() ? { id: customerSnap.id, ...customerSnap.data() } : null] as const;
          }),
        );

        setScanLogs(logs);
        setPromotionsById(Object.fromEntries(promotionEntries.filter(([, value]) => Boolean(value))));
        setCustomersById(Object.fromEntries(customerEntries.filter(([, value]) => Boolean(value))));
      } catch (error) {
        console.error("Failed to fetch staff analytics", error);
        setScanLogs([]);
        setPromotionsById({});
        setCustomersById({});
      } finally {
        setAnalyticsLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedStaff?.id, store?.id]);

  const handleOpenModal = () => {
    setFormData({ name: "", email: "", password: "" });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await invokeAdminBackend<{ user: any }>({
        action: "create_account",
        role: "staff",
        storeId: store.id,
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      
      setStaff([...staff, { 
        ...result.user,
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
      await invokeAdminBackend<{ deleted: boolean }>({ action: "delete_user", userId: id });
      setStaff(staff.filter(s => s.id !== id));
    } catch (error) {
      alert("Failed to remove staff member");
    }
  };

  if (loading) return <PageSkeleton variant="table" />;

  if (selectedStaff) {
    const totalScans = scanLogs.length;
    const totalPoints = scanLogs.reduce((sum, log) => sum + Number(log.points || 0), 0);
    const uniqueCustomers = new Set(scanLogs.map(log => log.customerId).filter(Boolean)).size;
    const uniquePromotions = new Set(scanLogs.map(log => log.promotionId).filter(Boolean)).size;
    const lastScan = scanLogs[0]?.timestamp;
    const createdAt = selectedStaff.createdAt || selectedStaff.created_at;

    return (
      <div className="space-y-6 pb-20">
        <button
          type="button"
          onClick={() => setSelectedStaff(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Staff Directory
        </button>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row gap-6 shadow-sm">
          <div className="flex flex-1 items-center gap-5 min-w-0">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0 border-4 border-gray-100 dark:border-white/10">
              <span className="text-3xl font-black text-[#1b1b1b] dark:text-white uppercase">
                {selectedStaff.name ? selectedStaff.name.charAt(0) : "S"}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white truncate">{selectedStaff.name || "Unnamed Staff"}</h2>
              <p className="text-gray-500 dark:text-gray-400 truncate">{selectedStaff.email || "No email provided"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full text-xs font-bold tracking-wide uppercase">
                  <Shield className="w-3 h-3" /> Scanner Ready
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-full text-xs font-bold tracking-wide uppercase">
                  <Calendar className="w-3 h-3" /> Added {formatDate(createdAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:w-[34rem]">
            {[
              { label: "Scans", value: totalScans, icon: Activity, color: "text-[#1b1b1b] dark:text-white" },
              { label: "Points", value: totalPoints, icon: Star, color: "text-[#1b1b1b] dark:text-white" },
              { label: "Customers", value: uniqueCustomers, icon: Users, color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Promos", value: uniquePromotions, icon: Gift, color: "text-violet-600 dark:text-violet-400" },
            ].map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <metric.icon className={`w-5 h-5 mb-3 ${metric.color}`} />
                <p className="text-2xl font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : metric.value}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{metric.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest mb-4">Staff Info</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Full Name</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedStaff.name || "Unnamed Staff"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Email Address</p>
                  <p className="font-semibold text-gray-900 dark:text-white break-words">{selectedStaff.email || "No email provided"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Staff ID</p>
                  <p className="font-mono text-xs font-semibold text-gray-900 dark:text-white break-all">{selectedStaff.id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">Last Scan</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{lastScan ? formatDateTime(lastScan) : "No scans yet"}</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-5 h-5 text-[#1b1b1b]" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Performance</h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {totalScans > 0
                  ? `${selectedStaff.name || "This staff member"} has processed ${totalScans} scan${totalScans === 1 ? "" : "s"} for this branch.`
                  : "No scan activity has been recorded for this staff member yet."}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Recent Scan Activity</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customer rewards credited by this staff account.</p>
              </div>
            </div>

            {analyticsLoading ? (
              <PageSkeleton variant="table" />
            ) : scanLogs.length === 0 ? (
              <div className="py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
                <Activity className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                <p className="font-medium text-gray-900 dark:text-white">No analytics yet</p>
                <p className="text-sm text-gray-500 mt-1">Scans will appear here after this staff member credits customers.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {scanLogs.slice(0, 20).map((log) => {
                  const promotion = log.promotionId ? promotionsById[log.promotionId] : null;
                  const customer = log.customerId ? customersById[log.customerId] : null;

                  return (
                    <div key={log.id} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white truncate">
                          {customer?.name || customer?.username || "Customer"} credited
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {promotion?.title || "General scan"} · {formatDateTime(log.timestamp)}
                        </p>
                        {log.customerId && (
                          <p className="mt-1 font-mono text-[11px] text-gray-400 truncate">{log.customerId}</p>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm font-black text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white sm:self-center">
                        <Star className="w-4 h-4 fill-current" />
                        +{Number(log.points || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

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
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <BadgeCheck className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">No staff accounts found</p>
            <p className="text-sm text-gray-500 mt-1">Add staff to allow them to process rewards in your store.</p>
          </div>
        ) : (
          staff.map(member => (
            <div
              key={member.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedStaff(member)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedStaff(member);
                }
              }}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 flex flex-col justify-between h-full shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-white/20 transition-all text-left group cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1b1b1b]/40"
            >
               <div className="flex items-start gap-4 mb-4">
                 <div className="w-12 h-12 bg-gray-100 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <span className="font-bold text-[#1b1b1b] dark:text-white text-lg uppercase">{member.name ? member.name.charAt(0) : 'S'}</span>
                 </div>
                 <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 dark:text-white text-lg truncate">{member.name || 'Unnamed Staff'}</h3>
                    <p className="text-sm text-gray-500 truncate mb-2">{member.email}</p>
                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest">
                       <Shield className="w-3 h-3" /> Scanner Ready
                    </span>
                 </div>
               </div>
               <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                 <span className="text-xs font-bold uppercase tracking-widest text-[#1b1b1b] dark:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                   View analytics
                 </span>
                 <button
                   type="button"
                   onKeyDown={(event) => event.stopPropagation()}
                   onClick={(event) => {
                     event.stopPropagation();
                     handleDelete(member.id);
                   }}
                   className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                   title="Remove Access"
                 >
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
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]" placeholder="e.g. John Doe" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> Email Address</label>
                <input required type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b]" placeholder="staff@store.com" />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-900 dark:text-gray-200 flex items-center gap-2"><Key className="w-4 h-4 text-gray-400" /> Temporary Password</label>
                <input required type="password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-[#1b1b1b] font-mono text-sm" placeholder="Randomly generated or custom" />
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
