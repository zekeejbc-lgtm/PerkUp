import React, { useState, useEffect } from "react";
import { collection, deleteField, doc, getDoc, getDocs, setDoc, serverTimestamp, updateDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { CreditCard, Save, Loader2, Check, Plus, Trash2 } from "lucide-react";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { CustomDropdown } from "../../components/CustomDropdown";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  SubscriptionPlan,
  formatSubscriptionLimit,
  getNextPaymentDate,
  getSubscriptionDependencies,
  getSubscriptionOwedAmount,
  normalizeSubscriptionDependencies,
} from "../../lib/subscriptionBilling";

export default function AdminSubscriptions() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);
  const [originalPlans, setOriginalPlans] = useState<SubscriptionPlan[]>(DEFAULT_SUBSCRIPTION_PLANS);

  useEffect(() => {
    async function loadPlans() {
      try {
        const docRef = doc(db, "settings", "subscriptions");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const loadedPlans = docSnap.data().plans || [];
          setPlans(loadedPlans);
          setOriginalPlans(loadedPlans);
        } else {
          // Initialize if it doesn't exist
          await setDoc(docRef, { plans, updatedAt: serverTimestamp() });
        }
      } catch (error) {
        console.error("Error loading subscription config:", error);
      } finally {
        setLoading(false);
      }
    }
    loadPlans();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const storeSnap = await getDocs(collection(db, "stores"));
      const stores = storeSnap.docs.map((storeDoc) => ({ id: storeDoc.id, ...storeDoc.data() }));
      await setDoc(doc(db, "settings", "subscriptions"), { plans, updatedAt: serverTimestamp() }, { merge: true });

      await Promise.all(stores.map(async (store) => {
        const subscriptionLevel = String(store.subscriptionLevel || "");
        const previousAmount = getSubscriptionOwedAmount(originalPlans, subscriptionLevel, Number(store.owedAmount || 0));
        const nextAmount = getSubscriptionOwedAmount(plans, subscriptionLevel, previousAmount);
        const dependencies = getSubscriptionDependencies(plans, subscriptionLevel);
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
      }));
      setOriginalPlans(plans);
      alert("Subscription plans saved successfully.");
    } catch (error) {
      console.error(error);
      alert("Failed to save plans.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddPlan = () => {
    setPlans([
      ...plans,
      {
        id: `plan_${Date.now()}`,
        name: "New Plan",
        price: 0,
        interval: "month",
        features: ["New feature"],
        dependencies: { customerLimit: 0, staffLimit: 1, branchLimit: 1 },
      }
    ]);
  };

  const handleRemovePlan = (index: number) => {
    const newPlans = [...plans];
    newPlans.splice(index, 1);
    setPlans(newPlans);
  };

  const handlePlanChange = (index: number, field: string, value: any) => {
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
    newPlans[planIndex].features = [...(newPlans[planIndex].features || []), "New Feature"];
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

  if (loading) return <PageSkeleton variant="subscriptions" />;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <div className="p-4 sm:p-6 border-b border-gray-100 dark:border-gray-800 flex flex-col gap-4 bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <CreditCard className="w-5 h-5 shrink-0 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Subscription Offers</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button onClick={handleAddPlan} className="flex min-w-0 items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl text-[#1b1b1b] bg-gray-100 dark:bg-white/10 dark:text-white hover:bg-gray-200 transition-colors sm:px-4">
            <Plus className="w-4 h-4" /> Add Plan
          </button>
          <button onClick={handleSave} disabled={saving} className="flex min-w-0 items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-xl text-white bg-[#1b1b1b] hover:bg-black transition-colors disabled:opacity-50 sm:px-4 dark:bg-white dark:text-[#1b1b1b] dark:hover:bg-gray-100">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-2xl">
          Configure subscription offers and the limits each plan unlocks. Price changes are queued for existing stores and only apply on each store owner's next payment schedule.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {plans.map((plan, planIndex) => (
            <div key={planIndex} className="bg-white dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden group">
              <button onClick={() => handleRemovePlan(planIndex)} className="absolute top-4 right-4 p-2 bg-gray-100 dark:bg-gray-800 text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>

              <div className="p-6 border-b border-gray-100 dark:border-gray-800 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Plan Name</label>
                  <input type="text" value={plan.name} onChange={e => handlePlanChange(planIndex, 'name', e.target.value)} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-3 py-2 rounded-lg font-bold text-gray-900 dark:text-white" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Price</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400">₱</span>
                      <input type="number" value={plan.price} onChange={e => handlePlanChange(planIndex, 'price', Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 pl-7 pr-3 py-2 rounded-lg font-medium text-gray-900 dark:text-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Interval</label>
                    <CustomDropdown
                      value={plan.interval}
                      onChange={(value) => handlePlanChange(planIndex, "interval", value)}
                      options={[
                        { label: "/ month", value: "month" },
                        { label: "/ year", value: "year" },
                        { label: "One Time", value: "one-time" },
                      ]}
                    />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50/50 dark:bg-gray-900/30">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="text-xs font-semibold uppercase tracking-widest text-gray-500">Features</h5>
                  <button onClick={() => handleAddFeature(planIndex)} className="text-xs font-medium text-[#1b1b1b] hover:text-black dark:text-white">Add</button>
                </div>

                <div className="space-y-2">
                  {(plan.features || []).map((feature: string, featureIndex: number) => (
                    <div key={featureIndex} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500 shrink-0" />
                      <input type="text" value={feature} onChange={e => handleFeatureChange(planIndex, featureIndex, e.target.value)} className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1.5 rounded-md text-sm" />
                      <button onClick={() => handleRemoveFeature(planIndex, featureIndex)} className="text-gray-400 hover:text-red-500 p-1">
                        <X_Icon />
                      </button>
                    </div>
                  ))}
                  {(plan.features || []).length === 0 && (
                    <p className="text-sm text-gray-500 italic">No features listed.</p>
                  )}
                </div>

                <div className="mt-5 border-t border-gray-200 pt-5 dark:border-gray-700">
                  <h5 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">Dependencies</h5>
                  <div className="grid grid-cols-1 gap-3">
                    <DependencyInput label="Customers" value={normalizeSubscriptionDependencies(plan.dependencies).customerLimit} onChange={(value) => handleDependencyChange(planIndex, "customerLimit", value)} />
                    <DependencyInput label="Staff accounts" value={normalizeSubscriptionDependencies(plan.dependencies).staffLimit} onChange={(value) => handleDependencyChange(planIndex, "staffLimit", value)} />
                    <DependencyInput label="Branches" value={normalizeSubscriptionDependencies(plan.dependencies).branchLimit} onChange={(value) => handleDependencyChange(planIndex, "branchLimit", value)} />
                  </div>
                  <p className="mt-3 text-xs text-gray-500">
                    {formatSubscriptionLimit(normalizeSubscriptionDependencies(plan.dependencies).customerLimit, "customers")} / {formatSubscriptionLimit(normalizeSubscriptionDependencies(plan.dependencies).staffLimit, "staff")} / {formatSubscriptionLimit(normalizeSubscriptionDependencies(plan.dependencies).branchLimit, "branches")}
                  </p>
                </div>
              </div>

            </div>
          ))}

          {plans.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-2xl">
              <CreditCard className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No subscription plans configured.</p>
              <button onClick={handleAddPlan} className="mt-4 px-4 py-2 bg-gray-100 text-[#1b1b1b] font-medium rounded-xl hover:bg-gray-200">Create First Plan</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DependencyInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
      <span className="font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-right font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
      />
    </label>
  );
}

function X_Icon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  )
}
