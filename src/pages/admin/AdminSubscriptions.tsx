import React, { useEffect, useState } from "react";
import { collection, deleteField, doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { ArrowDown, ArrowUp, Check, ChevronDown, CreditCard, Edit3, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { CustomDropdown } from "../../components/CustomDropdown";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { ScrollableRegion } from "../../components/ScrollableRegion";
import { Pagination } from "../../components/Pagination";
import { useCollectionPagination } from "../../hooks/useCollectionPagination";
import { useAuth } from "../../contexts/AuthContext";
import { invokeAdminBackend } from "../../lib/adminBackend";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  formatSubscriptionLimit,
  getPreferredSubscriptionPlanIndex,
  getSubscriptionGalleryPhotoLimit,
  getNextPaymentDate,
  getSubscriptionDependencies,
  getSubscriptionOwedAmount,
  moveSubscriptionPlanTier,
  normalizePreferredSubscriptionPlans,
  normalizeSubscriptionTierHierarchy,
  normalizeSubscriptionDependencies,
  setPreferredSubscriptionPlan,
  validateSubscriptionTierHierarchy,
} from "../../lib/subscriptionBilling";

export default function AdminSubscriptions() {
  const { user } = useAuth();
  const canManagePlans =
    user?.role === "admin"
    || user?.role === "assistant_admin"
    || user?.role === "auditor";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(
    normalizeSubscriptionTierHierarchy(DEFAULT_SUBSCRIPTION_PLANS),
  );
  const [originalPlans, setOriginalPlans] = useState<SubscriptionPlan[]>(
    normalizeSubscriptionTierHierarchy(DEFAULT_SUBSCRIPTION_PLANS),
  );
  const [expandedDependencies, setExpandedDependencies] = useState<Record<string, boolean>>({});
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [pendingSaveStores, setPendingSaveStores] = useState<Record<string, any>[]>([]);
  const [affectedSubscriptionCount, setAffectedSubscriptionCount] = useState(0);
  const [showSaveConfirmation, setShowSaveConfirmation] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    async function loadPlans() {
      try {
        const docRef = doc(db, "settings", "subscriptions");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const loadedPlans = normalizeSubscriptionTierHierarchy(docSnap.data().plans || []);
          setPlans(loadedPlans);
          setOriginalPlans(loadedPlans);
        } else if (canManagePlans) {
          await setDoc(docRef, { plans, updatedAt: serverTimestamp() });
        }
      } catch (error) {
        console.error("Error loading subscription config:", error);
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, [canManagePlans]);

  const prepareSave = async () => {
    if (!canManagePlans || saving) return;
    const errors = validateSubscriptionTierHierarchy(plans);
    setValidationErrors(errors);
    setStatusMessage("");
    if (errors.length > 0) return;

    setSaving(true);
    try {
      const storeSnap = await getDocs(collection(db, "stores"));
      const stores = storeSnap.docs.map((storeDoc) => ({ id: storeDoc.id, ...storeDoc.data() }));
      const configuredPlanNames = new Set(
        plans.map((plan) => String(plan.name || "").trim().toLocaleLowerCase()),
      );
      const affectedCount = stores.filter((store) =>
        store.isPrimaryBranch !== false
        && configuredPlanNames.has(String(store.subscriptionLevel || "").trim().toLocaleLowerCase())
      ).length;
      setPendingSaveStores(stores);
      setAffectedSubscriptionCount(affectedCount);
      setShowSaveConfirmation(true);
    } catch (error) {
      console.error(error);
      setValidationErrors(["The hierarchy impact could not be calculated. Try again."]);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!canManagePlans) return;
    const orderedPlans = normalizePreferredSubscriptionPlans(
      normalizeSubscriptionTierHierarchy(plans),
    );
    setSaving(true);
    try {
      await setDoc(
        doc(db, "settings", "subscriptions"),
        { plans: orderedPlans, updatedAt: serverTimestamp() },
        { merge: true },
      );

      await Promise.all(pendingSaveStores.map(async (store) => {
        if (store.isPrimaryBranch === false) {
          await updateDoc(doc(db, "stores", store.id), {
            subscriptionLevel: deleteField(),
            subscriptionDependencies: deleteField(),
            subscriptionStart: deleteField(),
            subscriptionEnd: deleteField(),
            paymentSchedule: deleteField(),
            owedAmount: deleteField(),
            pendingOwedAmount: deleteField(),
            pendingOwedAmountEffectiveAt: deleteField(),
            updatedAt: serverTimestamp(),
          });
          return;
        }

        const subscriptionLevel = String(store.subscriptionLevel || "");
        const previousAmount = getSubscriptionOwedAmount(originalPlans, subscriptionLevel, Number(store.owedAmount || 0));
        const nextAmount = getSubscriptionOwedAmount(orderedPlans, subscriptionLevel, previousAmount);
        const dependencies = getSubscriptionDependencies(orderedPlans, subscriptionLevel);
        const nextPaymentDate = getNextPaymentDate(store.paymentSchedule, store.subscriptionStart, store.subscriptionEnd);
        const currentAmount = Number(store.owedAmount);
        const updates: Record<string, unknown> = {
          subscriptionDependencies: dependencies,
          updatedAt: serverTimestamp(),
        };

        if (store.ownerId) {
          await updateDoc(doc(db, "users", String(store.ownerId)), {
            branchLimit: dependencies.branchLimit > 0 ? dependencies.branchLimit : 100,
            updatedAt: serverTimestamp(),
          }).catch(() => undefined);
        }

        if (nextAmount !== previousAmount || nextAmount !== currentAmount) {
          if (nextPaymentDate) {
            updates.owedAmount = Number.isFinite(currentAmount) ? currentAmount : previousAmount;
            updates.pendingOwedAmount = nextAmount;
            updates.pendingOwedAmountEffectiveAt = nextPaymentDate;
          } else {
            updates.pendingOwedAmount = nextAmount;
            updates.pendingOwedAmountEffectiveAt = deleteField();
          }
        } else {
          updates.pendingOwedAmount = deleteField();
          updates.pendingOwedAmountEffectiveAt = deleteField();
        }

        await updateDoc(doc(db, "stores", store.id), updates);
        if (store.subscriptionAccess?.automationEnabled === true) {
          await invokeAdminBackend({ action: "sync_subscription_billing", storeId: store.id });
        }
      }));
      setPlans(orderedPlans);
      setOriginalPlans(orderedPlans);
      setIsEditing(false);
      setShowSaveConfirmation(false);
      setPendingSaveStores([]);
      setStatusMessage("Subscription hierarchy saved successfully.");
    } catch (error) {
      console.error(error);
      setValidationErrors(["Failed to save the subscription hierarchy."]);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setPlans(originalPlans);
    setValidationErrors([]);
    setStatusMessage("");
    setIsEditing(false);
  };

  const handleAddPlan = () => {
    const nextRank = plans.reduce(
      (highest, plan) => Math.max(highest, Number(plan.tierRank) || 0),
      -10,
    ) + 10;
    setPlans(normalizeSubscriptionTierHierarchy([
      ...plans,
      {
        id: `plan_${Date.now()}`,
        name: "New Plan",
        price: 0,
        tierRank: nextRank,
        interval: "month",
        preferred: plans.length === 0,
        features: ["New feature"],
        dependencies: { customerLimit: 0, staffLimit: 1, branchLimit: 1, galleryPhotoLimit: 3 },
      },
    ]));
  };

  const handleMovePlan = (planId: string, direction: "lower" | "higher") => {
    setPlans((current) => moveSubscriptionPlanTier(current, planId, direction));
    setValidationErrors([]);
  };

  const handleRemovePlan = (index: number) => {
    setPlans((current) =>
      normalizePreferredSubscriptionPlans(current.filter((_, planIndex) => planIndex !== index)),
    );
  };

  const handlePreferredPlanChange = (index: number) => {
    setPlans((current) => setPreferredSubscriptionPlan(current, index));
  };

  const handlePlanChange = (index: number, field: string, value: unknown) => {
    const newPlans = [...plans];
    newPlans[index] = { ...newPlans[index], [field]: value };
    setPlans(newPlans);
  };

  const handleFeatureChange = (planIndex: number, featureIndex: number, value: string) => {
    const newPlans = [...plans];
    const features = [...(newPlans[planIndex].features || [])];
    features[featureIndex] = value;
    newPlans[planIndex] = { ...newPlans[planIndex], features };
    setPlans(newPlans);
  };

  const handleAddFeature = (planIndex: number) => {
    const newPlans = [...plans];
    newPlans[planIndex] = {
      ...newPlans[planIndex],
      features: [...(newPlans[planIndex].features || []), "New Feature"],
    };
    setPlans(newPlans);
  };

  const handleRemoveFeature = (planIndex: number, featureIndex: number) => {
    const newPlans = [...plans];
    const features = [...(newPlans[planIndex].features || [])];
    features.splice(featureIndex, 1);
    newPlans[planIndex] = { ...newPlans[planIndex], features };
    setPlans(newPlans);
  };

  const handleDependencyChange = (planIndex: number, field: string, value: number) => {
    const newPlans = [...plans];
    newPlans[planIndex] = {
      ...newPlans[planIndex],
      dependencies: {
        ...normalizeSubscriptionDependencies(newPlans[planIndex].dependencies),
        [field]: Math.max(0, value),
      },
    };
    setPlans(newPlans);
  };

  const getPlanKey = (plan: SubscriptionPlan, planIndex: number) => plan.id || `plan-${planIndex}`;

  const toggleDependencies = (planKey: string) => {
    setExpandedDependencies((current) => ({
      ...current,
      [planKey]: !current[planKey],
    }));
  };

  const planPagination = useCollectionPagination(plans, 6);

  if (loading) return <PageSkeleton variant="subscriptions" />;

  return (
    <>
    <div className="flex h-full flex-col animate-in fade-in duration-300">
      <div className="sticky top-0 z-10 flex flex-col gap-4 border-b border-gray-100 bg-gray-50/50 p-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-3">
          <CreditCard className="h-5 w-5 shrink-0 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Subscription Offers</h3>
        </div>

        {isEditing && canManagePlans ? (
          <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
            <button onClick={handleCancel} disabled={saving} className="flex min-w-0 items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-[#1b1b1b] transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 sm:px-4">
              <X className="h-4 w-4" /> Cancel
            </button>
            <button onClick={handleAddPlan} disabled={saving} className="flex min-w-0 items-center justify-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-[#1b1b1b] transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 sm:px-4">
              <Plus className="h-4 w-4" /> Add Plan
            </button>
            <button onClick={prepareSave} disabled={saving} className="col-span-2 flex min-w-0 items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100 sm:col-span-1 sm:px-4">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        ) : canManagePlans ? (
          <button onClick={() => setIsEditing(true)} className="flex items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100">
            <Edit3 className="h-4 w-4" /> Edit Offers
          </button>
        ) : (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            Read-only hierarchy review
          </span>
        )}
      </div>

      <div className="p-4 sm:p-6">
        <p className="mb-8 max-w-2xl text-gray-500 dark:text-gray-400">
          {isEditing
            ? "Configure subscription offers and the limits each plan unlocks. Price changes are queued for existing stores and only apply on each store owner's next payment schedule."
            : "Preview the subscription offers as clients will see them. Expand a plan to review the limits it unlocks."}
        </p>

        <section className="mb-6 rounded-2xl border border-teal-200 bg-teal-50/70 p-5 dark:border-teal-900/60 dark:bg-teal-950/20">
          <h4 className="font-bold text-teal-950 dark:text-teal-100">Tier hierarchy</h4>
          <p className="mt-1 text-sm leading-6 text-teal-800 dark:text-teal-200">
            Plans are ordered from lowest to highest tier. A client can only move to a higher-ranked, higher-priced plan with the same billing interval.
          </p>
          {!canManagePlans && (
            <p className="mt-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
              Auditor access is read-only. Administrators declare and save the commercial hierarchy.
            </p>
          )}
        </section>

        {validationErrors.length > 0 && (
          <div role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
            <p className="font-bold">Resolve these hierarchy issues before saving:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}
        {statusMessage && (
          <p role="status" className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-semibold text-green-800 dark:border-green-900/60 dark:bg-green-950/30 dark:text-green-200">
            {statusMessage}
          </p>
        )}

        <ScrollableRegion label="Subscription plans" className="grid grid-cols-1 items-start gap-6 pr-1 md:grid-cols-2 lg:grid-cols-3">
          {planPagination.pageItems.map((plan) => {
            const planIndex = plans.indexOf(plan);
            const planKey = getPlanKey(plan, planIndex);
            const dependenciesId = `plan-dependencies-${planKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
            const dependenciesOpen = Boolean(expandedDependencies[planKey]);
            const dependencies = normalizeSubscriptionDependencies(plan.dependencies);
            const isPreferred = getPreferredSubscriptionPlanIndex(plans) === planIndex;
            const tierLabel =
              planIndex === 0
                ? "Lowest tier"
                : planIndex === plans.length - 1
                  ? "Highest tier"
                  : `Higher tier ${planIndex + 1}`;

            return (
              <div key={planKey} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-gray-600">
                {isEditing && canManagePlans && (
                  <button onClick={() => handleRemovePlan(planIndex)} aria-label={`Remove ${plan.name || "plan"}`} className="absolute right-4 top-4 z-[1] rounded-lg bg-gray-100 p-2 text-red-500 transition-colors hover:bg-red-50 dark:bg-gray-800 dark:hover:bg-red-500/10">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}

                <div className="space-y-4 border-b border-gray-100 p-6 dark:border-gray-800">
                  <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3 dark:border-teal-900/60 dark:bg-teal-950/20">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">{tierLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-teal-950 dark:text-teal-100">Tier {Number(plan.tierRank)}</p>
                      </div>
                      {isEditing && canManagePlans && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            aria-label={`Move ${plan.name || "plan"} lower`}
                            disabled={planIndex === 0}
                            onClick={() => handleMovePlan(String(plan.id), "lower")}
                            className="rounded-lg border border-teal-200 bg-white p-2 text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-35 dark:border-teal-800 dark:bg-gray-900 dark:text-teal-200 dark:hover:bg-teal-950"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${plan.name || "plan"} higher`}
                            disabled={planIndex === plans.length - 1}
                            onClick={() => handleMovePlan(String(plan.id), "higher")}
                            className="rounded-lg border border-teal-200 bg-white p-2 text-teal-800 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-35 dark:border-teal-800 dark:bg-gray-900 dark:text-teal-200 dark:hover:bg-teal-950"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <div className="pr-10">
                        <label className="mb-1 block text-xs font-semibold text-gray-500">Plan Name</label>
                        <input type="text" value={plan.name || ""} onChange={(event) => handlePlanChange(planIndex, "name", event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-bold text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-500">Price</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-400">₱</span>
                            <input type="number" value={plan.price ?? 0} onChange={(event) => handlePlanChange(planIndex, "price", Number(event.target.value))} className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-7 pr-3 font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-gray-500">Interval</label>
                          <CustomDropdown
                            value={plan.interval || "month"}
                            onChange={(value) => handlePlanChange(planIndex, "interval", value)}
                            options={[
                              { label: "/ month", value: "month" },
                              { label: "/ year", value: "year" },
                              { label: "One Time", value: "one-time" },
                            ]}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        role="radio"
                        aria-label={`Preferred plan: ${plan.name || "Untitled plan"}`}
                        aria-checked={isPreferred}
                        onClick={() => handlePreferredPlanChange(planIndex)}
                        className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                          isPreferred
                            ? "border-green-500 bg-green-50 text-green-800 dark:bg-green-500/15 dark:text-green-200"
                            : "border-gray-200 text-gray-600 hover:border-green-400 dark:border-gray-700 dark:text-gray-300"
                        }`}
                      >
                        <span>Preferred plan</span>
                        <span
                          aria-hidden="true"
                          className={`h-4 w-4 rounded-full border-4 ${
                            isPreferred ? "border-green-600 bg-white" : "border-gray-300 bg-white"
                          }`}
                        />
                      </button>
                    </>
                  ) : (
                    <div className="py-2 text-center">
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">{plan.name || "Untitled plan"}</p>
                      <div className="mt-4 flex items-end justify-center gap-1 text-gray-900 dark:text-white">
                        <span className="mb-1 text-xl font-semibold">₱</span>
                        <span className="text-5xl font-bold tracking-tight">{Number(plan.price || 0).toLocaleString("en-PH")}</span>
                      </div>
                      <p className="mt-2 text-sm text-gray-500">{formatSubscriptionInterval(plan.interval)}</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50/50 p-6 dark:bg-gray-900/30">
                  <div className="mb-4 flex items-center justify-between">
                    <h5 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Features</h5>
                    {isEditing && canManagePlans && <button onClick={() => handleAddFeature(planIndex)} className="text-xs font-medium text-[#1b1b1b] hover:text-black dark:text-white">Add</button>}
                  </div>

                  <div className="space-y-3">
                    {(plan.features || []).map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-500/10">
                          <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        </span>
                        {isEditing && canManagePlans ? (
                          <>
                            <input type="text" value={feature} onChange={(event) => handleFeatureChange(planIndex, featureIndex, event.target.value)} className="flex-1 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800" />
                            <button onClick={() => handleRemoveFeature(planIndex, featureIndex)} aria-label={`Remove ${feature}`} className="p-1 text-gray-400 hover:text-red-500">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="text-sm text-gray-700 dark:text-gray-200">{feature}</span>
                        )}
                      </div>
                    ))}
                    {(plan.features || []).length === 0 && (
                      <p className="text-sm italic text-gray-500">No features listed.</p>
                    )}
                  </div>

                  <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => toggleDependencies(planKey)}
                      aria-expanded={dependenciesOpen}
                      aria-controls={dependenciesId}
                      className="flex w-full items-center justify-between rounded-lg py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    >
                      <span>
                        <span className="block text-xs font-semibold uppercase tracking-widest text-gray-500">Plan dependencies</span>
                        <span className="mt-1 block text-xs text-gray-500">Limits included with this offer</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform duration-300 ease-out motion-reduce:transition-none ${dependenciesOpen ? "rotate-180" : "rotate-0"}`} />
                    </button>

                    <div
                      id={dependenciesId}
                      aria-hidden={!dependenciesOpen}
                      inert={!dependenciesOpen}
                      className={`grid transition-[grid-template-rows,opacity] duration-500 ease-in-out motion-reduce:transition-none ${dependenciesOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                    >
                      <div className="overflow-hidden">
                        <div className="grid grid-cols-1 gap-3 pt-4">
                          {isEditing && canManagePlans ? (
                            <>
                              <DependencyInput label="Customers" value={dependencies.customerLimit} onChange={(value) => handleDependencyChange(planIndex, "customerLimit", value)} />
                              <DependencyInput label="Staff accounts" value={dependencies.staffLimit} onChange={(value) => handleDependencyChange(planIndex, "staffLimit", value)} />
                              <DependencyInput label="Branches" value={dependencies.branchLimit} onChange={(value) => handleDependencyChange(planIndex, "branchLimit", value)} />
                              <DependencyInput label="Gallery photos" min={3} max={10} value={getSubscriptionGalleryPhotoLimit(plan.dependencies)} onChange={(value) => handleDependencyChange(planIndex, "galleryPhotoLimit", Math.max(3, Math.min(10, value)))} />
                            </>
                          ) : (
                            <>
                              <DependencyValue label="Customers" value={formatSubscriptionLimit(dependencies.customerLimit, "customers")} />
                              <DependencyValue label="Staff accounts" value={formatSubscriptionLimit(dependencies.staffLimit, "staff")} />
                              <DependencyValue label="Branches" value={formatSubscriptionLimit(dependencies.branchLimit, "branches")} />
                              <DependencyValue label="Gallery photos" value={`${getSubscriptionGalleryPhotoLimit(plan.dependencies)} photos`} />
                            </>
                          )}
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                          {formatSubscriptionLimit(dependencies.customerLimit, "customers")} / {formatSubscriptionLimit(dependencies.staffLimit, "staff")} / {formatSubscriptionLimit(dependencies.branchLimit, "branches")} / {getSubscriptionGalleryPhotoLimit(plan.dependencies)} gallery photos
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {plans.length === 0 && (
            <div className="col-span-full rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center dark:border-gray-800">
              <CreditCard className="mx-auto mb-3 h-12 w-12 text-gray-400" />
              <p className="text-gray-500">No subscription plans configured.</p>
              {isEditing && canManagePlans ? (
                <button onClick={handleAddPlan} className="mt-4 rounded-xl bg-gray-100 px-4 py-2 font-medium text-[#1b1b1b] hover:bg-gray-200">Create First Plan</button>
              ) : canManagePlans ? (
                <button onClick={() => setIsEditing(true)} className="mt-4 rounded-xl bg-[#1b1b1b] px-4 py-2 font-medium text-white hover:bg-black dark:bg-white dark:text-[#1b1b1b]">Edit Offers</button>
              ) : (
                <p className="mt-3 text-sm text-gray-500">An administrator must create the first plan.</p>
              )}
            </div>
          )}
        </ScrollableRegion>
        <Pagination page={planPagination.page} pageSize={planPagination.pageSize} totalItems={planPagination.totalItems} onPageChange={planPagination.setPage} itemLabel="plans" />
      </div>
    </div>
    <ConfirmationModal
      isOpen={showSaveConfirmation}
      title="Confirm subscription hierarchy"
      description={`${affectedSubscriptionCount} existing primary subscription${affectedSubscriptionCount === 1 ? "" : "s"} may be affected. Future upgrade choices will follow: ${plans.map((plan) => `${plan.name} (tier ${plan.tierRank})`).join(" → ")}. Existing invoices and PayMongo payment links will not change.`}
      confirmLabel="Save hierarchy"
      cancelLabel="Review again"
      isLoading={saving}
      tone="default"
      onConfirm={handleSave}
      onClose={() => {
        if (!saving) setShowSaveConfirmation(false);
      }}
    />
    </>
  );
}

function formatSubscriptionInterval(interval?: string) {
  if (interval === "one-time") return "one-time payment";
  return `per ${interval || "month"}`;
}

function DependencyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <span className="text-right text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function DependencyInput({ label, value, onChange, min = 0, max }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number }) {
  return (
    <label className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
      <span className="font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-right font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
    </label>
  );
}
