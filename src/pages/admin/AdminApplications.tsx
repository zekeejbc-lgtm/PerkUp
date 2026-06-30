import React, { useState, useEffect } from "react";
import { collection, getDocs, doc, getDoc } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import { Ban, X, FileText, Upload, Image as ImageIcon } from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatMoney,
  getSubscriptionOwedAmount,
  PAYMENT_SCHEDULE_OPTIONS,
  toDateInputValue,
} from "../../lib/subscriptionBilling";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { ImageCropEditor } from "../../components/ImageCropEditor";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { validateStrongPassword } from "../../lib/passwordStrength";

export default function AdminApplications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);

  // New store form state
  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeCoordinates, setStoreCoordinates] = useState<[number, number] | null>(null);
  const [storeLogo, setStoreLogo] = useState("");
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoEditorFile, setLogoEditorFile] = useState<File | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoEditorFile(file);
    e.target.value = "";
  };
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [subLevel, setSubLevel] = useState("Standard");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("every_30_days");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const billingPlans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const selectedOwedAmount = getSubscriptionOwedAmount(billingPlans, subLevel);

  useEffect(() => {
    async function fetchApplications() {
      setLoadingApps(true);
      try {
        const snap = await getDocs(collection(db, "applications"));
        setApplications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        
        const subDoc = await getDoc(doc(db, "settings", "subscriptions"));
        if (subDoc.exists() && subDoc.data().plans) {
          setSubscriptionPlans(subDoc.data().plans);
          if (subDoc.data().plans.length > 0) {
             setSubLevel(subDoc.data().plans[0].name);
          }
        }
      } catch (error) {
        setApplications([]);
      } finally {
        setLoadingApps(false);
      }
    }
    fetchApplications();
  }, []);

  const handleApproveApplication = (app: any) => {
    setStoreName(app.businessName);
    setOwnerName(app.applicantName);
    setOwnerEmail(app.email);
    setStoreLocation(app.address || "");
    const applicationCoordinates = Array.isArray(app.coordinates) ? app.coordinates.map(Number) : null;
    setStoreCoordinates(
      applicationCoordinates?.length === 2 &&
      applicationCoordinates.every(Number.isFinite)
        ? [applicationCoordinates[0], applicationCoordinates[1]]
        : null
    );
    setStoreLogo(app.logoUrl || "");
    setPendingLogo(null);
    setSubLevel(app.subscriptionLevel || "Standard");
    setSubStart(toDateInputValue(app.subscriptionStart));
    setSubEnd(toDateInputValue(app.subscriptionEnd));
    setPaymentSchedule(app.paymentSchedule || "every_30_days");
    setOwnerPassword(""); 
    setSelectedApplicationId(app.id);
    setShowAddModal(true);
  };
  
  const handleRejectApplication = async (appId: string) => {
    try {
       await invokeAdminBackend<{ rejected: boolean }>({ action: "reject_application", applicationId: appId });
       setApplications(applications.map(a => a.id === appId ? { ...a, status: "rejected" } : a));
    } catch (error) {
       console.error("Application rejection failed", error);
       alert("Failed to reject application.");
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid) {
      alert("Use a strong password that meets every requirement.");
      return;
    }
    setIsSubmitting(true);
    try {
      const logoUrl = pendingLogo
        ? await uploadImageFileToDriveSecure(pendingLogo, {
            owner: storeName || ownerEmail,
            purpose: "approved-store-logo",
          })
        : storeLogo;
      const result = await invokeAdminBackend<{ store: any; notification?: { sent: boolean; error?: string } }>({
        action: "create_store",
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName,
        forcePasswordReset: requirePasswordChange,
        applicationId: selectedApplicationId,
        store: {
          name: storeName,
          location: storeLocation,
          address: storeLocation,
          ...(storeCoordinates ? { lat: storeCoordinates[0], lng: storeCoordinates[1] } : {}),
          logoUrl,
          status: "active",
          subscriptionLevel: subLevel,
          owedAmount: selectedOwedAmount,
          subscriptionStart: dateInputToDate(subStart),
          subscriptionEnd: dateInputToDate(subEnd),
          paymentSchedule,
        },
      });

      setApplications(applications.map((app) =>
        app.id === selectedApplicationId
          ? { ...app, status: "approved", approvedStoreId: result.store.id }
          : app
      ));
      setShowAddModal(false);
      setPendingLogo(null);
      alert(
        result.notification && !result.notification.sent
          ? `Store approved and created, but the welcome email could not be sent: ${result.notification.error || "Email service unavailable."}`
          : "Store approved and created! The owner email has been sent.",
      );
    } catch (error) {
      console.error(error);
      alert("Failed to create store: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-lg">Partner Applications</h3>
        </div>
        <span className="text-xs font-semibold bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-xl border border-gray-300/50 dark:border-gray-700">
          {applications.filter((a: any) => a.status !== 'rejected').length} Pending
        </span>
      </div>
      
      {loadingApps ? (
        <div className="space-y-3 p-6">
          <SkeletonBlock className="h-24 rounded-2xl" />
          <SkeletonBlock className="h-24 rounded-2xl" />
          <SkeletonBlock className="h-24 rounded-2xl" />
        </div>
      ) : (
        <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
          {applications.filter((a: any) => a.status !== 'rejected').map(app => (
            <div key={app.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-6 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h4 className="font-bold tracking-tight text-gray-900 dark:text-white text-lg truncate">{app.businessName}</h4>
                  {app.subscriptionLevel && (
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wider uppercase bg-gray-100 text-[#1b1b1b] border border-gray-300 dark:bg-white/10 dark:text-white dark:border-white/15">
                      {app.subscriptionLevel}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-full">
                  Applicant: {app.applicantName} • {app.email} {app.phoneNumber && `• ${app.phoneNumber}`}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-full mt-1 line-clamp-2">
                  {app.description}
                </p>
                {app.address && (
                  <p className="text-xs text-gray-400 mt-2">Location: {app.address}</p>
                )}
              </div>
              
              <div className="flex items-center gap-3 sm:shrink-0 bg-gray-50 dark:bg-gray-900 sm:bg-transparent p-3 sm:p-0 rounded-xl sm:rounded-none">
                <button 
                  onClick={() => handleApproveApplication(app)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-xl text-white bg-[#1b1b1b] hover:bg-black transition-colors"
                >
                  Process Setup
                </button>
                <button 
                  onClick={() => handleRejectApplication(app.id)}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 sm:p-2 sm:rounded-full rounded-xl text-red-700 bg-red-100 sm:bg-transparent sm:hover:bg-red-100 dark:text-red-400 dark:bg-red-900/30 dark:sm:bg-transparent dark:sm:hover:bg-red-900/50 transition-colors font-medium text-sm sm:text-transparent"
                  title="Reject Application"
                >
                  <Ban className="w-5 h-5 sm:text-red-600 dark:sm:text-red-500" />
                  <span className="sm:hidden">Reject</span>
                </button>
              </div>
            </div>
          ))}
          {applications.filter((a: any) => a.status !== 'rejected').length === 0 && (
            <div className="p-16 text-center text-gray-400 flex flex-col items-center">
              <FileText className="w-16 h-16 mb-4 text-gray-300 dark:text-gray-700" />
              <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No pending applications</p>
              <p className="text-sm mt-1">When someone applies to be a partner, it will appear here.</p>
            </div>
          )}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 pointer-events-auto">
          <div className="bg-white dark:bg-gray-900 w-full max-w-150 max-h-[90vh] overflow-y-auto rounded-4xl shadow-xl relative border border-gray-100 dark:border-gray-800 transition-colors" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/50 sticky top-0 z-10 backdrop-blur-sm">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">New Store Setup</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-full transition-colors border border-gray-200 dark:border-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddStore} className="p-6 space-y-6">
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-200 dark:border-gray-800 pb-2">Store Details</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Store Name</label>
                  <input type="text" required value={storeName} onChange={e => setStoreName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="e.g. Downtown Coffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Location (Address)</label>
                  <input type="text" value={storeLocation} onChange={e => setStoreLocation(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="123 Main St, City" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Logo Image Upload</label>
                  <div className="flex items-center gap-4">
                    {storeLogo ? (
                      <button
                        type="button"
                        onClick={() => pendingLogo && setLogoEditorFile(pendingLogo)}
                        disabled={!pendingLogo}
                        className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 disabled:cursor-default"
                        aria-label={pendingLogo ? "Edit selected logo" : "Logo preview"}
                      >
                        <img src={getDisplayImageUrl(storeLogo)} alt="Logo Preview" className="w-full h-full object-cover" />
                        {pendingLogo && (
                          <span className="absolute inset-0 flex scale-95 items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
                            Edit
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-400">
                       <ImageIcon className="w-5 h-5" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
                        <Upload className="w-4 h-4" />
                        Choose File
                      </div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Level</label>
                    <CustomDropdown
                       options={
                          billingPlans.map(p => ({ label: p.name || "Unnamed Plan", value: p.name || p.id || "Standard" }))
                       }
                       value={subLevel}
                       onChange={setSubLevel}
                       className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owed Amount</label>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm font-medium">
                      {formatMoney(selectedOwedAmount)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Start</label>
                    <input type="date" required value={subStart} onChange={e => setSubStart(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription End</label>
                    <input type="date" required value={subEnd} onChange={e => setSubEnd(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payment Schedule</label>
                    <CustomDropdown
                      options={PAYMENT_SCHEDULE_OPTIONS}
                      value={paymentSchedule}
                      onChange={setPaymentSchedule}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-widest border-b border-gray-200 dark:border-gray-800 pb-2">Owner Account</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Name</label>
                  <input type="text" required value={ownerName} onChange={e => setOwnerName(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Email</label>
                  <input type="email" required value={ownerEmail} onChange={e => setOwnerEmail(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white px-4 py-2.5 rounded-xl text-sm focus:ring-2 focus:ring-[#1b1b1b] outline-none" placeholder="owner@store.com" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Temporary Password</label>
                  <TemporaryPasswordField value={ownerPassword} onChange={setOwnerPassword} name={ownerName} email={ownerEmail} />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                  <input type="checkbox" checked={requirePasswordChange} onChange={(event) => setRequirePasswordChange(event.target.checked)} className="mt-0.5 h-4 w-4 rounded" />
                  <span>
                    <span className="block text-xs font-semibold text-gray-900 dark:text-white">Require password change on first login</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">The owner must create a private password before opening their dashboard.</span>
                  </span>
                </label>
              </div>

              <footer className="sticky bottom-0 z-10 -mx-6 -mb-6 flex justify-end gap-2 border-t border-gray-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
                <button type="button" onClick={() => setShowAddModal(false)} className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">Cancel</button>
                <button type="submit" disabled={isSubmitting || !validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid} className="rounded-lg bg-[#1b1b1b] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-[#1b1b1b] dark:hover:bg-black">
                  {isSubmitting ? 'Creating...' : 'Create Record'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
      {logoEditorFile && (
        <ImageCropEditor
          file={logoEditorFile}
          onCancel={() => setLogoEditorFile(null)}
          onApply={(file, previewUrl) => {
            if (storeLogo.startsWith("blob:")) URL.revokeObjectURL(storeLogo);
            setPendingLogo(file);
            setStoreLogo(previewUrl);
            setLogoEditorFile(null);
          }}
        />
      )}
    </div>
  );
}
