import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteField, doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { AlertTriangle, ArrowLeft, Building2, Check, Edit, Key, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";

import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { StoreLocationPicker } from "../../components/StoreLocationPicker";
import { getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatBillingDate,
  formatMoney,
  formatPaymentSchedule,
  formatPredictedPaymentDate,
  getSubscriptionOwedAmount,
  getNextPaymentDate,
  getSubscriptionDependencies,
  PAYMENT_SCHEDULE_OPTIONS,
  predictPaymentDates,
  resolveStoreBilling,
  toDateInputValue,
} from "../../lib/subscriptionBilling";
import { TimeInput } from "../../components/TimeInput";
import { formatPhilippineDateTime, formatStoreHours, formatTime12Hour } from "../../lib/dateTime";
import { Pagination } from "../../components/Pagination";

const ACTIVITY_LOGS_PER_PAGE = 8;

export default function AdminStoreDetail({
  storeId,
  onBack,
  onDeleted,
}: {
  storeId: string;
  onBack: () => void;
  onDeleted?: (deletedStoreId: string) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [store, setStore] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [branchRequests, setBranchRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Analytics State
  const requestedTab = searchParams.get("detailTab");
  const activeTab: 'overview' | 'branches' | 'accounts' | 'analytics' =
    requestedTab === 'branches' || requestedTab === 'accounts' || requestedTab === 'analytics' ? requestedTab : 'overview';
  const setActiveTab = (tab: 'overview' | 'branches' | 'accounts' | 'analytics') => {
    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'overview') nextParams.delete("detailTab");
    else nextParams.set("detailTab", tab);
    setSearchParams(nextParams);
  };
  const [analytics, setAnalytics] = useState({
    customers: 0,
    promotions: 0,
    claims: 0
  });
  const [reviews, setReviews] = useState<any[]>([]);
  const [activityPage, setActivityPage] = useState(1);

  // Edit store state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [branchLimit, setBranchLimit] = useState(1);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchLatitude, setNewBranchLatitude] = useState(7.4478);
  const [newBranchLongitude, setNewBranchLongitude] = useState(125.8078);
  const [newBranchLocationSelected, setNewBranchLocationSelected] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNameConfirmation, setDeleteNameConfirmation] = useState("");
  const [deleteWordConfirmation, setDeleteWordConfirmation] = useState("");
  const predictedPaymentDates = store
    ? predictPaymentDates(store.paymentSchedule, store.subscriptionStart, store.subscriptionEnd, 6)
    : [];
  
  // Password reset state
  const [resetModalUser, setResetModalUser] = useState<any>(null);
  const [newPasswordType, setNewPasswordType] = useState<'default' | 'random' | 'custom'>('default');
  const [customPassword, setCustomPassword] = useState('');
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const deleteNameMatches = String(store?.name || "").trim() !== "" && deleteNameConfirmation.trim() === String(store?.name || "").trim();
  const deleteWordMatches = deleteWordConfirmation.trim() === "DELETE";
  const canConfirmDelete = deleteNameMatches && deleteWordMatches && !isDeleting;
  const activityRows = store
    ? [
        {
          id: "store-created",
          date: formatPhilippineDateTime(store.createdAt),
          event: "Store Profile Created",
          actor: "System",
        },
        ...staff.map((staffMember) => ({
          id: `staff-${staffMember.id}`,
          date: "Unknown",
          event: "Staff Account Registered",
          actor: `${staffMember.name} (${staffMember.email})`,
        })),
        ...(analytics.promotions > 0
          ? [{
              id: "promotions-published",
              date: "Multiple",
              event: `${analytics.promotions} Active Promotions Published`,
              actor: "Store Owner",
            }]
          : []),
        ...(analytics.claims > 0
          ? [{
              id: "claims-processed",
              date: "Multiple",
              event: `${analytics.claims} Customer Claim(s) Processed`,
              actor: "Staff",
            }]
          : []),
      ]
    : [];
  const activityTotalPages = Math.max(1, Math.ceil(activityRows.length / ACTIVITY_LOGS_PER_PAGE));
  const paginatedActivityRows = activityRows.slice((activityPage - 1) * ACTIVITY_LOGS_PER_PAGE, activityPage * ACTIVITY_LOGS_PER_PAGE);

  useEffect(() => {
    async function fetchDetails() {
      setLoading(true);
      setIsEditing(false);
      setPendingLogo(null);
      setStaff([]);
      setBranches([]);
      setBranchRequests([]);
      setReviews([]);
      try {
        const storeDoc = await getDoc(doc(db, "stores", storeId));
        if (storeDoc.exists()) {
          const storeData = storeDoc.data();
          const subDoc = await getDoc(doc(db, "settings", "subscriptions"));
          const loadedPlans = subDoc.exists() && subDoc.data().plans
            ? subDoc.data().plans
            : DEFAULT_SUBSCRIPTION_PLANS;
          const subscriptionLevel = storeData.subscriptionLevel || loadedPlans[0]?.name || 'Standard';
          const billing = resolveStoreBilling({ ...storeData, subscriptionLevel }, loadedPlans);
          const owedAmount = billing.amountDue;
          const normalizedStoreData = {
            ...storeData,
            subscriptionLevel,
            owedAmount,
            pendingOwedAmount: billing.pendingAmount,
            pendingOwedAmountEffectiveAt: billing.pendingAmount ? billing.nextPaymentDate : null,
          };

          if (billing.shouldPersistAppliedAmount) {
            await updateDoc(doc(db, "stores", storeId), {
              owedAmount,
              pendingOwedAmount: deleteField(),
              pendingOwedAmountEffectiveAt: deleteField(),
              updatedAt: serverTimestamp(),
            });
          }

          setPlans(loadedPlans);
          setStore({ id: storeDoc.id, ...normalizedStoreData });
          setEditData({
            name: storeData.name || '',
            subscriptionLevel,
            owedAmount,
            address: String(storeData.address || ""),
            contact: String(storeData.contact || ""),
            website: String(storeData.website || ""),
            description: String(storeData.description || ""),
            logoUrl: String(storeData.logoUrl || ""),
            category: String(storeData.category || ""),
            openingTime: String(storeData.openingTime || ""),
            closingTime: String(storeData.closingTime || ""),
            subscriptionStart: toDateInputValue(storeData.subscriptionStart),
            subscriptionEnd: toDateInputValue(storeData.subscriptionEnd),
            paymentSchedule: storeData.paymentSchedule || "",
            status: storeData.status || 'active',
          });

          // Fetch owner
          if (storeData.ownerId) {
            const ownerDoc = await getDoc(doc(db, "users", storeData.ownerId));
            if (ownerDoc.exists()) {
              const ownerData = ownerDoc.data();
              setOwner({ id: ownerDoc.id, ...ownerData });
              setBranchLimit(Math.max(1, Number(ownerData.branchLimit || 1)));
            }
            const branchSnap = await getDocs(query(collection(db, "stores"), where("ownerId", "==", storeData.ownerId)));
            setBranches(branchSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            const branchRequestSnap = await getDocs(query(collection(db, "branch_requests"), where("ownerId", "==", storeData.ownerId)));
            setBranchRequests(branchRequestSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          }

          // Fetch staff
          const staffQuery = query(collection(db, "users"), where("storeId", "==", storeId), where("role", "==", "staff"));
          const staffSnap = await getDocs(staffQuery);
          setStaff(staffSnap.docs.map(d => ({ id: d.id, ...d.data() })));

          // Fetch Analytics (Mocked up via actual queries)
          const customersQuery = query(collection(db, "cards"), where("storeId", "==", storeId));
          const customersSnap = await getDocs(customersQuery);
          const uniqueCustomerCount = new Set(
            customersSnap.docs.map((customerCard) => customerCard.data().customerId).filter(Boolean),
          ).size;
          
          const promosQuery = query(collection(db, "promotions"), where("storeId", "==", storeId));
          const promosSnap = await getDocs(promosQuery);

          const claimsQuery = query(collection(db, "promotions_scanned"), where("storeId", "==", storeId));
          const claimsSnap = await getDocs(claimsQuery);

          // Fetch reviews for this store
          const reviewsQuery = query(collection(db, "store_reviews"), where("storeId", "==", storeId));
          const reviewsSnap = await getDocs(reviewsQuery);
          const loadedReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          setAnalytics({
            customers: uniqueCustomerCount,
            promotions: promosSnap.size,
            claims: claimsSnap.size
          });
          setReviews(loadedReviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));

        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchDetails();
  }, [storeId]);

  useEffect(() => {
    setActivityPage(1);
  }, [storeId]);

  useEffect(() => {
    setActivityPage((page) => Math.min(page, activityTotalPages));
  }, [activityTotalPages]);

  const handleUpdateStore = async () => {
    try {
      const logoUrl = pendingLogo
        ? await uploadImageFileToDriveSecure(pendingLogo, {
            owner: store.ownerId || store.name,
            purpose: "admin-store-logo",
          })
        : editData.logoUrl;
      const dependencies = getSubscriptionDependencies(plans, editData.subscriptionLevel);
      const currentAmount = Number(store.owedAmount || 0);
      const nextPlanAmount = getSubscriptionOwedAmount(plans, editData.subscriptionLevel, currentAmount);
      const nextPaymentDate = getNextPaymentDate(
        editData.paymentSchedule,
        dateInputToDate(editData.subscriptionStart),
        dateInputToDate(editData.subscriptionEnd),
      );
      const priceChangesNextCycle = nextPlanAmount !== currentAmount && Boolean(nextPaymentDate);
      const nextData = {
        ...editData,
        logoUrl,
        address: editData.address || "",
        contact: editData.contact || "",
        website: editData.website || "",
        description: editData.description || "",
        hours: formatStoreHours(editData.openingTime, editData.closingTime),
        openingHours: formatStoreHours(editData.openingTime, editData.closingTime),
        owedAmount: priceChangesNextCycle ? currentAmount : nextPlanAmount,
        subscriptionDependencies: dependencies,
        pendingOwedAmount: priceChangesNextCycle ? nextPlanAmount : deleteField(),
        pendingOwedAmountEffectiveAt: priceChangesNextCycle ? nextPaymentDate : deleteField(),
        subscriptionStart: dateInputToDate(editData.subscriptionStart),
        subscriptionEnd: dateInputToDate(editData.subscriptionEnd),
        paymentSchedule: editData.paymentSchedule,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "stores", storeId), nextData);
      if (owner) {
        const nextBranchLimit = dependencies.branchLimit > 0 ? dependencies.branchLimit : 100;
        await updateDoc(doc(db, "users", owner.id), {
          branchLimit: nextBranchLimit,
          updatedAt: serverTimestamp(),
        });
        setBranchLimit(nextBranchLimit);
        setOwner({ ...owner, branchLimit: nextBranchLimit });
      }
      setStore({
        ...store,
        ...nextData,
        pendingOwedAmount: priceChangesNextCycle ? nextPlanAmount : null,
        pendingOwedAmountEffectiveAt: priceChangesNextCycle ? nextPaymentDate : null,
      });
      setEditData({
        ...editData,
        owedAmount: nextData.owedAmount,
      });
      setIsEditing(false);
      setPendingLogo(null);
    } catch (error) {
      console.error(error);
      alert("Failed to update store");
    }
  };

  const handleSubscriptionLevelChange = (level: string) => {
    setEditData({
      ...editData,
      subscriptionLevel: level,
      owedAmount: getSubscriptionOwedAmount(plans, level, Number(store?.owedAmount || editData.owedAmount || 0)),
    });
  };

  const handleCancelEdit = () => {
    setEditData({
      name: store.name || '',
      subscriptionLevel: store.subscriptionLevel || plans[0]?.name || 'Standard',
      owedAmount: Number(store.owedAmount || 0),
      address: String(store.address || ""),
      contact: String(store.contact || ""),
      website: String(store.website || ""),
      description: String(store.description || ""),
      logoUrl: String(store.logoUrl || ""),
      category: String(store.category || ""),
      openingTime: String(store.openingTime || ""),
      closingTime: String(store.closingTime || ""),
      subscriptionStart: toDateInputValue(store.subscriptionStart),
      subscriptionEnd: toDateInputValue(store.subscriptionEnd),
      paymentSchedule: store.paymentSchedule || "",
      status: store.status || 'active',
    });
    setIsEditing(false);
    setPendingLogo(null);
  };

  const handleSaveBranchLimit = async () => {
    if (!owner) return;
    setBranchBusy(true);
    setBranchError("");
    try {
      const result = await invokeAdminBackend<{ branchLimit: number }>({
        action: "set_branch_limit",
        ownerId: owner.id,
        branchLimit,
      });
      setBranchLimit(result.branchLimit);
      setOwner({ ...owner, branchLimit: result.branchLimit });
    } catch (error) {
      setBranchError((error as Error).message);
    } finally {
      setBranchBusy(false);
    }
  };

  const openBranchDashboard = (branchId: string) => {
    if (branchId === storeId) {
      setActiveTab("overview");
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("store", branchId);
    nextParams.delete("detailTab");
    setSearchParams(nextParams);
  };

  const handleAddBranch = async () => {
    if (!owner || !newBranchName.trim() || !newBranchAddress.trim() || !newBranchLocationSelected) return;
    setBranchBusy(true);
    setBranchError("");
    try {
      const result = await invokeAdminBackend<{ store: any }>({
        action: "create_branch",
        ownerId: owner.id,
        store: {
          branchName: newBranchName,
          address: newBranchAddress,
          location: newBranchAddress,
          lat: newBranchLatitude,
          lng: newBranchLongitude,
          status: "active",
          logoUrl: store.logoUrl || "",
          category: store.category || "",
          subscriptionLevel: store.subscriptionLevel || "",
          subscriptionStart: store.subscriptionStart || null,
          subscriptionEnd: store.subscriptionEnd || null,
          paymentSchedule: store.paymentSchedule || "",
        },
      });
      setBranches([...branches, result.store]);
      setNewBranchName("");
      setNewBranchAddress("");
      setNewBranchLocationSelected(false);
    } catch (error) {
      setBranchError((error as Error).message);
    } finally {
      setBranchBusy(false);
    }
  };

  const handleBranchRequestDecision = async (requestId: string, decision: "approved" | "denied") => {
    setBranchBusy(true);
    setBranchError("");
    try {
      const result = await invokeAdminBackend<{ request: any; store?: any }>({
        action: "decide_branch_request",
        requestId,
        decision,
      });
      setBranchRequests(branchRequests.map(request => request.id === requestId ? result.request : request));
      if (result.store) setBranches([...branches, result.store]);
    } catch (error) {
      setBranchError((error as Error).message);
    } finally {
      setBranchBusy(false);
    }
  };

  const handleDeleteStore = async () => {
    if (!store) return;

    const expectedStoreName = String(store.name || "").trim();
    if (deleteNameConfirmation.trim() !== expectedStoreName) {
      setDeleteError(`Type the exact store name: ${expectedStoreName}`);
      return;
    }

    if (deleteWordConfirmation.trim() !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      await invokeAdminBackend<{ deleted: boolean }>({ action: "delete_store", storeId });
      onDeleted?.(storeId);
      setShowDeleteModal(false);
      onBack();
    } catch (error) {
      console.error(error);
      setDeleteError("The store could not be deleted. Please try again.");
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    try {
      let tempPassword = "Password123!";
      if (newPasswordType === 'random') tempPassword = Math.random().toString(36).slice(-8) + "!";
      if (newPasswordType === 'custom') tempPassword = customPassword;

      await invokeAdminBackend<{ updated: boolean }>({
        action: "reset_password",
        userId: resetModalUser.id,
        password: tempPassword,
        forcePasswordReset: requirePasswordChange,
      });
      alert(`Password has been reset for ${resetModalUser.email}.\nTemporary password: ${tempPassword}`);
      setResetModalUser(null);
    } catch (e) {
      console.error(e);
      alert("Failed to initiate password reset.");
    }
  };

  if (loading) {
    return <PageSkeleton variant="form" />;
  }

  if (!store) {
    return <div className="p-12 text-center text-gray-400">Store not found.</div>;
  }

  return (
    <div className="flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            <h3 className="font-bold text-gray-900 dark:text-white text-xl">{store.name} Dashboard</h3>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isEditing ? (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors">
                <Edit className="w-4 h-4" /> Edit
              </button>
            ) : (
              <>
                <button onClick={handleCancelEdit} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                  <X className="w-4 h-4" /> Cancel
                </button>
                <button onClick={handleUpdateStore} className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-green-600 hover:bg-green-700 transition-colors">
                  <Save className="w-4 h-4" /> Save
                </button>
              </>
            )}
            <button
              onClick={() => {
                setDeleteError("");
                setDeleteNameConfirmation("");
                setDeleteWordConfirmation("");
                setShowDeleteModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-red-700 bg-red-100 hover:bg-red-200 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete Store
            </button>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setActiveTab('overview')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'overview' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Overview</button>
          <button onClick={() => setActiveTab('branches')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'branches' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Branches</button>
          <button onClick={() => setActiveTab('accounts')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'accounts' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Accounts</button>
          <button onClick={() => setActiveTab('analytics')} className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Analytics & Logs</button>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Store Config</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Store Logo</label>
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
                      {(pendingLogo || editData.logoUrl) ? (
                        <img
                          src={pendingLogo ? URL.createObjectURL(pendingLogo) : getDisplayImageUrl(editData.logoUrl)}
                          alt={`${store.name} logo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-400"><Building2 className="h-6 w-6" /></div>
                      )}
                    </div>
                    {isEditing && (
                      <label className="cursor-pointer rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                        <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Change logo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={(event) => setPendingLogo(event.target.files?.[0] || null)} />
                      </label>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Store Name</label>
                  {isEditing ? (
                    <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-900 dark:text-white font-medium">{store.name}</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Status</label>
                  {isEditing ? (
                    <CustomDropdown
                      options={[
                        { label: "Active", value: "active" },
                        { label: "Suspended", value: "suspended" },
                        { label: "Banned", value: "banned" }
                      ]}
                      value={editData.status}
                      onChange={v => setEditData({...editData, status: v})}
                    />
                  ) : (
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold tracking-wider uppercase ${
                      store.status === 'active' ? 'bg-green-100 text-green-700' :
                      store.status === 'suspended' ? 'bg-gray-100 text-[#1b1b1b]' : 'bg-red-100 text-red-700'
                    }`}>
                      {store.status}
                    </span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                  {isEditing ? (
                    <textarea value={editData.description} onChange={e => setEditData({...editData, description: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" rows={3} />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{store.description || "No description provided."}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Category</label>
                  {isEditing ? (
                    <input type="text" value={editData.category} onChange={e => setEditData({...editData, category: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{store.category || "Not provided"}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Address</label>
                  {isEditing ? (
                    <input type="text" value={editData.address} onChange={e => setEditData({...editData, address: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{store.address || "Not provided"}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Contact</label>
                  {isEditing ? (
                    <input type="text" value={editData.contact} onChange={e => setEditData({...editData, contact: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{store.contact || "Not provided"}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Website</label>
                  {isEditing ? (
                    <input type="text" value={editData.website} onChange={e => setEditData({...editData, website: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">{store.website ? store.website.replace(/^https?:\/\//, '') : "Not provided"}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Opening Time</label>
                    {isEditing ? (
                      <TimeInput value={editData.openingTime} onChange={openingTime => setEditData({...editData, openingTime})} aria-label="Opening time (Philippine time)" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : <p className="text-sm text-gray-700 dark:text-gray-300">{store.openingTime ? `${formatTime12Hour(store.openingTime)} PHT` : "Not set"}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Closing Time</label>
                    {isEditing ? (
                      <TimeInput value={editData.closingTime} onChange={closingTime => setEditData({...editData, closingTime})} aria-label="Closing time (Philippine time)" className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : <p className="text-sm text-gray-700 dark:text-gray-300">{store.closingTime ? `${formatTime12Hour(store.closingTime)} PHT` : "Not set"}</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Subscription & Billing</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription Level</label>
                  {isEditing ? (
                    <CustomDropdown
                      options={plans.map(p => ({ label: p.name, value: p.name }))}
                      value={editData.subscriptionLevel}
                      onChange={handleSubscriptionLevelChange}
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white font-medium">{store.subscriptionLevel || 'Standard'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Owed Amount</label>
                  {isEditing ? (
                    <div className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white">
                      {formatMoney(editData.owedAmount)}
                    </div>
                  ) : (
                    <div>
                      <p className="text-red-600 font-medium">{formatMoney(Number(store.owedAmount || 0))}</p>
                      {Number.isFinite(Number(store.pendingOwedAmount)) && Number(store.pendingOwedAmount) !== Number(store.owedAmount || 0) && (
                        <p className="mt-1 text-xs text-gray-500">
                          {formatMoney(Number(store.pendingOwedAmount))} starts on {formatBillingDate(store.pendingOwedAmountEffectiveAt)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription Start</label>
                    {isEditing ? (
                      <input type="date" value={editData.subscriptionStart || ""} onChange={e => setEditData({...editData, subscriptionStart: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(store.subscriptionStart)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Subscription End</label>
                    {isEditing ? (
                      <input type="date" value={editData.subscriptionEnd || ""} onChange={e => setEditData({...editData, subscriptionEnd: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(store.subscriptionEnd)}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Payment Schedule</label>
                    {isEditing ? (
                      <CustomDropdown
                        options={PAYMENT_SCHEDULE_OPTIONS}
                        value={editData.paymentSchedule || ""}
                        onChange={(paymentSchedule) => setEditData({ ...editData, paymentSchedule })}
                        className="w-full"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatPaymentSchedule(store.paymentSchedule)}</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-3">
                    <h5 className="text-sm font-bold text-gray-900 dark:text-white">Predicted payment dates</h5>
                    <p className="mt-1 text-xs text-gray-500">Calculated from the saved payment schedule and subscription period.</p>
                  </div>
                  {predictedPaymentDates.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {predictedPaymentDates.map((date) => (
                        <div key={date.toISOString()} className="rounded-xl bg-gray-50 px-3 py-2 text-sm font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
                          {formatPredictedPaymentDate(date)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No upcoming dates within the subscription period.</p>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {activeTab === 'branches' && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Branch Management</h4>
                  <p className="mt-1 text-sm text-gray-500">{branches.length} of {branchLimit} branch slots used for this owner.</p>
                </div>
                <div className="flex items-end gap-2">
                  <label className="text-xs font-semibold text-gray-500">
                    Branch limit
                    <input type="number" min="1" max="100" value={branchLimit} onChange={e => setBranchLimit(Number(e.target.value))} className="mt-1 block w-24 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
                  </label>
                  <button type="button" disabled={branchBusy} onClick={handleSaveBranchLimit} className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-gray-900">Save limit</button>
                </div>
              </div>
              <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {branches.map(branch => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => openBranchDashboard(branch.id)}
                    className={`rounded-xl border bg-white p-3 text-left transition-colors hover:border-green-500 hover:bg-green-50 dark:bg-gray-900 dark:hover:border-green-500 dark:hover:bg-green-950/20 ${
                      branch.id === storeId ? "border-green-500 ring-2 ring-green-500/20" : "border-gray-200 dark:border-gray-700"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{branch.name}</span>
                      {branch.id === storeId && <span className="text-[10px] font-bold uppercase tracking-wider text-green-600">Current</span>}
                    </span>
                    <p className="mt-1 truncate text-xs text-gray-500">{branch.address || branch.location || "No address"}</p>
                    <p className="mt-2 text-xs font-medium text-green-600">{branch.id === storeId ? "View overview" : "Open dashboard"}</p>
                  </button>
                ))}
              </div>
              <div className="mb-6 border-t border-gray-200 pt-5 dark:border-gray-700">
                <h5 className="text-xs font-bold uppercase tracking-widest text-gray-500">Branch requests</h5>
                <div className="mt-3 space-y-3">
                  {branchRequests.filter(request => request.status === "pending").length === 0 ? (
                    <p className="text-sm text-gray-500">No pending branch requests.</p>
                  ) : branchRequests.filter(request => request.status === "pending").map(request => (
                    <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{request.branchName}</p>
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{request.address}</p>
                        <p className="mt-1 text-xs text-gray-500">Requested by {request.ownerName || owner?.name || "store owner"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={branchBusy || branches.length >= branchLimit} onClick={() => handleBranchRequestDecision(request.id, "approved")} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          <Check className="h-4 w-4" /> Confirm
                        </button>
                        <button type="button" disabled={branchBusy} onClick={() => handleBranchRequestDecision(request.id, "denied")} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                          <X className="h-4 w-4" /> Deny
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-semibold text-gray-500">
                    Branch label
                    <input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="e.g. Tagum" className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  </label>
                  <label className="space-y-1 text-xs font-semibold text-gray-500">
                    Branch address
                    <input value={newBranchAddress} onChange={e => setNewBranchAddress(e.target.value)} placeholder="Street, barangay, city" className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                  </label>
                </div>
                <div>
                  <p className="mb-2 text-xs text-gray-500">Click the map to drop the marker at the exact branch location.</p>
                  <StoreLocationPicker
                    latitude={newBranchLatitude}
                    longitude={newBranchLongitude}
                    onChange={(latitude, longitude) => {
                      setNewBranchLatitude(latitude);
                      setNewBranchLongitude(longitude);
                      setNewBranchLocationSelected(true);
                    }}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    {newBranchLocationSelected
                      ? `${newBranchLatitude.toFixed(6)}, ${newBranchLongitude.toFixed(6)}`
                      : "No map location selected yet."}
                  </p>
                </div>
                <button type="button" disabled={branchBusy || !newBranchName.trim() || !newBranchAddress.trim() || !newBranchLocationSelected || branches.length >= branchLimit} onClick={handleAddBranch} className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 sm:w-auto">
                  <Plus className="h-4 w-4" /> Add branch
                </button>
              </div>
              {branchError && <p className="mt-3 text-sm text-red-600">{branchError}</p>}
            </div>
          </div>
        )}

        {/* Account Management */}
        {activeTab === 'accounts' && (
          <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-4">Owner & Staff Accounts</h4>
              
              <div className="mb-6">
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Store Owner</h5>
                {owner ? (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div>
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{owner.name}</p>
                      <p className="text-xs text-gray-500">{owner.email}</p>
                    </div>
                    <button onClick={() => setResetModalUser(owner)} className="p-2 text-gray-500 hover:text-[#1b1b1b] bg-gray-50 dark:bg-gray-800 rounded-lg" title="Reset Password">
                      <Key className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No owner found.</p>
                )}
              </div>

              <div>
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Staff Accounts ({staff.length})</h5>
                {staff.length > 0 ? (
                  <div className="space-y-2">
                    {staff.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div>
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                        </div>
                        <button onClick={() => setResetModalUser(s)} className="p-2 text-gray-500 hover:text-[#1b1b1b] bg-gray-50 dark:bg-gray-800 rounded-lg" title="Reset Password">
                          <Key className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No staff accounts active.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Analytics & Logs Subpage */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Customers</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.customers}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Promotions</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.promotions}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Claims Scanned</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.claims}</p>
               </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">Reviews</p>
                <p className="text-4xl font-black text-gray-900 dark:text-white">{reviews.length}</p>
                <p className="text-sm text-gray-500 mt-1">{reviews.length ? `${(reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(1)} / 5` : "—"}</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
               <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-black/20">
                 <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">System Activity Log</h4>
               </div>
               <div className="p-0 overflow-x-auto">
                 <table className="w-full text-sm text-left whitespace-nowrap">
                   <thead className="bg-gray-100 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400">
                     <tr>
                       <th className="px-6 py-3 font-semibold">Date</th>
                       <th className="px-6 py-3 font-semibold">Event</th>
                       <th className="px-6 py-3 font-semibold">Actor</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                     {paginatedActivityRows.map((row) => (
                       <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                         <td className="px-6 py-3 font-mono text-xs">{row.date}</td>
                         <td className="px-6 py-3 font-medium">{row.event}</td>
                         <td className="px-6 py-3 text-gray-500">{row.actor}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
               <Pagination
                 page={activityPage}
                 pageSize={ACTIVITY_LOGS_PER_PAGE}
                 totalItems={activityRows.length}
                 itemLabel="events"
                 onPageChange={setActivityPage}
               />
            </div>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-store-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDeleting) setShowDeleteModal(false);
          }}
        >
          <div
            className="relative mx-4 w-full max-w-lg overflow-hidden rounded-4xl border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h3 id="delete-store-title" className="text-xl font-bold text-gray-900 dark:text-white">Delete {store.name}?</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    This permanently deletes the store and removes its owner and staff accounts. This action cannot be undone.
                  </p>
                </div>
              </div>
           
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Type the store name exactly
                  </label>
                  <input
                    type="text"
                    value={deleteNameConfirmation}
                    onChange={(event) => {
                      setDeleteNameConfirmation(event.target.value);
                      if (deleteError) setDeleteError("");
                    }}
                    disabled={isDeleting}
                    placeholder={store.name}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-red-700 dark:focus:ring-red-900/40"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Type DELETE to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteWordConfirmation}
                    onChange={(event) => {
                      setDeleteWordConfirmation(event.target.value);
                      if (deleteError) setDeleteError("");
                    }}
                    disabled={isDeleting}
                    placeholder="DELETE"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-red-700 dark:focus:ring-red-900/40"
                  />
                </div>
              </div>

              {deleteError && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {deleteError}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setShowDeleteModal(false)}
                  className="rounded-xl bg-gray-100 px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Keep Store
                </button>
                <button
                  type="button"
                  disabled={!canConfirmDelete}
                  onClick={handleDeleteStore}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isDeleting ? "Deleting..." : "Delete Store"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-4xl shadow-xl p-6 border border-gray-100 dark:border-gray-800">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Reset Password</h3>
            <p className="text-sm text-gray-600 mb-4">Resetting password for <strong>{resetModalUser.email}</strong></p>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Password Type</label>
                <CustomDropdown
                  value={newPasswordType}
                  onChange={(value) => setNewPasswordType(value as "default" | "random" | "custom")}
                  options={[
                    { label: "Default (Password123!)", value: "default" },
                    { label: "Randomize", value: "random" },
                    { label: "Set Custom", value: "custom" },
                  ]}
                />
              </div>

              {newPasswordType === 'custom' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Custom Password</label>
                  <input type="password" value={customPassword} onChange={e => setCustomPassword(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" placeholder="Enter new password" />
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer mt-4">
                <input type="checkbox" checked={requirePasswordChange} onChange={e => setRequirePasswordChange(e.target.checked)} className="rounded border-gray-300 text-[#1b1b1b] focus:ring-[#1b1b1b]" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Require change on next login</span>
              </label>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setResetModalUser(null)} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium py-2 px-4 rounded-xl hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleResetPassword} className="flex-1 bg-[#1b1b1b] text-white font-medium py-2 px-4 rounded-xl hover:bg-black transition-colors">Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
