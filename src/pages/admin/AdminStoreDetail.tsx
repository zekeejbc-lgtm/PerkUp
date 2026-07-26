import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { deleteField, doc, getDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { AlertTriangle, ArrowLeft, BadgeCheck, Ban, BellRing, Building2, Check, ChevronDown, Clock3, Edit, Key, Loader2, MessageSquare, Plus, RotateCcw, Save, Snowflake, Star, Trash2, Upload, X } from "lucide-react";

import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { StoreLocationPicker } from "../../components/StoreLocationPicker";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatBillingDate,
  formatMoney,
  formatPaymentSchedule,
  formatPredictedPaymentDate,
  getCurrentSubscriptionPaymentState,
  getSubscriptionOwedAmount,
  getNextPaymentDate,
  getSubscriptionBranchLimit,
  getSubscriptionDependencies,
  PAYMENT_SCHEDULE_OPTIONS,
  predictPaymentDates,
  resolveStoreBilling,
  toDateInputValue,
} from "../../lib/subscriptionBilling";
import { TimeInput } from "../../components/TimeInput";
import { formatPhilippineDateTime, formatStoreHours, formatTime12Hour } from "../../lib/dateTime";
import { Pagination } from "../../components/Pagination";
import { sanitizePasswordInput } from "../../lib/passwordStrength";
import { DEFAULT_POLICY_SUSPENSION_MESSAGE, getEffectiveSubscriptionStatus, normalizeAccountRestriction, normalizeSubscriptionAccess } from "../../lib/subscriptionAccess";
import { supabase } from "../../lib/supabase";
import { StoreBranchesMap } from "../../components/StoreBranchesMap";
import { PasswordVisibilityButton } from "../../components/PasswordVisibilityButton";
import { ConfirmationModal } from "../../components/ConfirmationModal";

const ACTIVITY_LOGS_PER_PAGE = 8;
type SubscriptionAccessAction = "active" | "warning" | "grace" | "frozen";
const localDateTimeInputValue = (date = new Date()) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
};

export default function AdminStoreDetail({
  storeId,
  onBack,
  onDeleted,
}: {
  storeId: string;
  onBack: () => void;
  onDeleted?: (deletedStoreIds: string[]) => void;
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
  const isStorePhase = searchParams.get("dashboard") === "store";
  const activeTab: 'overview' | 'branches' | 'accounts' | 'analytics' | 'subscription' | 'feedback' =
    requestedTab === 'branches' || requestedTab === 'accounts' || requestedTab === 'analytics' || requestedTab === 'subscription' || requestedTab === 'feedback' ? requestedTab : 'overview';
  const setActiveTab = (tab: 'overview' | 'branches' | 'accounts' | 'analytics' | 'subscription' | 'feedback') => {
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
  const [branchAnalytics, setBranchAnalytics] = useState<Array<{ id: string; name: string; customers: number; promotions: number; claims: number; reviews: number }>>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [activityPage, setActivityPage] = useState(1);

  // Edit store state
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddress, setNewBranchAddress] = useState("");
  const [newBranchLatitude, setNewBranchLatitude] = useState(7.4478);
  const [newBranchLongitude, setNewBranchLongitude] = useState(125.8078);
  const [newBranchLocationSelected, setNewBranchLocationSelected] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchError, setBranchError] = useState("");
  const [branchRequestsOpen, setBranchRequestsOpen] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteScope, setDeleteScope] = useState<"store" | "branch">("store");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNameConfirmation, setDeleteNameConfirmation] = useState("");
  const [deleteWordConfirmation, setDeleteWordConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [subscriptionAccessForm, setSubscriptionAccessForm] = useState(() => normalizeSubscriptionAccess(null));
  const [subscriptionAccessBusy, setSubscriptionAccessBusy] = useState(false);
  const [subscriptionAccessMessage, setSubscriptionAccessMessage] = useState("");
  const [subscriptionAccessError, setSubscriptionAccessError] = useState("");
  const [pendingSubscriptionAccessAction, setPendingSubscriptionAccessAction] = useState<SubscriptionAccessAction | null>(null);
  const [billingInvoices, setBillingInvoices] = useState<any[]>([]);
  const [billingInvoicesLoading, setBillingInvoicesLoading] = useState(false);
  const [billingRetryId, setBillingRetryId] = useState("");
  const [manualPaymentInvoiceId, setManualPaymentInvoiceId] = useState("");
  const [manualPaymentForm, setManualPaymentForm] = useState({
    paymentMethod: "bank_transfer",
    paymentReference: "",
    paidAt: localDateTimeInputValue(),
  });
  const [manualPaymentBusy, setManualPaymentBusy] = useState(false);
  const [manualPaymentError, setManualPaymentError] = useState("");
  const [restrictionReason, setRestrictionReason] = useState(DEFAULT_POLICY_SUSPENSION_MESSAGE);
  const [restrictionInternalNote, setRestrictionInternalNote] = useState("");
  const [restrictionBusy, setRestrictionBusy] = useState(false);
  const [restrictionMessage, setRestrictionMessage] = useState("");
  const [restrictionError, setRestrictionError] = useState("");
  const [pendingRestrictionAction, setPendingRestrictionAction] = useState<"suspend" | "restore" | null>(null);
  const subscriptionStore = (store?.isPrimaryBranch !== false ? store : null) ||
    branches.find(branch => branch.isPrimaryBranch === true) ||
    branches.find(branch => branch.subscriptionLevel || branch.subscriptionDependencies) || null;
  const canEditSubscription = Boolean(store && subscriptionStore && store.id === subscriptionStore.id);
  const branchLimit = getSubscriptionBranchLimit(subscriptionStore?.subscriptionDependencies);
  const predictedPaymentDates = subscriptionStore
    ? predictPaymentDates(subscriptionStore.paymentSchedule, subscriptionStore.subscriptionStart, subscriptionStore.subscriptionEnd, 6, new Date(), subscriptionStore.billingIntervalDays)
    : [];
  const accountRestriction = normalizeAccountRestriction(subscriptionStore?.accountRestriction);
  const subscriptionAccessStatus = getEffectiveSubscriptionStatus(subscriptionStore?.subscriptionAccess, new Date(), subscriptionStore?.subscriptionEnd);
  const currentPayment = getCurrentSubscriptionPaymentState(
    billingInvoices,
    subscriptionStore?.subscriptionStart,
    subscriptionStore?.subscriptionEnd,
    subscriptionStore?.initialPaymentRequired === true,
  );
  const subscriptionAccessConfirmation = pendingSubscriptionAccessAction === "warning" ? {
    title: "Publish subscription warning?",
    description: "The warning message will immediately be shown to the store owner and staff. Their access will remain available.",
    confirmLabel: "Publish",
  } : pendingSubscriptionAccessAction === "grace" ? {
    title: "Start the grace period?",
    description: `This immediately starts ${subscriptionAccessForm.gracePeriodDays} day${subscriptionAccessForm.gracePeriodDays === 1 ? "" : "s"} of grace access. Starting it again resets the countdown, and access will freeze when it expires.`,
    confirmLabel: "Start",
  } : pendingSubscriptionAccessAction === "frozen" ? {
    title: "Freeze for non-payment now?",
    description: "The owner and staff will see the overdue-payment screen. A matching PayMongo payment can automatically restore access. Use Administrative suspension below for policy violations.",
    confirmLabel: "Freeze for non-payment",
  } : pendingSubscriptionAccessAction === "active" ? {
    title: "Restore store access?",
    description: "The current warning, grace period, or frozen state will be cleared, and the store owner and staff will regain normal portal access.",
    confirmLabel: "Restore",
  } : null;
  const branchStaff = staff.filter((staffMember) => staffMember.storeId === storeId);
  const selectedBranchAnalytics = branchAnalytics.find((branch) => branch.id === storeId) || { id: storeId, name: store?.branchName || store?.name || "Branch", customers: 0, promotions: 0, claims: 0, reviews: 0 };
  const selectedBranchReviews = reviews.filter((review) => review.storeId === storeId);
  const selectedBranchAverageRating = selectedBranchReviews.length
    ? selectedBranchReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / selectedBranchReviews.length
    : 0;
  const selectedBranchRatingDistribution = [5, 4, 3, 2, 1].map((rating) => ({ rating, count: selectedBranchReviews.filter((review) => Number(review.rating || 0) === rating).length }));
  
  // Password reset state
  const [resetModalUser, setResetModalUser] = useState<any>(null);
  const [newPasswordType, setNewPasswordType] = useState<'default' | 'random' | 'custom'>('default');
  const [customPassword, setCustomPassword] = useState('');
  const [showCustomPassword, setShowCustomPassword] = useState(false);
  const [requirePasswordChange, setRequirePasswordChange] = useState(false);
  const deleteTargetName = deleteScope === "store"
    ? String(store?.businessName || store?.name || "").trim()
    : String(store?.branchName || store?.name || "").trim();
  const deleteNameMatches = deleteTargetName !== "" && deleteNameConfirmation.trim() === deleteTargetName;
  const deleteWordMatches = deleteWordConfirmation.trim() === "DELETE";
  const canConfirmDelete = deleteNameMatches && deleteWordMatches && Boolean(deletePassword) && !isDeleting;
  const activityRows = store
    ? [
        ...branches.map((branch) => ({
          id: `branch-created-${branch.id}`,
          date: formatPhilippineDateTime(branch.createdAt),
          event: `${branch.branchName || branch.name || "Branch"} Profile Created`,
          actor: "System",
        })),
        ...staff.map((staffMember) => ({
          id: `staff-${staffMember.id}`,
          date: "Unknown",
          event: "Staff Account Registered",
          actor: `${staffMember.name} · ${branches.find((branch) => branch.id === staffMember.storeId)?.branchName || "Unassigned branch"}`,
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
  const branchActivityRows = store ? [
    { id: `branch-created-${store.id}`, date: formatPhilippineDateTime(store.createdAt), event: "Branch Profile Created", actor: "System" },
    ...branchStaff.map((staffMember) => ({ id: `staff-${staffMember.id}`, date: "Unknown", event: "Staff Account Registered", actor: `${staffMember.name} (${staffMember.email})` })),
    ...(selectedBranchAnalytics.promotions ? [{ id: "promotions-published", date: "Multiple", event: `${selectedBranchAnalytics.promotions} Promotion(s) Published`, actor: "Store Owner" }] : []),
    ...(selectedBranchAnalytics.claims ? [{ id: "claims-processed", date: "Multiple", event: `${selectedBranchAnalytics.claims} Customer Scan(s) Processed`, actor: "Staff" }] : []),
    ...(selectedBranchReviews.length ? [{ id: "reviews-received", date: "Multiple", event: `${selectedBranchReviews.length} Customer Review(s) Received`, actor: "Customers" }] : []),
  ] : [];
  const visibleActivityRows = isStorePhase ? activityRows : branchActivityRows;
  const activityTotalPages = Math.max(1, Math.ceil(visibleActivityRows.length / ACTIVITY_LOGS_PER_PAGE));
  const paginatedActivityRows = visibleActivityRows.slice((activityPage - 1) * ACTIVITY_LOGS_PER_PAGE, activityPage * ACTIVITY_LOGS_PER_PAGE);

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
          let loadedBranches: any[] = [{ id: storeDoc.id, ...normalizedStoreData }];
          setBranches(loadedBranches);
          setEditData({
            name: storeData.name || '',
            ownerName: "",
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
            billingIntervalDays: Number(storeData.billingIntervalDays || 30),
            status: storeData.status || 'active',
          });

          // Fetch owner
          if (storeData.ownerId) {
            const ownerDoc = await getDoc(doc(db, "users", storeData.ownerId));
            if (ownerDoc.exists()) {
              const ownerData = ownerDoc.data();
              setOwner({ id: ownerDoc.id, ...ownerData });
              setEditData((current: any) => ({
                ...current,
                ownerName: String(ownerData.name || ""),
              }));
            }
            const branchSnap = await getDocs(query(collection(db, "stores"), where("ownerId", "==", storeData.ownerId)));
            loadedBranches = branchSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .sort((left, right) => {
                const leftPrimary = left.isPrimaryBranch === true || !left.parentStoreId;
                const rightPrimary = right.isPrimaryBranch === true || !right.parentStoreId;
                if (leftPrimary !== rightPrimary) return leftPrimary ? -1 : 1;
                return String(left.branchName || "Main").localeCompare(String(right.branchName || "Main"));
              });
            setBranches(loadedBranches);
            const branchRequestSnap = await getDocs(query(collection(db, "branch_requests"), where("ownerId", "==", storeData.ownerId)));
            setBranchRequests(branchRequestSnap.docs.map(d => ({ id: d.id, ...d.data() })));
          }

          // Fetch staff
          const branchIds = loadedBranches.map((branch) => branch.id);
          const staffQuery = query(collection(db, "users"), where("storeId", "in", branchIds), where("role", "==", "staff"));
          const staffSnap = await getDocs(staffQuery);
          setStaff(staffSnap.docs.map(d => ({ id: d.id, ...d.data() })));

          // Fetch Analytics (Mocked up via actual queries)
          const customersQuery = query(collection(db, "cards"), where("storeId", "in", branchIds));
          const customersSnap = await getDocs(customersQuery);
          const uniqueCustomerCount = new Set(
            customersSnap.docs.map((customerCard) => customerCard.data().customerId).filter(Boolean),
          ).size;
          
          const promosQuery = query(collection(db, "promotions"), where("storeId", "in", branchIds));
          const promosSnap = await getDocs(promosQuery);

          const claimsQuery = query(collection(db, "promotions_scanned"), where("storeId", "in", branchIds));
          const claimsSnap = await getDocs(claimsQuery);

          // Fetch reviews for this store
          const reviewsQuery = query(collection(db, "store_reviews"), where("storeId", "in", branchIds));
          const reviewsSnap = await getDocs(reviewsQuery);
          const loadedReviews = reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

          setAnalytics({
            customers: uniqueCustomerCount,
            promotions: promosSnap.size,
            claims: claimsSnap.size
          });
          setReviews(loadedReviews.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          setBranchAnalytics(loadedBranches.map((branch) => {
            const branchCards = customersSnap.docs.filter((row) => row.data().storeId === branch.id);
            return {
              id: branch.id,
              name: branch.branchName || branch.name || "Branch",
              customers: new Set(branchCards.map((row) => row.data().customerId).filter(Boolean)).size,
              promotions: promosSnap.docs.filter((row) => row.data().storeId === branch.id).length,
              claims: claimsSnap.docs.filter((row) => row.data().storeId === branch.id).length,
              reviews: loadedReviews.filter((row) => row.storeId === branch.id).length,
            };
          }));

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

  useEffect(() => {
    setSubscriptionAccessForm(normalizeSubscriptionAccess(subscriptionStore?.subscriptionAccess));
  }, [subscriptionStore?.id, subscriptionStore?.subscriptionAccess]);

  useEffect(() => {
    const restriction = normalizeAccountRestriction(subscriptionStore?.accountRestriction);
    setRestrictionReason(restriction.reason);
    setRestrictionInternalNote(restriction.internalNote);
  }, [subscriptionStore?.id, subscriptionStore?.accountRestriction]);

  const updateAccountRestriction = async (status: "active" | "suspended") => {
    if (!subscriptionStore || !canEditSubscription) return;
    setRestrictionBusy(true);
    setRestrictionMessage("");
    setRestrictionError("");
    try {
      const result = await invokeAdminBackend<{ storeId: string; accountRestriction: any }>({
        action: "update_account_restriction",
        storeId: subscriptionStore.id,
        accountRestriction: { status, reason: restrictionReason, internalNote: restrictionInternalNote },
      });
      if (store?.id === result.storeId) setStore({ ...store, accountRestriction: result.accountRestriction });
      setBranches((current) => current.map((branch) => branch.id === result.storeId ? { ...branch, accountRestriction: result.accountRestriction } : branch));
      setRestrictionMessage(status === "suspended" ? "Administrative suspension applied. Payments cannot restore access." : "Administrative suspension lifted.");
      setPendingRestrictionAction(null);
    } catch (error) {
      setRestrictionError((error as Error).message);
    } finally {
      setRestrictionBusy(false);
    }
  };

  const loadBillingInvoices = async () => {
    if (!subscriptionStore?.id) {
      setBillingInvoices([]);
      return;
    }
    setBillingInvoicesLoading(true);
    try {
      const { data, error } = await supabase.from("billing_invoices")
        .select("id,status,due_at,period_start,period_end,amount_centavos,currency,paymongo_reference_number,manual_payment_reference,payment_method,manual_recorded_at,payment_url,livemode,paid_at,attempt_count,last_error,created_at")
        .eq("store_id", subscriptionStore.id)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      setBillingInvoices(data || []);
    } catch (error) {
      console.error("Could not load admin billing history", error);
      setBillingInvoices([]);
    } finally {
      setBillingInvoicesLoading(false);
    }
  };

  useEffect(() => {
    void loadBillingInvoices();
  }, [subscriptionStore?.id]);

  useEffect(() => {
    setSubscriptionAccessMessage("");
    setSubscriptionAccessError("");
    setPendingSubscriptionAccessAction(null);
  }, [storeId]);

  const updateSubscriptionAccess = async (status: SubscriptionAccessAction) => {
    if (!subscriptionStore || !canEditSubscription) return false;
    setSubscriptionAccessBusy(true);
    setSubscriptionAccessMessage("");
    setSubscriptionAccessError("");
    try {
      const result = await invokeAdminBackend<{ storeId: string; subscriptionAccess: any }>({
        action: "update_subscription_access",
        storeId: subscriptionStore.id,
        subscriptionAccess: { ...subscriptionAccessForm, status },
      });
      setSubscriptionAccessForm(normalizeSubscriptionAccess(result.subscriptionAccess));
      if (store?.id === result.storeId) {
        setStore({ ...store, subscriptionAccess: result.subscriptionAccess });
      }
      setBranches((current) => current.map((branch) => (
        branch.id === result.storeId ? { ...branch, subscriptionAccess: result.subscriptionAccess } : branch
      )));
      setSubscriptionAccessMessage(
        status === "active" ? "Store access restored." :
        status === "warning" ? "Subscription warning published." :
        status === "grace" ? `Grace access started for ${subscriptionAccessForm.gracePeriodDays} day${subscriptionAccessForm.gracePeriodDays === 1 ? "" : "s"}.` :
        "Store owner and staff access frozen.",
      );
      return true;
    } catch (error) {
      setSubscriptionAccessError((error as Error).message);
      return false;
    } finally {
      setSubscriptionAccessBusy(false);
    }
  };

  const requestSubscriptionAccessUpdate = (status: SubscriptionAccessAction) => {
    setSubscriptionAccessError("");
    setPendingSubscriptionAccessAction(status);
  };

  const retryBillingInvoice = async (invoiceId: string) => {
    setBillingRetryId(invoiceId);
    setSubscriptionAccessError("");
    try {
      await invokeAdminBackend({ action: "retry_billing_invoice", invoiceId });
      setSubscriptionAccessMessage("Billing retry queued. The hourly worker will process it safely.");
      await loadBillingInvoices();
    } catch (error) {
      setSubscriptionAccessError((error as Error).message);
    } finally {
      setBillingRetryId("");
    }
  };

  const toggleManualPayment = (invoiceId: string, enabled: boolean) => {
    setManualPaymentError("");
    setManualPaymentInvoiceId(enabled ? invoiceId : "");
    if (enabled) {
      setManualPaymentForm({
        paymentMethod: "bank_transfer",
        paymentReference: "",
        paidAt: localDateTimeInputValue(),
      });
    }
  };

  const recordManualPayment = async (invoice: any) => {
    if (!manualPaymentForm.paymentReference.trim()) {
      setManualPaymentError("Enter the receipt or transaction reference.");
      return;
    }
    setManualPaymentBusy(true);
    setManualPaymentError("");
    setSubscriptionAccessError("");
    try {
      const result = await invokeAdminBackend<{
        fulfillment: {
          storeId: string;
          periodStart: string;
          periodEnd: string;
          paidAt: string;
          paymentMethod: string;
          paymentReference: string;
        };
      }>({
        action: "record_manual_invoice_payment",
        invoiceId: invoice.id,
        paymentMethod: manualPaymentForm.paymentMethod,
        paymentReference: manualPaymentForm.paymentReference.trim(),
        paidAt: new Date(manualPaymentForm.paidAt).toISOString(),
      });
      const updatedAccess = {
        ...subscriptionAccessForm,
        status: "active",
        paymentLink: "",
        graceStartedAt: "",
        graceEndsAt: "",
      };
      const storeUpdates = {
        subscriptionStart: result.fulfillment.periodStart,
        subscriptionEnd: result.fulfillment.periodEnd,
        subscriptionAccess: updatedAccess,
        initialPaymentRequired: false,
        initialPaymentStatus: "paid",
      };
      if (store?.id === result.fulfillment.storeId) setStore({ ...store, ...storeUpdates });
      setBranches((current) => current.map((branch) => (
        branch.id === result.fulfillment.storeId ? { ...branch, ...storeUpdates } : branch
      )));
      setSubscriptionAccessForm(normalizeSubscriptionAccess(updatedAccess));
      setSubscriptionAccessMessage("Manual payment recorded. The invoice is paid and subscription access is active.");
      setManualPaymentInvoiceId("");
      await loadBillingInvoices();
    } catch (error) {
      setManualPaymentError((error as Error).message);
    } finally {
      setManualPaymentBusy(false);
    }
  };

  const confirmSubscriptionAccessUpdate = async () => {
    if (!pendingSubscriptionAccessAction) return;
    const updated = await updateSubscriptionAccess(pendingSubscriptionAccessAction);
    if (updated) setPendingSubscriptionAccessAction(null);
  };

  const handleUpdateStore = async () => {
    let uploadedLogoUrl = "";
    let storePersisted = false;
    try {
      const logoUrl = pendingLogo
        ? await uploadImageFileToDriveSecure(pendingLogo, {
          owner: store.ownerId || store.name,
          ownerId: store.ownerId,
          purpose: "admin-store-logo",
          })
        : editData.logoUrl;
      if (pendingLogo) uploadedLogoUrl = logoUrl;
      const isPrimaryBranch = store.isPrimaryBranch !== false;
      const dependencies = getSubscriptionDependencies(plans, editData.subscriptionLevel);
      const currentAmount = Number(store.owedAmount || 0);
      const nextPlanAmount = getSubscriptionOwedAmount(plans, editData.subscriptionLevel, currentAmount);
      const nextPaymentDate = getNextPaymentDate(
        editData.paymentSchedule,
        dateInputToDate(editData.subscriptionStart),
        dateInputToDate(editData.subscriptionEnd),
        new Date(),
        editData.billingIntervalDays,
      );
      const priceChangesNextCycle = nextPlanAmount !== currentAmount && Boolean(nextPaymentDate);
      const {
        ownerName: rawOwnerName,
        subscriptionLevel,
        owedAmount: _owedAmount,
        subscriptionStart,
        subscriptionEnd,
        paymentSchedule,
        ...storeEditData
      } = editData;
      const nextOwnerName = String(rawOwnerName || "").trim();
      const nextData: Record<string, any> = {
        ...storeEditData,
        logoUrl,
        address: storeEditData.address || "",
        contact: storeEditData.contact || "",
        website: storeEditData.website || "",
        description: storeEditData.description || "",
        hours: formatStoreHours(storeEditData.openingTime, storeEditData.closingTime),
        openingHours: formatStoreHours(storeEditData.openingTime, storeEditData.closingTime),
        updatedAt: serverTimestamp(),
      };

      if (isPrimaryBranch) {
        Object.assign(nextData, {
          subscriptionLevel,
          owedAmount: priceChangesNextCycle ? currentAmount : nextPlanAmount,
          subscriptionDependencies: dependencies,
          pendingOwedAmount: priceChangesNextCycle ? nextPlanAmount : deleteField(),
          pendingOwedAmountEffectiveAt: priceChangesNextCycle ? nextPaymentDate : deleteField(),
          subscriptionStart: dateInputToDate(subscriptionStart),
          subscriptionEnd: dateInputToDate(subscriptionEnd),
          paymentSchedule,
        });
      } else {
        Object.assign(nextData, {
          subscriptionLevel: deleteField(),
          subscriptionDependencies: deleteField(),
          subscriptionStart: deleteField(),
          subscriptionEnd: deleteField(),
          paymentSchedule: deleteField(),
          owedAmount: deleteField(),
          pendingOwedAmount: deleteField(),
          pendingOwedAmountEffectiveAt: deleteField(),
        });
      }

      await updateDoc(doc(db, "stores", storeId), nextData);
      storePersisted = true;
      if (isPrimaryBranch && subscriptionAccessForm.automationEnabled) {
        await invokeAdminBackend({ action: "sync_subscription_billing", storeId });
      }
      if (store.logoUrl && store.logoUrl !== logoUrl) {
        await deleteImageFromDriveSecure(store.logoUrl).catch(console.error);
      }
      if (owner) {
        const nextOwnerData = {
          ...(nextOwnerName ? { name: nextOwnerName } : {}),
          ...(isPrimaryBranch ? { branchLimit: getSubscriptionBranchLimit(dependencies) } : {}),
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, "users", owner.id), nextOwnerData);
        setOwner({ ...owner, ...nextOwnerData });
      }
      setStore({
        ...store,
        ...nextData,
        pendingOwedAmount: priceChangesNextCycle ? nextPlanAmount : null,
        pendingOwedAmountEffectiveAt: priceChangesNextCycle ? nextPaymentDate : null,
      });
      setEditData({
        ...editData,
        ownerName: nextOwnerName,
        ...(isPrimaryBranch ? { owedAmount: nextData.owedAmount } : {}),
      });
      setIsEditing(false);
      setPendingLogo(null);
    } catch (error) {
      if (!storePersisted && uploadedLogoUrl) {
        await deleteImageFromDriveSecure(uploadedLogoUrl).catch(console.error);
      }
      console.error(error);
      alert(storePersisted
        ? `Store details were saved, but billing synchronization failed: ${(error as Error).message}`
        : "Failed to update store");
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
      ownerName: owner?.name || "",
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
      billingIntervalDays: Number(store.billingIntervalDays || 30),
      status: store.status || 'active',
    });
    setIsEditing(false);
    setPendingLogo(null);
  };

  const openBranchDashboard = (branchId: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("store", branchId);
    nextParams.delete("detailTab");
    nextParams.delete("dashboard");
    setSearchParams(nextParams);
  };

  const returnToStoreDashboard = () => {
    const primaryBranch = branches.find((branch) => branch.isPrimaryBranch === true || !branch.parentStoreId) || branches[0] || store;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("store", primaryBranch.id);
    nextParams.set("detailTab", "branches");
    nextParams.set("dashboard", "store");
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

  const openDeleteDialog = (scope: "store" | "branch") => {
    setDeleteScope(scope);
    setDeleteError("");
    setDeleteNameConfirmation("");
    setDeleteWordConfirmation("");
    setDeletePassword("");
    setShowDeleteModal(true);
  };

  const handleDelete = async () => {
    if (!store) return;

    if (deleteNameConfirmation.trim() !== deleteTargetName) {
      setDeleteError(`Type the exact ${deleteScope} name: ${deleteTargetName}`);
      return;
    }

    if (deleteWordConfirmation.trim() !== "DELETE") {
      setDeleteError("Type DELETE to confirm.");
      return;
    }

    setIsDeleting(true);
    setDeleteError("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const email = authData.user?.email;
      if (!email) throw new Error("Your administrator email could not be verified.");
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: deletePassword });
      if (reauthError) throw new Error("Administrator password is incorrect.");
      const result = await invokeAdminBackend<{
        deleted: boolean;
        deletedStoreIds: string[];
        primaryStoreId?: string;
        cleanupComplete?: boolean;
        cleanupWarning?: string;
        failedUsers?: number;
        failedFiles?: number;
      }>({
        action: deleteScope === "store" ? "delete_store_group" : "delete_store",
        storeId,
      });
      onDeleted?.(result.deletedStoreIds || [storeId]);
      setShowDeleteModal(false);
      if (result.cleanupComplete === false) {
        alert(`${result.cleanupWarning || "Some external cleanup could not be completed."}\n\nFailed accounts: ${result.failedUsers || 0}\nFailed files: ${result.failedFiles || 0}`);
      }
      if (deleteScope === "store") {
        onBack();
      } else {
        const remainingBranch = branches.find((branch) => branch.id === result.primaryStoreId) || branches.find((branch) => branch.id !== storeId);
        if (!remainingBranch) {
          onBack();
          return;
        }
        const nextParams = new URLSearchParams(searchParams);
        nextParams.set("store", remainingBranch.id);
        nextParams.set("detailTab", "branches");
        nextParams.set("dashboard", "store");
        setSearchParams(nextParams);
      }
    } catch (error) {
      console.error(error);
      setDeleteError((error as Error).message || `The ${deleteScope} could not be deleted. Please try again.`);
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
    <div className="dark-high-contrast-text flex flex-col h-full animate-in slide-in-from-right-4 duration-300">
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50/50 p-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-2 sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <button onClick={isStorePhase ? onBack : returnToStoreDashboard} className="shrink-0 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-full transition-colors sm:p-2">
              <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
            <div className="min-w-0"><h3 className="truncate text-base font-bold leading-tight text-gray-900 dark:text-white sm:text-xl">{store.businessName || store.name} Dashboard</h3>{!isStorePhase && <p className="mt-0.5 text-xs text-gray-500">Branch: {store.branchName || store.name}</p>}</div>
          </div>
        </div>
        <div className="flex max-w-full gap-4 overflow-x-auto overscroll-x-contain" role="tablist" aria-label="Store dashboard sections">
          {isStorePhase ? <>
            <button onClick={() => setActiveTab('branches')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${activeTab === 'branches' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}>Branch Selection</button>
            <button onClick={() => setActiveTab('analytics')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${activeTab === 'analytics' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}>Analytics & Logs</button>
            <button onClick={() => setActiveTab('subscription')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${activeTab === 'subscription' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}>Subscription</button>
            <button onClick={() => setActiveTab('accounts')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${activeTab === 'accounts' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'}`}>Store Info</button>
          </> : <>
            <button onClick={() => setActiveTab('overview')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${activeTab === 'overview' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Detailed Overview</button>
            <button onClick={() => setActiveTab('accounts')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${activeTab === 'accounts' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Accounts</button>
            <button onClick={() => setActiveTab('analytics')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${activeTab === 'analytics' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Analytics & Logs</button>
            <button onClick={() => setActiveTab('feedback')} className={`shrink-0 whitespace-nowrap border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${activeTab === 'feedback' ? 'border-[#1b1b1b] text-[#1b1b1b] dark:border-white dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'}`}>Ratings & Feedback</button>
          </>}
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {((!isStorePhase && activeTab === 'overview') || (isStorePhase && activeTab === 'subscription')) && (
          <div className={`grid grid-cols-1 items-start animate-in fade-in slide-in-from-bottom-2 ${activeTab === 'subscription' ? 'gap-8 2xl:grid-cols-2' : 'gap-6 md:grid-cols-2'}`}>
            {activeTab === 'overview' && <>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Branch configuration</h4>
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Profile and operating details for this branch.</p>
                </div>
                {!isEditing ? (
                  <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800">
                    <Edit className="h-4 w-4" /> Edit branch
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleCancelEdit} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                      <X className="h-4 w-4" /> Cancel
                    </button>
                    <button type="button" onClick={handleUpdateStore} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700">
                      <Save className="h-4 w-4" /> Save changes
                    </button>
                  </div>
                )}
              </div>
              
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

            <div className="space-y-6">
              <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Branch Snapshot</h4>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {[{ label: "Customers", value: selectedBranchAnalytics.customers }, { label: "Staff", value: branchStaff.length }, { label: "Scans", value: selectedBranchAnalytics.claims }, { label: "Rating", value: selectedBranchReviews.length ? selectedBranchAverageRating.toFixed(1) : "—" }].map((item) => <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"><p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{item.label}</p><p className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{item.value}</p></div>)}
                </div>
              </section>
              <section className="rounded-2xl border border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Operational Summary</h4>
                <dl className="mt-4 divide-y divide-gray-200 text-sm dark:divide-gray-700">
                  <div className="flex justify-between gap-4 py-3"><dt className="text-gray-500">Branch label</dt><dd className="font-semibold text-gray-900 dark:text-white">{store.branchName || "Main"}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-gray-500">Location</dt><dd className="text-right font-semibold text-gray-900 dark:text-white">{store.address || store.location || "Not provided"}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-gray-500">Business hours</dt><dd className="text-right font-semibold text-gray-900 dark:text-white">{store.openingTime && store.closingTime ? `${formatTime12Hour(store.openingTime)} – ${formatTime12Hour(store.closingTime)} PHT` : "Not set"}</dd></div>
                  <div className="flex justify-between gap-4 py-3"><dt className="text-gray-500">Promotions</dt><dd className="font-semibold text-gray-900 dark:text-white">{selectedBranchAnalytics.promotions}</dd></div>
                </dl>
              </section>
            </div>

            <section className="md:col-span-2 overflow-hidden rounded-2xl border border-red-200 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20">
              <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-400">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold uppercase tracking-widest text-red-700 dark:text-red-300">Danger zone</h4>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-red-800/80 dark:text-red-200/80">Permanently delete this branch, its staff accounts, customer activity, promotions, and branch files. Other branches remain available.</p>
                  </div>
                </div>
                <button type="button" onClick={() => openDeleteDialog("branch")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700">
                  <Trash2 className="h-4 w-4" /> Delete branch
                </button>
              </div>
            </section>

            </>}
            {activeTab === 'subscription' && <>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-800/50 sm:p-7">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">Subscription & Billing</h4>
                {canEditSubscription && (!isEditing ? (
                  <button type="button" onClick={() => setIsEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:hover:bg-gray-800">
                    <Edit className="h-3.5 w-3.5" /> Edit
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleCancelEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
                      <X className="h-3.5 w-3.5" /> Cancel
                    </button>
                    <button type="button" onClick={handleUpdateStore} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-green-700">
                      <Save className="h-3.5 w-3.5" /> Save
                    </button>
                  </div>
                ))}
              </div>
              {!canEditSubscription && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300">
                  This branch uses the store owner's subscription. Billing can only be changed from the primary branch.
                </div>
              )}
              <div className="space-y-5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Subscription Level</label>
                  {isEditing && canEditSubscription ? (
                    <CustomDropdown
                      options={plans.map(p => ({ label: p.name, value: p.name }))}
                      value={editData.subscriptionLevel}
                      onChange={handleSubscriptionLevelChange}
                    />
                  ) : (
                    <p className="text-gray-900 dark:text-white font-medium">{subscriptionStore?.subscriptionLevel || 'Standard'}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Owed Amount</label>
                  {isEditing && canEditSubscription ? (
                    <div className="w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm font-medium text-gray-900 dark:text-white">
                      {formatMoney(editData.owedAmount)}
                    </div>
                  ) : (
                    <div>
                      <p className="text-red-600 font-medium">{formatMoney(Number(subscriptionStore?.owedAmount || 0))}</p>
                      {subscriptionStore?.pendingOwedAmount != null &&
                        formatBillingDate(subscriptionStore?.pendingOwedAmountEffectiveAt) !== "N/A" &&
                        Number.isFinite(Number(subscriptionStore.pendingOwedAmount)) &&
                        Number(subscriptionStore.pendingOwedAmount) !== Number(subscriptionStore?.owedAmount || 0) && (
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {formatMoney(Number(subscriptionStore?.pendingOwedAmount))} starts on {formatBillingDate(subscriptionStore?.pendingOwedAmountEffectiveAt)}.
                        </p>
                      )}
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Current Cycle Payment</label>
                    {billingInvoicesLoading ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking payment…</span>
                    ) : currentPayment.status === "paid" ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-green-700 dark:bg-green-950/40 dark:text-green-300"><Check className="h-3.5 w-3.5" /> Paid</span>
                        <p className="mt-1 text-xs text-gray-500">Received {formatBillingDate(currentPayment.invoice?.paid_at)}</p>
                      </div>
                    ) : currentPayment.status === "payment_due" ? (
                      <div>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/40 dark:text-red-300"><AlertTriangle className="h-3.5 w-3.5" /> Payment due</span>
                        {currentPayment.invoice?.due_at && <p className="mt-1 text-xs text-gray-500">Due {formatBillingDate(currentPayment.invoice.due_at)}</p>}
                      </div>
                    ) : (
                      <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">No payment record</span>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Subscription Start</label>
                    {isEditing && canEditSubscription ? (
                      <input type="date" value={editData.subscriptionStart || ""} onChange={e => setEditData({...editData, subscriptionStart: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(subscriptionStore?.subscriptionStart)}</p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Subscription End</label>
                    {isEditing && canEditSubscription ? (
                      <input type="date" value={editData.subscriptionEnd || ""} onChange={e => setEditData({...editData, subscriptionEnd: e.target.value})} className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg text-sm" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatBillingDate(subscriptionStore?.subscriptionEnd)}</p>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Payment Schedule</label>
                    {isEditing && canEditSubscription ? (
                      <CustomDropdown
                        options={PAYMENT_SCHEDULE_OPTIONS}
                        value={editData.paymentSchedule || ""}
                        onChange={(paymentSchedule) => setEditData({ ...editData, paymentSchedule })}
                        className="w-full"
                      />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{formatPaymentSchedule(subscriptionStore?.paymentSchedule, subscriptionStore?.billingIntervalDays)}</p>
                    )}
                  </div>
                  {editData.paymentSchedule === "every_30_days" || (!isEditing && subscriptionStore?.paymentSchedule === "every_30_days") ? <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Billing Interval (Days)</label>
                    {isEditing && canEditSubscription ? (
                      <input type="number" min="1" max="365" value={editData.billingIntervalDays || 30} onChange={(event) => setEditData({ ...editData, billingIntervalDays: Math.max(1, Math.min(365, Math.trunc(Number(event.target.value) || 1))) })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
                    ) : (
                      <p className="text-sm text-gray-900 dark:text-gray-300">{Number(subscriptionStore?.billingIntervalDays || 30)} days</p>
                    )}
                  </div> : null}
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
                  <div className="mb-3">
                    <h5 className="text-sm font-bold text-gray-900 dark:text-white">Predicted payment dates</h5>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Calculated from the saved payment schedule and subscription period.</p>
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
                    <p className="text-sm text-gray-600 dark:text-gray-400">No upcoming dates within the subscription period.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-800/50 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">Subscription access control</h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Warn the store team, allow a timed grace period, or block owner and staff portal access.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                  subscriptionAccessStatus === "frozen" ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" :
                  subscriptionAccessStatus === "grace" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" :
                  subscriptionAccessStatus === "warning" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" :
                  "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
                }`}>{subscriptionAccessStatus}</span>
              </div>

              {!canEditSubscription ? (
                <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300">
                  Access controls are shared by all branches. Open the primary branch to change them.
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Warning shown to the store owner
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={subscriptionAccessForm.warningMessage}
                      onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, warningMessage: event.target.value })}
                      className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                    <input type="checkbox" checked={subscriptionAccessForm.automationEnabled} onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, automationEnabled: event.target.checked })} className="mt-1 h-4 w-4" />
                    <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">Automatic PayMongo billing</span><span className="mt-1 block text-xs leading-5 text-gray-600 dark:text-gray-400">Create one PayMongo payment link per configured billing interval, send staged notices and an invoice, confirm payment by signed webhook, email a receipt, and restore billing access automatically. Administrative suspensions are never removed by payment.</span></span>
                  </label>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Warning lead time (days)
                      <input type="number" min="0" max="365" value={subscriptionAccessForm.warningLeadDays} onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, warningLeadDays: Math.max(0, Math.min(365, Math.trunc(Number(event.target.value) || 0))) })} className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                    </label>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Grace period (days)
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={subscriptionAccessForm.gracePeriodDays || ""}
                        onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, gracePeriodDays: Math.max(0, Math.min(365, Math.trunc(Number(event.target.value) || 0))) })}
                        placeholder="e.g. 7"
                        className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 sm:col-span-2">
                      Payment contact
                      <input
                        type="text"
                        maxLength={254}
                        value={subscriptionAccessForm.paymentContact}
                        onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, paymentContact: event.target.value })}
                        placeholder="Email address or phone number"
                        className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Where and how to pay
                    <textarea
                      rows={4}
                      maxLength={2000}
                      value={subscriptionAccessForm.paymentInstructions}
                      onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, paymentInstructions: event.target.value })}
                      placeholder="Add the payment channel, account name/number, reference instructions, and proof-of-payment steps."
                      className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </label>

                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Payment page (optional)
                    <input
                      type="url"
                      maxLength={2000}
                      value={subscriptionAccessForm.paymentLink}
                      onChange={(event) => setSubscriptionAccessForm({ ...subscriptionAccessForm, paymentLink: event.target.value })}
                      placeholder="https://..."
                      className="mt-1.5 block w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                    />
                  </label>

                  {subscriptionAccessMessage && <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">{subscriptionAccessMessage}</p>}
                  {subscriptionAccessError && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{subscriptionAccessError}</p>}

                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={subscriptionAccessBusy} onClick={() => void updateSubscriptionAccess(subscriptionAccessForm.status)} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                      {subscriptionAccessBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save billing settings
                    </button>
                    <button type="button" disabled={subscriptionAccessBusy || !subscriptionAccessForm.warningMessage.trim()} onClick={() => requestSubscriptionAccessUpdate("warning")} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-amber-400 bg-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm transition hover:-translate-y-0.5 hover:bg-amber-300 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                      <BellRing className="h-3.5 w-3.5" /> Warn
                    </button>
                    <button type="button" disabled={subscriptionAccessBusy || subscriptionAccessForm.gracePeriodDays < 1} onClick={() => requestSubscriptionAccessUpdate("grace")} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-orange-500 bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-600 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                      <Clock3 className="h-3.5 w-3.5" /> Grace
                    </button>
                    <button type="button" disabled={subscriptionAccessBusy} onClick={() => requestSubscriptionAccessUpdate("frozen")} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-red-700 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0">
                      <Snowflake className="h-3.5 w-3.5" /> Freeze for non-payment
                    </button>
                    <button type="button" disabled={subscriptionAccessBusy} onClick={() => requestSubscriptionAccessUpdate("active")} className="inline-flex min-h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-800 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-400 hover:bg-gray-100 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:hover:border-gray-500 dark:hover:bg-gray-800">
                      {subscriptionAccessBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-gray-600 dark:text-gray-400">Starting a grace period restarts its countdown. When it expires, owner and staff screens freeze automatically. A matching PayMongo payment restores access automatically; Restore remains available as a logged manual override.</p>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-6 shadow-sm dark:border-red-900/60 dark:bg-red-950/20 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-red-700 dark:text-red-300">Administrative suspension</h4>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-red-800/80 dark:text-red-200/80">Use this for Terms violations, fraud, abuse, or investigation. It takes priority over billing, hides every payment action, and cannot be lifted by a PayMongo payment.</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${accountRestriction.status === "suspended" ? "bg-red-700 text-white" : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"}`}>{accountRestriction.status}</span>
              </div>
              {canEditSubscription && <div className="mt-5 space-y-4">
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Message shown to the store owner
                  <textarea rows={3} maxLength={500} value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} className="mt-1.5 block w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-normal text-gray-900 dark:border-red-900/60 dark:bg-gray-900 dark:text-white" />
                </label>
                <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200">Internal note (admins only)
                  <textarea rows={3} maxLength={2000} value={restrictionInternalNote} onChange={(event) => setRestrictionInternalNote(event.target.value)} placeholder="Record the violation, evidence, or review instructions." className="mt-1.5 block w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-normal text-gray-900 dark:border-red-900/60 dark:bg-gray-900 dark:text-white" />
                </label>
                {restrictionMessage && <p className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">{restrictionMessage}</p>}
                {restrictionError && <p className="rounded-xl border border-red-300 bg-white px-4 py-3 text-sm font-medium text-red-700">{restrictionError}</p>}
                {accountRestriction.status === "suspended" ? (
                  <button type="button" disabled={restrictionBusy} onClick={() => setPendingRestrictionAction("restore")} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Lift suspension</button>
                ) : (
                  <button type="button" disabled={restrictionBusy || !restrictionReason.trim()} onClick={() => setPendingRestrictionAction("suspend")} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"><Ban className="h-4 w-4" /> Suspend for policy violation</button>
                )}
              </div>}
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 shadow-sm dark:border-gray-800 dark:bg-gray-800/50 sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">Payment history</h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Invoices and receipts for PayMongo and manually recorded subscription payments.</p>
                </div>
                <button type="button" onClick={() => void loadBillingInvoices()} disabled={billingInvoicesLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                  <RotateCcw className={`h-3.5 w-3.5 ${billingInvoicesLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
              </div>
              {billingInvoicesLoading ? (
                <div className="mt-5 flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading payment history…</div>
              ) : billingInvoices.length ? (
                <div className="mt-5 space-y-3">
                  {billingInvoices.map((invoice) => (
                    <div key={invoice.id} className={`rounded-xl border p-4 ${invoice.last_error ? "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20" : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">{formatMoney(Number(invoice.amount_centavos || 0) / 100)}</span>
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-300">{invoice.status}</span>
                            {!invoice.livemode && !String(invoice.payment_method || "").startsWith("manual_") && invoice.payment_method !== "admin_confirmed" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Test</span>}
                          </div>
                          <p className="mt-1 text-xs text-gray-500">Period {formatBillingDate(invoice.period_start)} - {formatBillingDate(invoice.period_end)}</p>
                          <p className="mt-1 text-xs text-gray-500">{invoice.paid_at ? `Paid ${formatBillingDate(invoice.paid_at)}` : `Due ${formatBillingDate(invoice.due_at)}`} · Ref {invoice.manual_payment_reference || invoice.paymongo_reference_number || "pending"} · Attempts {invoice.attempt_count || 0}</p>
                        </div>
                        {invoice.status !== "paid" && (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <button type="button" onClick={() => void retryBillingInvoice(invoice.id)} disabled={billingRetryId === invoice.id || manualPaymentBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 dark:bg-white dark:text-gray-900">
                              {billingRetryId === invoice.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Retry
                            </button>
                            {["pending", "link_created", "failed"].includes(String(invoice.status)) && (
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <input
                                  type="checkbox"
                                  checked={manualPaymentInvoiceId === invoice.id}
                                  onChange={(event) => toggleManualPayment(invoice.id, event.target.checked)}
                                  disabled={manualPaymentBusy}
                                  className="peer sr-only"
                                />
                                <span className={`flex h-5 w-9 rounded-full p-0.5 transition ${manualPaymentInvoiceId === invoice.id ? "bg-emerald-600" : "bg-gray-300 dark:bg-gray-700"}`}>
                                  <span className={`h-4 w-4 rounded-full bg-white shadow-sm transition ${manualPaymentInvoiceId === invoice.id ? "translate-x-4" : "translate-x-0"}`} />
                                </span>
                                Manual paid
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                      {invoice.status === "paid" && String(invoice.payment_method || "").startsWith("manual_") && (
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                          <span className="inline-flex items-center gap-1 font-semibold"><BadgeCheck className="h-3.5 w-3.5" /> Manually recorded</span>
                          <span>{String(invoice.payment_method).replace(/^manual_/, "").replace(/_/g, " ")}</span>
                          <span>Ref {invoice.manual_payment_reference}</span>
                        </div>
                      )}
                      {manualPaymentInvoiceId === invoice.id && (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/20">
                          <div className="mb-4 flex items-start gap-3">
                            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-300" />
                            <div>
                              <p className="text-sm font-bold text-gray-900 dark:text-white">Record a manual payment</p>
                              <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">This will mark the {formatMoney(Number(invoice.amount_centavos || 0) / 100)} invoice as paid, activate subscription access, and queue the payment receipt.</p>
                            </div>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Payment method <span className="text-red-500">*</span>
                              <select
                                value={manualPaymentForm.paymentMethod}
                                onChange={(event) => setManualPaymentForm({ ...manualPaymentForm, paymentMethod: event.target.value })}
                                disabled={manualPaymentBusy}
                                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              >
                                <option value="bank_transfer">Bank transfer</option>
                                <option value="cash">Cash</option>
                                <option value="gcash">GCash</option>
                                <option value="maya">Maya</option>
                                <option value="cheque">Cheque</option>
                                <option value="other">Other</option>
                              </select>
                            </label>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Paid date and time <span className="text-red-500">*</span>
                              <input
                                type="datetime-local"
                                value={manualPaymentForm.paidAt}
                                max={localDateTimeInputValue()}
                                onChange={(event) => setManualPaymentForm({ ...manualPaymentForm, paidAt: event.target.value })}
                                disabled={manualPaymentBusy}
                                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              />
                            </label>
                            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 sm:col-span-2">
                              Receipt or transaction reference <span className="text-red-500">*</span>
                              <input
                                type="text"
                                maxLength={100}
                                value={manualPaymentForm.paymentReference}
                                onChange={(event) => setManualPaymentForm({ ...manualPaymentForm, paymentReference: event.target.value })}
                                placeholder="e.g. OR-2026-00124 or bank transaction ID"
                                disabled={manualPaymentBusy}
                                className="mt-1.5 block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                              />
                            </label>
                          </div>
                          {manualPaymentError && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{manualPaymentError}</p>}
                          <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => toggleManualPayment(invoice.id, false)} disabled={manualPaymentBusy} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">Cancel</button>
                            <button
                              type="button"
                              onClick={() => void recordManualPayment(invoice)}
                              disabled={manualPaymentBusy || !manualPaymentForm.paymentReference.trim() || !manualPaymentForm.paidAt}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {manualPaymentBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                              Mark invoice paid
                            </button>
                          </div>
                        </div>
                      )}
                      {invoice.last_error && <p className="mt-3 break-words text-xs leading-5 text-red-700 dark:text-red-300">{invoice.last_error}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-white px-4 py-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">No billing invoice has been issued for this store yet.</p>
              )}
            </div>
            </>}

          </div>
        )}

        {isStorePhase && activeTab === 'branches' && (
          <div className="animate-in fade-in slide-in-from-bottom-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-800/50">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Branch Management</h4>
                  <p className="mt-1 text-sm text-gray-500">{branches.length} of {branchLimit} branch slots used under the {subscriptionStore?.subscriptionLevel || "current"} subscription.</p>
                </div>
              </div>
              <div className="mb-6">
                <div className="mb-3 flex items-end justify-between gap-4">
                  <div><h5 className="text-xs font-bold uppercase tracking-widest text-gray-500">All branch locations</h5><p className="mt-1 text-sm text-gray-500">Select a logo pin or a branch card to open that branch dashboard.</p></div>
                  <span className="text-xs font-semibold text-gray-500">{branches.length} mapped branches</span>
                </div>
                <StoreBranchesMap branches={branches} onOpenBranch={openBranchDashboard} />
              </div>
              <div className="mb-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {branches.map(branch => (
                  <button
                    key={branch.id}
                    type="button"
                    onClick={() => openBranchDashboard(branch.id)}
                    className="rounded-xl border border-gray-200 bg-white p-3 text-left transition-colors hover:border-green-500 hover:bg-green-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-green-500 dark:hover:bg-green-950/20"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-white">{branch.branchName || branch.name}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${branch.status === "suspended" ? "text-red-500" : "text-green-600"}`}>{branch.status || "active"}</span>
                    </span>
                    {branch.businessName && <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">{branch.businessName}</p>}
                    <p className="mt-1 truncate text-xs text-gray-500">{branch.address || branch.location || "No address"}</p>
                    <p className="mt-2 text-xs font-medium text-green-600">Open branch dashboard</p>
                  </button>
                ))}
              </div>
              <div className="mb-6 border-t border-gray-200 pt-5 dark:border-gray-700">
                <button
                  type="button"
                  aria-expanded={branchRequestsOpen}
                  aria-controls="admin-branch-requests"
                  onClick={() => setBranchRequestsOpen((open) => !open)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left transition-colors hover:text-gray-900 dark:hover:text-white"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-gray-500">Branch requests</span>
                    {branchRequests.filter((request) => request.status === "pending").length > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">{branchRequests.filter((request) => request.status === "pending").length} pending</span>}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-300 ease-out ${branchRequestsOpen ? "rotate-180" : "rotate-0"}`} />
                </button>
                <div id="admin-branch-requests" className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out motion-reduce:transition-none ${branchRequestsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                  <div className="min-h-0 overflow-hidden">
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
                  <div className="mt-6 space-y-3 border-t border-gray-200 pt-5 dark:border-gray-700">
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
              </div>
            </div>
          </div>
        )}

        {/* Account Management */}
        {activeTab === 'accounts' && (
          <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500 mb-1">{isStorePhase ? "Store Information" : "Branch Accounts"}</h4>
              <p className="mb-5 text-sm text-gray-500">{isStorePhase ? `Owner and staff accounts across all ${branches.length} branches.` : `Accounts with access to ${store.branchName || store.name}.`}</p>
              
              <div className="mb-6">
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Store Owner</h5>
                {owner ? (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editData.ownerName || ""}
                          onChange={e => setEditData({ ...editData, ownerName: e.target.value })}
                          className="mb-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          placeholder="Owner name"
                        />
                      ) : (
                        <p className="font-medium text-sm text-gray-900 dark:text-white">{owner.name}</p>
                      )}
                      <p className="text-xs text-gray-500">{owner.email}</p>
                      <p className="mt-1 text-xs font-medium text-gray-500">{isStorePhase ? `Owner of ${store.businessName || store.name} · ${branches.length} branch${branches.length === 1 ? "" : "es"}` : `Store owner · Access to ${store.branchName || store.name}`}</p>
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
                <h5 className="text-xs font-semibold text-gray-500 mb-3 border-b border-gray-200 dark:border-gray-700 pb-1">Staff Accounts ({(isStorePhase ? staff : branchStaff).length})</h5>
                {(isStorePhase ? staff : branchStaff).length > 0 ? (
                  <div className="space-y-2">
                    {(isStorePhase ? staff : branchStaff).map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{s.name}</p>
                          <p className="text-xs text-gray-500">{s.email}</p>
                          <span className="mt-2 inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {branches.find((branch) => branch.id === s.storeId)?.branchName || branches.find((branch) => branch.id === s.storeId)?.name || "Unassigned branch"}
                          </span>
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
            {isStorePhase && (
              <section className="overflow-hidden rounded-2xl border border-red-200 bg-red-50/70 dark:border-red-900/70 dark:bg-red-950/20">
                <div className="border-b border-red-200/80 px-6 py-4 dark:border-red-900/60">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-400">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold uppercase tracking-widest text-red-700 dark:text-red-300">Danger zone</h4>
                      <p className="mt-1 text-sm text-red-800/80 dark:text-red-200/80">Destructive store-level actions require administrator verification.</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h5 className="font-semibold text-gray-900 dark:text-white">Delete this store and every branch</h5>
                    <p className="mt-1 max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-300">Permanently removes all {branches.length} branches, store data, staff accounts, and the store owner account. This cannot be undone.</p>
                  </div>
                  <button type="button" onClick={() => openDeleteDialog("store")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700">
                    <Trash2 className="h-4 w-4" /> Delete store
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* Analytics & Logs Subpage */}
        {isStorePhase && activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div><h2 className="text-2xl font-bold text-gray-900 dark:text-white">Store-wide analytics</h2><p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Cumulative performance from all {branches.length} branches, followed by the per-branch breakdown and activity table.</p></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="mb-2 text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">Customers</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.customers}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="mb-2 text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">Promotions</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.promotions}</p>
               </div>
               <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                 <p className="mb-2 text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">Claims Scanned</p>
                 <p className="text-4xl font-black text-gray-900 dark:text-white">{analytics.claims}</p>
               </div>
              <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 text-center">
                <p className="mb-2 text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-300">Reviews</p>
                <p className="text-4xl font-black text-gray-900 dark:text-white">{reviews.length}</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{reviews.length ? `${(reviews.reduce((s, r) => s + Number(r.rating || 0), 0) / reviews.length).toFixed(1)} / 5` : "—"}</p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="mb-5"><h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">Branch performance chart</h4><p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Customers and completed scans across the whole store.</p></div>
                <div className="space-y-5">
                  {branchAnalytics.map((branch) => {
                    const scale = Math.max(1, ...branchAnalytics.flatMap((row) => [row.customers, row.claims]));
                    return <div key={branch.id}>
                      <div className="mb-2 flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{branch.name}</span><span className="text-xs text-gray-600 dark:text-gray-400">{branch.customers} customers · {branch.claims} scans</span></div>
                      <div className="space-y-1.5">
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(branch.customers ? 5 : 0, (branch.customers / scale) * 100)}%` }} /></div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-green-500" style={{ width: `${Math.max(branch.claims ? 5 : 0, (branch.claims / scale) * 100)}%` }} /></div>
                      </div>
                    </div>;
                  })}
                  {!branchAnalytics.length && <p className="py-8 text-center text-sm text-gray-600 dark:text-gray-400">No branch activity is available yet.</p>}
                </div>
                <div className="mt-5 flex flex-wrap gap-4 border-t border-gray-200 pt-4 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Customers</span><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-green-500" /> Scans</span></div>
              </section>

              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="border-b border-gray-200 p-5 dark:border-gray-700"><h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">Branch analytics table</h4><p className="mt-1 text-xs text-gray-600 dark:text-gray-400">Cumulative totals are shown above; this table provides the branch breakdown.</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full whitespace-nowrap text-left text-sm">
                    <thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-600 dark:bg-gray-900 dark:text-gray-300"><tr><th className="px-5 py-3">Branch</th><th className="px-4 py-3 text-right">Customers</th><th className="px-4 py-3 text-right">Promotions</th><th className="px-4 py-3 text-right">Scans</th><th className="px-5 py-3 text-right">Reviews</th></tr></thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">{branchAnalytics.map((branch) => <tr key={branch.id}><td className="px-5 py-3 font-semibold text-gray-900 dark:text-white">{branch.name}</td><td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{branch.customers}</td><td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{branch.promotions}</td><td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{branch.claims}</td><td className="px-5 py-3 text-right text-gray-600 dark:text-gray-300">{branch.reviews}</td></tr>)}</tbody>
                    <tfoot className="border-t-2 border-gray-300 bg-white font-bold text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"><tr><td className="px-5 py-3">All branches</td><td className="px-4 py-3 text-right">{analytics.customers}</td><td className="px-4 py-3 text-right">{analytics.promotions}</td><td className="px-4 py-3 text-right">{analytics.claims}</td><td className="px-5 py-3 text-right">{reviews.length}</td></tr></tfoot>
                  </table>
                </div>
              </section>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
               <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-black/20">
                 <h4 className="text-sm font-bold uppercase tracking-widest text-gray-600 dark:text-gray-200">System Activity Log</h4>
               </div>
               <div className="p-0 overflow-x-auto">
                 <table className="w-full text-sm text-left whitespace-nowrap">
                   <thead className="bg-gray-100 text-gray-600 dark:bg-gray-800/80 dark:text-gray-300">
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
                         <td className="px-6 py-3 text-gray-600 dark:text-gray-300">{row.actor}</td>
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

        {!isStorePhase && activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div><h2 className="text-2xl font-bold text-gray-900 dark:text-white">{store.branchName || store.name} analytics</h2><p className="mt-1 text-sm text-gray-500">Detailed engagement totals and system activity for this branch only.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[{ label: "Customers", value: selectedBranchAnalytics.customers, color: "bg-blue-500" }, { label: "Promotions", value: selectedBranchAnalytics.promotions, color: "bg-purple-500" }, { label: "Scans", value: selectedBranchAnalytics.claims, color: "bg-green-500" }, { label: "Reviews", value: selectedBranchReviews.length, color: "bg-amber-500" }].map((metric) => <div key={metric.label} className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50"><div className={`mb-4 h-1.5 w-10 rounded-full ${metric.color}`} /><p className="text-xs font-bold uppercase tracking-widest text-gray-500">{metric.label}</p><p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{metric.value}</p></div>)}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
                <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Engagement chart</h4>
                <div className="mt-6 space-y-5">{[
                  { label: "Customers", value: selectedBranchAnalytics.customers, color: "bg-blue-500" },
                  { label: "Promotions", value: selectedBranchAnalytics.promotions, color: "bg-purple-500" },
                  { label: "Scans", value: selectedBranchAnalytics.claims, color: "bg-green-500" },
                  { label: "Reviews", value: selectedBranchReviews.length, color: "bg-amber-500" },
                ].map((metric) => {
                  const maximum = Math.max(1, selectedBranchAnalytics.customers, selectedBranchAnalytics.promotions, selectedBranchAnalytics.claims, selectedBranchReviews.length);
                  return <div key={metric.label}><div className="mb-2 flex justify-between text-sm"><span className="font-semibold text-gray-700 dark:text-gray-200">{metric.label}</span><span className="text-gray-500">{metric.value}</span></div><div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className={`h-full rounded-full ${metric.color}`} style={{ width: `${Math.max(metric.value ? 5 : 0, metric.value / maximum * 100)}%` }} /></div></div>;
                })}</div>
              </section>
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
                <div className="border-b border-gray-200 p-5 dark:border-gray-700"><h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Analytics table</h4></div>
                <table className="w-full text-sm"><thead className="bg-gray-100 text-left text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900"><tr><th className="px-5 py-3">Metric</th><th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3">Branch context</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{[
                  ["Unique customers", selectedBranchAnalytics.customers, "Loyalty cards"], ["Published promotions", selectedBranchAnalytics.promotions, "All promotion records"], ["Completed scans", selectedBranchAnalytics.claims, "Staff transactions"], ["Customer reviews", selectedBranchReviews.length, selectedBranchReviews.length ? `${selectedBranchAverageRating.toFixed(1)} average` : "No ratings"],
                ].map(([label, value, context]) => <tr key={String(label)}><td className="px-5 py-4 font-semibold text-gray-900 dark:text-white">{label}</td><td className="px-5 py-4 text-right font-bold text-gray-900 dark:text-white">{value}</td><td className="px-5 py-4 text-gray-500">{context}</td></tr>)}</tbody></table>
              </section>
            </div>

            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
              <div className="border-b border-gray-200 p-5 dark:border-gray-700"><h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Branch activity log</h4></div>
              <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-gray-100 text-gray-500 dark:bg-gray-900"><tr><th className="px-6 py-3">Date</th><th className="px-6 py-3">Event</th><th className="px-6 py-3">Actor</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{paginatedActivityRows.map((row) => <tr key={row.id}><td className="px-6 py-3 font-mono text-xs text-gray-500">{row.date}</td><td className="px-6 py-3 font-medium text-gray-900 dark:text-white">{row.event}</td><td className="px-6 py-3 text-gray-500">{row.actor}</td></tr>)}</tbody></table></div>
              <Pagination page={activityPage} pageSize={ACTIVITY_LOGS_PER_PAGE} totalItems={visibleActivityRows.length} itemLabel="events" onPageChange={setActivityPage} />
            </section>
          </div>
        )}

        {!isStorePhase && activeTab === 'feedback' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <div><h2 className="text-2xl font-bold text-gray-900 dark:text-white">Ratings & Feedback</h2><p className="mt-1 text-sm text-gray-500">Customer ratings, comments, and owner response status for {store.branchName || store.name}.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50"><Star className="h-5 w-5 fill-amber-400 text-amber-400" /><p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-500">Average rating</p><p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{selectedBranchReviews.length ? selectedBranchAverageRating.toFixed(1) : "—"}</p></div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50"><MessageSquare className="h-5 w-5 text-blue-500" /><p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-500">Total reviews</p><p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{selectedBranchReviews.length}</p></div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50"><Check className="h-5 w-5 text-green-500" /><p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-500">Owner responses</p><p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{selectedBranchReviews.filter((review) => review.ownerReply).length}</p></div>
              <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50"><AlertTriangle className="h-5 w-5 text-red-500" /><p className="mt-4 text-xs font-bold uppercase tracking-widest text-gray-500">Needs attention</p><p className="mt-2 text-3xl font-black text-gray-900 dark:text-white">{selectedBranchReviews.filter((review) => Number(review.rating || 0) <= 3).length}</p></div>
            </div>

            <section className="rounded-2xl border border-gray-100 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-800/50">
              <h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Rating distribution</h4>
              <div className="mt-5 space-y-3">{selectedBranchRatingDistribution.map(({ rating, count }) => <div key={rating} className="grid grid-cols-[4rem_1fr_2rem] items-center gap-3"><span className="flex items-center gap-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{rating} <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /></span><div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-amber-400" style={{ width: `${selectedBranchReviews.length ? count / selectedBranchReviews.length * 100 : 0}%` }} /></div><span className="text-right text-sm text-gray-500">{count}</span></div>)}</div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/50">
              <div className="border-b border-gray-200 p-5 dark:border-gray-700"><h4 className="text-sm font-bold uppercase tracking-widest text-gray-500">Customer feedback table</h4></div>
              {selectedBranchReviews.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-100 text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900"><tr><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Rating</th><th className="px-5 py-3">Comment</th><th className="px-5 py-3">Response</th><th className="px-5 py-3">Date</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{selectedBranchReviews.map((review) => <tr key={review.id}><td className="px-5 py-4 font-semibold text-gray-900 dark:text-white">{review.anonymous ? "Anonymous" : review.customerName || "Customer"}</td><td className="px-5 py-4"><span className="inline-flex items-center gap-1 font-bold text-amber-600">{Number(review.rating || 0)} <Star className="h-3.5 w-3.5 fill-current" /></span></td><td className="max-w-sm px-5 py-4 text-gray-600 dark:text-gray-300"><p className="line-clamp-3">{review.comment || "No written comment"}</p></td><td className="px-5 py-4">{review.ownerReply ? <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700 dark:bg-green-950/40 dark:text-green-300">Responded</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">Awaiting response</span>}</td><td className="px-5 py-4 text-xs text-gray-500">{formatPhilippineDateTime(review.createdAt)}</td></tr>)}</tbody></table></div> : <div className="p-12 text-center"><MessageSquare className="mx-auto h-10 w-10 text-gray-300" /><p className="mt-3 font-semibold text-gray-900 dark:text-white">No ratings or feedback yet</p><p className="mt-1 text-sm text-gray-500">Customer reviews for this branch will appear here.</p></div>}
            </section>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={pendingRestrictionAction !== null}
        title={pendingRestrictionAction === "suspend" ? "Suspend this store administratively?" : "Lift the administrative suspension?"}
        description={pendingRestrictionAction === "suspend"
          ? "The owner and every staff member will immediately lose portal access. Payments will not restore access; only an administrator can lift this suspension."
          : "The separate administrative restriction will be removed. Normal billing warning, grace, or frozen rules may still apply."}
        confirmLabel={pendingRestrictionAction === "suspend" ? "Suspend access" : "Lift suspension"}
        tone={pendingRestrictionAction === "suspend" ? "danger" : "default"}
        isLoading={restrictionBusy}
        onClose={() => !restrictionBusy && setPendingRestrictionAction(null)}
        onConfirm={() => void updateAccountRestriction(pendingRestrictionAction === "suspend" ? "suspended" : "active")}
      />

      {pendingSubscriptionAccessAction && subscriptionAccessConfirmation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-200 dark:bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="subscription-action-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !subscriptionAccessBusy) setPendingSubscriptionAccessAction(null);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="p-6 sm:p-7">
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  pendingSubscriptionAccessAction === "frozen" ? "bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400" :
                  pendingSubscriptionAccessAction === "grace" ? "bg-orange-100 text-orange-600 dark:bg-orange-950/60 dark:text-orange-400" :
                  pendingSubscriptionAccessAction === "warning" ? "bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400" :
                  "bg-green-100 text-green-600 dark:bg-green-950/60 dark:text-green-400"
                }`}>
                  {pendingSubscriptionAccessAction === "frozen" ? <Snowflake className="h-6 w-6" /> :
                   pendingSubscriptionAccessAction === "grace" ? <Clock3 className="h-6 w-6" /> :
                   pendingSubscriptionAccessAction === "warning" ? <BellRing className="h-6 w-6" /> :
                   <RotateCcw className="h-6 w-6" />}
                </div>
                <div>
                  <h3 id="subscription-action-title" className="text-xl font-bold text-gray-900 dark:text-white">{subscriptionAccessConfirmation.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{subscriptionAccessConfirmation.description}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Store: {subscriptionStore?.businessName || subscriptionStore?.name}</p>
                </div>
              </div>

              {subscriptionAccessError && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{subscriptionAccessError}</p>}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={subscriptionAccessBusy}
                  onClick={() => setPendingSubscriptionAccessAction(null)}
                  className="rounded-lg bg-gray-100 px-3.5 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={subscriptionAccessBusy}
                  onClick={confirmSubscriptionAccessUpdate}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    pendingSubscriptionAccessAction === "frozen" ? "bg-red-600 hover:bg-red-700" :
                    pendingSubscriptionAccessAction === "grace" ? "bg-orange-500 hover:bg-orange-600" :
                    pendingSubscriptionAccessAction === "warning" ? "bg-amber-500 text-amber-950 hover:bg-amber-400" :
                    "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {subscriptionAccessBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {subscriptionAccessBusy ? "Wait..." : subscriptionAccessConfirmation.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-target-title"
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
                  <h3 id="delete-target-title" className="text-xl font-bold text-gray-900 dark:text-white">Delete {deleteTargetName}?</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {deleteScope === "store"
                      ? `This permanently deletes the entire store, all ${branches.length} branches, branch data, staff accounts, and the store owner account.`
                      : "This permanently deletes this branch, its staff accounts, customer activity, promotions, reviews, and uploaded files."} Re-authentication is required. This action cannot be undone.
                  </p>
                </div>
              </div>
           
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Type the {deleteScope} name exactly
                  </label>
                  <input
                    type="text"
                    value={deleteNameConfirmation}
                    onChange={(event) => {
                      setDeleteNameConfirmation(event.target.value);
                      if (deleteError) setDeleteError("");
                    }}
                    disabled={isDeleting}
                    placeholder={deleteTargetName}
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

                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">Confirm your administrator password</label>
                  <div className="relative mt-2">
                    <input
                      type={showDeletePassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={deletePassword}
                      onChange={(event) => {
                        setDeletePassword(event.target.value);
                        if (deleteError) setDeleteError("");
                      }}
                      disabled={isDeleting}
                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-12 text-sm text-gray-900 outline-none transition-colors focus:border-red-300 focus:ring-2 focus:ring-red-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    <PasswordVisibilityButton visible={showDeletePassword} onToggle={() => setShowDeletePassword((visible) => !visible)} label="administrator password" className="focus-visible:ring-red-500" />
                  </div>
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
                  Keep {deleteScope}
                </button>
                <button
                  type="button"
                  disabled={!canConfirmDelete}
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {isDeleting ? "Deleting..." : deleteScope === "store" ? "Delete store and branches" : "Delete branch"}
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
                  <div className="relative">
                    <input type={showCustomPassword ? "text" : "password"} autoComplete="new-password" value={customPassword} onChange={e => setCustomPassword(sanitizePasswordInput(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-2 pr-11 rounded-lg text-sm" placeholder="Enter new password (no spaces)" />
                    <PasswordVisibilityButton visible={showCustomPassword} onToggle={() => setShowCustomPassword((visible) => !visible)} label="custom password" />
                  </div>
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
