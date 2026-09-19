import React, { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { Activity, ArrowLeft, BadgeCheck, Calendar, Gift, Mail, Plus, Shield, Star, Trash2, TrendingUp, UserCircle, Users, X, Key } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { formatPhilippineDate, formatPhilippineDateTime } from "../../lib/dateTime";
import { validateStrongPassword } from "../../lib/passwordStrength";
import { Pagination } from "../../components/Pagination";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import { formatCustomerCode } from "../../lib/customerId";
import { CategorySearchInput } from "../../components/CategorySearchInput";
import { useToast } from "../../components/ToastProvider";

const STAFF_PER_PAGE = 9;
const SCAN_LOGS_PER_PAGE = 10;

const toDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value: any) => {
  return formatPhilippineDate(value);
};

const formatDateTime = (value: any) => {
  return formatPhilippineDateTime(value);
};

const getAvatarUrl = (member: any) => member?.avatarUrl || member?.photoURL || member?.profilePic || "";

const getInitial = (name?: string) => String(name || "S").trim().charAt(0).toUpperCase() || "S";

const getDayKey = (value: any) => {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : "";
};

const getTopEntry = (entries: [string, number][]) =>
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;

export default function StoreOwnerStaff({ store }: { store: any }) {
  const toast = useToast();
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [scanLogs, setScanLogs] = useState<any[]>([]);
  const [promotionsById, setPromotionsById] = useState<Record<string, any>>({});
  const [customersById, setCustomersById] = useState<Record<string, any>>({});
  const [staffToRemove, setStaffToRemove] = useState<any>(null);
  const [isRemovingStaff, setIsRemovingStaff] = useState(false);
  const [staffPage, setStaffPage] = useState(1);
  const [scanPage, setScanPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    requirePasswordChange: true,
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

  const filteredStaff = useMemo(() => {
    const terms = searchQuery.toLocaleLowerCase().split(",").map((term) => term.trim()).filter(Boolean);
    if (!terms.length) return staff;
    return staff.filter((member) => {
      const passwordStatus = member.requirePasswordChange ? "password change required" : "password updated";
      const searchable = [
        member.name,
        member.email,
        member.role,
        "scanner ready",
        passwordStatus,
      ].join(" ").toLocaleLowerCase();
      return terms.every((term) => {
        if (term === "scanner ready") return true;
        if (["password change required", "password updated"].includes(term)) return passwordStatus === term;
        return searchable.includes(term);
      });
    });
  }, [searchQuery, staff]);
  const staffTotalPages = Math.max(1, Math.ceil(filteredStaff.length / STAFF_PER_PAGE));
  const paginatedStaff = filteredStaff.slice((staffPage - 1) * STAFF_PER_PAGE, staffPage * STAFF_PER_PAGE);
  const scanTotalPages = Math.max(1, Math.ceil(scanLogs.length / SCAN_LOGS_PER_PAGE));
  const paginatedScanLogs = scanLogs.slice((scanPage - 1) * SCAN_LOGS_PER_PAGE, scanPage * SCAN_LOGS_PER_PAGE);
  const staffLimit = Math.trunc(Number(store?.subscriptionDependencies?.staffLimit || 0));
  const hasReachedStaffLimit = staffLimit > 0 && staff.length >= staffLimit;

  useEffect(() => {
    setStaffPage((page) => Math.min(page, staffTotalPages));
  }, [staffTotalPages]);

  useEffect(() => {
    setStaffPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setScanPage(1);
  }, [selectedStaff?.id]);

  useEffect(() => {
    setScanPage((page) => Math.min(page, scanTotalPages));
  }, [scanTotalPages]);

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
    if (hasReachedStaffLimit) {
      toast.info(`Your current subscription allows up to ${staffLimit} staff account${staffLimit === 1 ? "" : "s"}.`);
      return;
    }
    setFormData({ name: "", email: "", password: "", requirePasswordChange: true });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStrongPassword(formData.password, { name: formData.name, email: formData.email }).valid) {
      toast.info("Use a strong password that meets every requirement.");
      return;
    }
    if (hasReachedStaffLimit) {
      toast.info(`Your current subscription allows up to ${staffLimit} staff account${staffLimit === 1 ? "" : "s"}.`);
      return;
    }
    setSaving(true);
    const progressToastId = toast.progress("Creating the staff account…", { title: "Adding staff" });
    try {
      const result = await invokeAdminBackend<{
        user: any;
        notification?: { sent: boolean; error?: string };
      }>({
        action: "create_account",
        role: "staff",
        storeId: store.id,
        name: formData.name,
        email: formData.email,
        password: formData.password,
        forcePasswordReset: formData.requirePasswordChange,
      });
      
      setStaff([...staff, { 
        ...result.user,
      }]);
      setIsModalOpen(false);
      if (result.notification && !result.notification.sent) {
        toast.update(progressToastId, `The staff account was created, but the welcome email could not be sent: ${result.notification.error || "Email service unavailable."}`, "error", { title: "Email delivery failed" });
      } else {
        toast.update(progressToastId, "Staff account created. The welcome email has been sent.", "success", { title: "Staff added" });
      }
    } catch (error) {
      toast.update(progressToastId, "The staff member could not be added.", "error", { error, title: "Staff creation failed" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!staffToRemove) return;
    setIsRemovingStaff(true);
    const progressToastId = toast.progress("Removing the staff account…", { title: "Removing staff" });
    try {
      await invokeAdminBackend<{ deleted: boolean }>({ action: "delete_user", userId: staffToRemove.id });
      setStaff((current) => current.filter((member) => member.id !== staffToRemove.id));
      setStaffToRemove(null);
      toast.update(progressToastId, "The staff account was removed.", "success", { title: "Staff removed" });
    } catch (error) {
      toast.update(progressToastId, "The staff member could not be removed.", "error", { error, title: "Removal failed" });
    } finally {
      setIsRemovingStaff(false);
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
    const avatarUrl = getAvatarUrl(selectedStaff);
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const scansToday = scanLogs.filter((log) => getDayKey(log.timestamp) === getDayKey(new Date())).length;
    const scans7Days = scanLogs.filter((log) => {
      const date = toDate(log.timestamp);
      return date ? now - date.getTime() <= 7 * dayMs : false;
    }).length;
    const scans30Days = scanLogs.filter((log) => {
      const date = toDate(log.timestamp);
      return date ? now - date.getTime() <= 30 * dayMs : false;
    }).length;
    const promoScans = scanLogs.filter((log) => Boolean(log.promotionId)).length;
    const generalScans = totalScans - promoScans;
    const averagePoints = totalScans ? totalPoints / totalScans : 0;
    const customerRepeatRate = totalScans ? Math.round(((totalScans - uniqueCustomers) / totalScans) * 100) : 0;
    const promotionCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    scanLogs.forEach((log) => {
      if (log.promotionId) {
        const label = promotionsById[log.promotionId]?.title || log.promotionTitle || "Promotion scan";
        promotionCounts.set(label, (promotionCounts.get(label) || 0) + 1);
      }
      const dayKey = getDayKey(log.timestamp);
      if (dayKey) dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1);
    });
    const topPromotion = getTopEntry([...promotionCounts.entries()]);
    const mostActiveDay = getTopEntry([...dayCounts.entries()]);

    return (
      <div className="space-y-6 pb-20">
        <button
          type="button"
          onClick={() => setSelectedStaff(null)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row gap-6 shadow-sm">
          <div className="flex flex-1 items-center gap-5 min-w-0">
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center shrink-0 border-4 border-gray-100 dark:border-white/10">
              {avatarUrl ? (
                <img src={getDisplayImageUrl(avatarUrl)} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-[#1b1b1b] dark:text-white uppercase">
                  {getInitial(selectedStaff.name)}
                </span>
              )}
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
                <TrendingUp className="w-5 h-5 text-[#1b1b1b] dark:text-white" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-widest">Performance</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Today", value: scansToday },
                  { label: "7 days", value: scans7Days },
                  { label: "30 days", value: scans30Days },
                  { label: "Avg points", value: averagePoints ? averagePoints.toFixed(1) : "0.0" },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl bg-gray-50 p-3 dark:bg-gray-800/60">
                    <p className="text-xl font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : metric.value}</p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{metric.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Promo vs General</p>
                <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : `${promoScans}/${generalScans}`}</p>
                <p className="mt-1 text-xs text-gray-500">Promotion and general scans</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Repeat Load</p>
                <p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : `${customerRepeatRate}%`}</p>
                <p className="mt-1 text-xs text-gray-500">Scans beyond unique customers</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Top Promotion</p>
                <p className="mt-2 truncate text-base font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : topPromotion?.[0] || "None yet"}</p>
                <p className="mt-1 text-xs text-gray-500">{topPromotion ? `${topPromotion[1]} scan${topPromotion[1] === 1 ? "" : "s"}` : "No promotion scans"}</p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Most Active Day</p>
                <p className="mt-2 text-base font-black text-gray-900 dark:text-white">{analyticsLoading ? "-" : mostActiveDay ? formatDate(mostActiveDay[0]) : "None yet"}</p>
                <p className="mt-1 text-xs text-gray-500">{mostActiveDay ? `${mostActiveDay[1]} scan${mostActiveDay[1] === 1 ? "" : "s"}` : "No scan history"}</p>
              </div>
            </div>

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
              <>
                <ScrollableRegion label={`${selectedStaff.name || "Staff"} scan history`} className="space-y-3 pr-1">
                {paginatedScanLogs.map((log) => {
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
                          <p className="mt-1 font-mono text-[11px] text-gray-400 truncate" title={log.customerId}>
                            {formatCustomerCode(log.customerId)}
                          </p>
                        )}
                        {log.posReferenceNumber && (
                          <p className="mt-1 break-all font-mono text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                            POS ref: {log.posReferenceNumber}
                          </p>
                        )}
                      </div>
                      <div className="inline-flex items-center gap-1.5 self-start rounded-xl border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm font-black text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white sm:self-center">
                        <Star className="w-4 h-4 fill-current" />
                        +{Number(log.points || 0)}
                      </div>
                    </div>
                  );
                })}
                </ScrollableRegion>
                <Pagination
                  page={scanPage}
                  pageSize={SCAN_LOGS_PER_PAGE}
                  totalItems={scanLogs.length}
                  itemLabel="scans"
                  onPageChange={setScanPage}
                />
              </>
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
          disabled={hasReachedStaffLimit}
          title={hasReachedStaffLimit ? `Staff limit reached for this subscription (${staffLimit}).` : "Add staff"}
          className="flex items-center gap-2 bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-4 py-2 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors text-sm shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>

      <CategorySearchInput
        value={searchQuery}
        onChange={setSearchQuery}
        categories={["Scanner Ready", "Password Change Required", "Password Updated"]}
        placeholder="Search staff or filter by account status..."
        ariaLabel="Search and filter staff management"
        suggestionLabel="staff filter"
        collapsibleFilters
        resultsId="staff-management-results"
        className="w-full rounded-2xl border border-gray-200 bg-white py-3.5 pl-12 pr-12 text-sm text-gray-900 shadow-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-500 dark:focus:border-gray-500"
      />

      <ScrollableRegion label="Staff accounts" id="staff-management-results" className="scroll-mt-6 grid gap-4 pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {filteredStaff.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-gray-50 dark:bg-[#1b1b1b] rounded-3xl border border-dashed border-gray-200 dark:border-gray-800">
            <BadgeCheck className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
            <p className="font-medium text-gray-900 dark:text-white">{staff.length ? "No staff match your filters" : "No staff accounts found"}</p>
            <p className="text-sm text-gray-500 mt-1">{staff.length ? "Try another search or clear the current filters." : "Add staff to allow them to process rewards in your store."}</p>
          </div>
        ) : (
          paginatedStaff.map(member => (
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
                    {getAvatarUrl(member) ? (
                      <img src={getDisplayImageUrl(getAvatarUrl(member))} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span className="font-bold text-[#1b1b1b] dark:text-white text-lg uppercase">{getInitial(member.name)}</span>
                    )}
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
                   Analytics
                 </span>
                 <button
                   type="button"
                   onKeyDown={(event) => event.stopPropagation()}
                   onClick={(event) => {
                     event.stopPropagation();
                     setStaffToRemove(member);
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
      </ScrollableRegion>
      <Pagination
        page={staffPage}
        pageSize={STAFF_PER_PAGE}
        totalItems={filteredStaff.length}
        itemLabel="staff"
        onPageChange={setStaffPage}
      />

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
                <TemporaryPasswordField
                  value={formData.password}
                  onChange={(password) => setFormData({ ...formData, password })}
                  name={formData.name}
                  email={formData.email}
                />
                <p className="text-xs text-gray-500 mt-1">Generate a temporary password or enter a custom strong password.</p>
              </div>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <input type="checkbox" checked={formData.requirePasswordChange} onChange={(event) => setFormData({ ...formData, requirePasswordChange: event.target.checked })} className="mt-0.5 h-4 w-4 rounded" />
                <span>
                  <span className="block text-xs font-semibold text-gray-900 dark:text-white">Require password change on first login</span>
                  <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">The staff member must create a private password before opening their dashboard.</span>
                </span>
              </label>

              <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-gray-100 dark:border-gray-800">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving || !validateStrongPassword(formData.password, { name: formData.name, email: formData.email }).valid} aria-label="Add staff access" className="bg-gray-900 text-white dark:bg-white dark:text-gray-900 px-6 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50">
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={Boolean(staffToRemove)}
        title="Remove staff access?"
        description={`${staffToRemove?.name || staffToRemove?.email || "This staff member"} will immediately lose access to customer scanning and the store workspace.`}
        confirmLabel="Remove"
        isLoading={isRemovingStaff}
        onClose={() => setStaffToRemove(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
