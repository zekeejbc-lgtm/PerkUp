import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "@/src/lib/dataCompat";
import { db } from "../../lib/backend";
import { invokeAdminBackend } from "../../lib/adminBackend";
import {
  Ban,
  Building2,
  CalendarDays,
  FileText,
  Hash,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  Loader2,
  Search,
  Store,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { CustomDropdown } from "../../components/CustomDropdown";
import { deleteImageFromDriveSecure, getDisplayImageUrl, uploadImageFileToDriveSecure } from "../../lib/imageStorage";
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  dateInputToDate,
  formatMoney,
  getSubscriptionDependencies,
  getSubscriptionOwedAmount,
  PAYMENT_SCHEDULE_OPTIONS,
  toDateInputValue,
} from "../../lib/subscriptionBilling";
import { SkeletonBlock } from "../../components/LoadingSkeleton";
import { ImageCropEditor } from "../../components/ImageCropEditor";
import { TemporaryPasswordField } from "../../components/TemporaryPasswordField";
import { validateStrongPassword } from "../../lib/passwordStrength";
import { Pagination } from "../../components/Pagination";
import { PayMongoDefaultsControl } from "../../components/PayMongoDefaultsControl";
import { PAYMONGO_STANDARD_ACCESS } from "../../lib/subscriptionAccess";
import { AlreadyPaidControl } from "../../components/AlreadyPaidControl";

const APPLICATIONS_PER_PAGE = 8;

const STATUS_OPTIONS = [
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "All", value: "all" },
];

const getTimestampMs = (value: any) => {
  if (!value) return 0;
  if (typeof value === "string") return new Date(value).getTime() || 0;
  if (typeof value === "object" && Number.isFinite(Number(value.seconds))) return Number(value.seconds) * 1000;
  return 0;
};

const formatApplicationDate = (value: any) => {
  const timestamp = getTimestampMs(value);
  if (!timestamp) return "date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
};

const formatApplicationDateTime = (value: any) => {
  const timestamp = getTimestampMs(value);
  if (!timestamp) return "Date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
};

export default function AdminApplications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [storesById, setStoresById] = useState<Record<string, any>>({});
  const [loadingApps, setLoadingApps] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [detailApplicationId, setDetailApplicationId] = useState("");
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [subscriptionFilter, setSubscriptionFilter] = useState("all");

  const [storeName, setStoreName] = useState("");
  const [storeLocation, setStoreLocation] = useState("");
  const [storeCoordinates, setStoreCoordinates] = useState<[number, number] | null>(null);
  const [storeLogo, setStoreLogo] = useState("");
  const [pendingLogo, setPendingLogo] = useState<File | null>(null);
  const [logoEditorFile, setLogoEditorFile] = useState<File | null>(null);
  const [ownerEmail, setOwnerEmail] = useState("");
  const [selectedApplicationId, setSelectedApplicationId] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [requirePasswordChange, setRequirePasswordChange] = useState(true);
  const [subLevel, setSubLevel] = useState("Standard");
  const [subStart, setSubStart] = useState("");
  const [subEnd, setSubEnd] = useState("");
  const [paymentSchedule, setPaymentSchedule] = useState("every_30_days");
  const [billingIntervalDays, setBillingIntervalDays] = useState(30);
  const [payMongoDefaultsEnabled, setPayMongoDefaultsEnabled] = useState(false);
  const [alreadyPaid, setAlreadyPaid] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const billingPlans = subscriptionPlans.length > 0 ? subscriptionPlans : DEFAULT_SUBSCRIPTION_PLANS;
  const selectedOwedAmount = getSubscriptionOwedAmount(billingPlans, subLevel);
  const selectedSubscriptionDependencies = getSubscriptionDependencies(billingPlans, subLevel);
  const selectedBranchLimit = selectedSubscriptionDependencies.branchLimit > 0 ? selectedSubscriptionDependencies.branchLimit : 100;
  const applyPayMongoDefaults = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 30);
    setSubStart(toDateInputValue(start));
    setSubEnd(toDateInputValue(end));
    setPaymentSchedule("every_30_days");
    setBillingIntervalDays(30);
    setPayMongoDefaultsEnabled(true);
  };
  const selectedApplication = applications.find((app) => app.id === selectedApplicationId);
  const detailApplication = applications.find((app) => app.id === detailApplicationId);
  const pendingCount = applications.filter((app) => (app.status || "pending") === "pending").length;

  const subscriptionOptions = useMemo(() => {
    const levels = Array.from(new Set(applications.map((app) => String(app.subscriptionLevel || "").trim()).filter(Boolean)));
    return [{ label: "All Plans", value: "all" }, ...levels.sort().map((level) => ({ label: level, value: level }))];
  }, [applications]);

  const filteredApplications = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return applications
      .filter((app) => statusFilter === "all" || (app.status || "pending") === statusFilter)
      .filter((app) => subscriptionFilter === "all" || app.subscriptionLevel === subscriptionFilter)
      .filter((app) => {
        if (!normalizedSearch) return true;
        const approvedStore = app.approvedStoreId ? storesById[app.approvedStoreId] : null;
        return [
          app.businessName,
          app.applicantName,
          app.email,
          app.phoneNumber,
          app.address,
          app.description,
          approvedStore?.name,
          approvedStore?.businessName,
          approvedStore?.location,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      })
      .sort((left, right) => getTimestampMs(right.createdAt) - getTimestampMs(left.createdAt));
  }, [applications, searchTerm, statusFilter, subscriptionFilter, storesById]);

  const totalPages = Math.max(1, Math.ceil(filteredApplications.length / APPLICATIONS_PER_PAGE));
  const paginatedApplications = filteredApplications.slice(
    (currentPage - 1) * APPLICATIONS_PER_PAGE,
    currentPage * APPLICATIONS_PER_PAGE,
  );

  useEffect(() => {
    async function fetchApplications() {
      setLoadingApps(true);
      try {
        const snap = await getDocs(collection(db, "applications"));
        setApplications(snap.docs.map((d) => ({ id: d.id, ...d.data() })));

        const storeSnap = await getDocs(collection(db, "stores"));
        setStoresById(Object.fromEntries(storeSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }])));

        const subDoc = await getDoc(doc(db, "settings", "subscriptions"));
        if (subDoc.exists() && subDoc.data().plans) {
          setSubscriptionPlans(subDoc.data().plans);
          if (subDoc.data().plans.length > 0) setSubLevel(subDoc.data().plans[0].name);
        }
      } catch (error) {
        console.error("Application loading failed", error);
        setApplications([]);
        setStoresById({});
      } finally {
        setLoadingApps(false);
      }
    }
    fetchApplications();
  }, []);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, subscriptionFilter]);

  useEffect(() => {
    if (!detailApplication) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailApplicationId("");
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [detailApplication]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setLogoEditorFile(file);
    e.target.value = "";
  };

  const handleApproveApplication = (app: any) => {
    setDetailApplicationId("");
    setStoreName(app.businessName);
    setOwnerName(app.applicantName);
    setOwnerEmail(app.email);
    setStoreLocation(app.address || "");
    const applicationCoordinates = Array.isArray(app.coordinates) ? app.coordinates.map(Number) : null;
    setStoreCoordinates(
      applicationCoordinates?.length === 2 && applicationCoordinates.every(Number.isFinite)
        ? [applicationCoordinates[0], applicationCoordinates[1]]
        : null,
    );
    setStoreLogo(app.logoUrl || "");
    setPendingLogo(null);
    setSubLevel(app.subscriptionLevel || "Standard");
    setSubStart(toDateInputValue(app.subscriptionStart));
    setSubEnd(toDateInputValue(app.subscriptionEnd));
    setPaymentSchedule(app.paymentSchedule || "every_30_days");
    setBillingIntervalDays(Math.max(1, Math.min(365, Math.trunc(Number(app.billingIntervalDays || 30)))));
    // Applying the standard is always an explicit setup decision. Existing
    // application values remain visible and trigger the replacement modal.
    setPayMongoDefaultsEnabled(false);
    setAlreadyPaid(false);
    setOwnerPassword("");
    setSelectedApplicationId(app.id);
    setShowAddModal(true);
  };

  const handleRejectApplication = async (appId: string) => {
    try {
      await invokeAdminBackend<{ rejected: boolean }>({ action: "reject_application", applicationId: appId });
      setApplications((current) => current.map((app) => app.id === appId ? { ...app, status: "rejected" } : app));
    } catch (error) {
      console.error("Application rejection failed", error);
      alert("Failed to reject application.");
    }
  };

  const handleAddStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alreadyPaid && !payMongoDefaultsEnabled) {
      alert("Enable the PayMongo standard so the owner can complete the initial payment, or mark the subscription as already paid.");
      return;
    }
    if (!validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid) {
      alert("Use a strong password that meets every requirement.");
      return;
    }
    setIsSubmitting(true);
    let uploadedLogoUrl = "";
    let storePersisted = false;
    try {
      const logoUrl = pendingLogo
        ? await uploadImageFileToDriveSecure(pendingLogo, {
            owner: storeName || ownerEmail,
            purpose: "approved-store-logo",
          })
        : storeLogo;
      if (pendingLogo) uploadedLogoUrl = logoUrl;
      const result = await invokeAdminBackend<{ store: any; notification?: { sent: boolean; error?: string } }>({
        action: "create_store",
        email: ownerEmail,
        password: ownerPassword,
        name: ownerName,
        forcePasswordReset: requirePasswordChange,
        alreadyPaid,
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
          subscriptionDependencies: selectedSubscriptionDependencies,
          branchLimit: selectedBranchLimit,
          subscriptionStart: dateInputToDate(subStart),
          subscriptionEnd: dateInputToDate(subEnd),
          paymentSchedule,
          billingIntervalDays,
          ...(payMongoDefaultsEnabled ? { subscriptionAccess: PAYMONGO_STANDARD_ACCESS } : {}),
        },
      });
      storePersisted = true;

      setStoresById((stores) => ({ ...stores, [result.store.id]: result.store }));
      setApplications((current) => current.filter((app) => app.id !== selectedApplicationId));
      setShowAddModal(false);
      setPendingLogo(null);
      alert(
        result.notification && !result.notification.sent
          ? `Store approved and created, but the welcome email could not be sent: ${result.notification.error || "Email service unavailable."}`
          : "Store approved and created! The owner email has been sent.",
      );
    } catch (error) {
      if (!storePersisted && uploadedLogoUrl) {
        await deleteImageFromDriveSecure(uploadedLogoUrl).catch(console.error);
      }
      console.error(error);
      alert("Failed to create store: " + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-6 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-500" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Partner Applications</h3>
        </div>
        {loadingApps ? <SkeletonBlock className="h-8 w-24 rounded-xl" /> : <span className="rounded-xl border border-gray-300/50 bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">{pendingCount} Pending</span>}
      </div>

      {loadingApps ? (
        <div className="space-y-4 p-6">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]"><SkeletonBlock className="h-11 rounded-xl" /><SkeletonBlock className="h-11 rounded-xl" /><SkeletonBlock className="h-11 rounded-xl" /></div>
          <SkeletonBlock className="h-24 rounded-2xl" />
          <SkeletonBlock className="h-24 rounded-2xl" />
          <SkeletonBlock className="h-24 rounded-2xl" />
        </div>
      ) : (
        <div>
          <div className="grid gap-3 border-b border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 lg:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-gray-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:border-gray-500"
                placeholder="Search store, owner, email, phone, or location"
              />
            </label>
            <CustomDropdown options={STATUS_OPTIONS} value={statusFilter} onChange={setStatusFilter} className="w-full" />
            <CustomDropdown options={subscriptionOptions} value={subscriptionFilter} onChange={setSubscriptionFilter} className="w-full" />
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
            {paginatedApplications.map((app) => (
              <div
                key={app.id}
                className="flex flex-col gap-5 bg-white p-5 transition-colors hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/70 lg:flex-row lg:items-center lg:justify-between"
              >
                <button
                  type="button"
                  aria-label={`View ${app.businessName || "partner"} application details`}
                  onClick={() => setDetailApplicationId(app.id)}
                  className="flex min-w-0 flex-1 cursor-pointer gap-4 rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                    {app.logoUrl ? (
                      <img
                        src={getDisplayImageUrl(app.logoUrl)}
                        alt={`${app.businessName || "Application"} logo`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <Store className="h-7 w-7" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-lg font-bold tracking-tight text-gray-900 dark:text-white">{app.businessName}</h4>
                      {app.subscriptionLevel && (
                        <span className="rounded-lg border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#1b1b1b] dark:border-white/15 dark:bg-white/10 dark:text-white">
                          {app.subscriptionLevel}
                        </span>
                      )}
                      <span className="rounded-lg border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        {app.status || "pending"}
                      </span>
                    </div>
                    <p className="truncate text-sm text-gray-500 dark:text-gray-400">
                      Applicant: {app.applicantName} - {app.email} {app.phoneNumber && `- ${app.phoneNumber}`}
                    </p>
                    <p className="mt-1 line-clamp-2 max-w-3xl text-sm text-gray-500 dark:text-gray-400">
                      {app.description}
                    </p>
                    {app.address && <p className="mt-2 truncate text-xs text-gray-400">Location: {app.address}</p>}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <span>Applied {formatApplicationDate(app.createdAt)}</span>
                      {app.approvedStoreId && storesById[app.approvedStoreId] && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
                          Store: {storesById[app.approvedStoreId].name || storesById[app.approvedStoreId].businessName}
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 dark:bg-gray-950 lg:shrink-0 lg:bg-transparent lg:p-0">
                  {(app.status || "pending") === "pending" && (
                    <>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleApproveApplication(app);
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black dark:border dark:border-white/10 lg:flex-none"
                      >
                        Process Setup
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          handleRejectApplication(app.id);
                        }}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-100 px-4 py-2 text-sm font-medium text-red-700 transition-colors dark:bg-red-900/30 dark:text-red-400 lg:flex-none lg:rounded-full lg:bg-transparent lg:p-2 lg:text-transparent lg:hover:bg-red-100 dark:lg:bg-transparent dark:lg:hover:bg-red-900/50"
                        title="Reject Application"
                      >
                        <Ban className="h-5 w-5 lg:text-red-600 dark:lg:text-red-500" />
                        <span className="lg:hidden">Reject</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {filteredApplications.length === 0 && (
              <div className="flex flex-col items-center p-16 text-center text-gray-400">
                <FileText className="mb-4 h-16 w-16 text-gray-300 dark:text-gray-700" />
                <p className="text-lg font-medium text-gray-500 dark:text-gray-400">No applications found</p>
                <p className="mt-1 text-sm">Try changing the search text or filters.</p>
              </div>
            )}
          </div>

          <Pagination
            page={currentPage}
            pageSize={APPLICATIONS_PER_PAGE}
            totalItems={filteredApplications.length}
            itemLabel="applications"
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {detailApplication && (
        <div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-gray-950/55 p-4 backdrop-blur-sm animate-in fade-in duration-200 sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDetailApplicationId("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-detail-title"
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-4 border-b border-gray-200 bg-white px-5 py-5 dark:border-gray-800 dark:bg-gray-900 sm:px-7">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Application details</span>
                  <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                    {detailApplication.status || "pending"}
                  </span>
                </div>
                <h2 id="application-detail-title" className="truncate text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
                  {detailApplication.businessName || "Unnamed business"}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Submitted {formatApplicationDateTime(detailApplication.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailApplicationId("")}
                className="shrink-0 rounded-full border border-gray-200 bg-gray-100 p-2.5 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Close application details"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="overflow-y-auto px-5 py-6 sm:px-7 sm:py-7">
              <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
                <aside className="space-y-4">
                  <div className="aspect-square w-full overflow-hidden rounded-3xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                    {detailApplication.logoUrl ? (
                      <img
                        src={getDisplayImageUrl(detailApplication.logoUrl)}
                        alt={`${detailApplication.businessName || "Application"} logo`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-gray-400">
                        <Building2 className="h-12 w-12" />
                        <span className="text-xs font-medium">No logo provided</span>
                      </div>
                    )}
                  </div>
                  {detailApplication.subscriptionLevel && (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/60">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Requested plan</p>
                      <p className="mt-1 text-lg font-bold text-gray-950 dark:text-white">{detailApplication.subscriptionLevel}</p>
                    </div>
                  )}
                </aside>

                <div className="min-w-0 space-y-6">
                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Applicant</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                        <UserRound className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                        <div className="min-w-0"><p className="text-xs text-gray-500 dark:text-gray-400">Full name</p><p className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">{detailApplication.applicantName || "Not provided"}</p></div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                        <div className="min-w-0"><p className="text-xs text-gray-500 dark:text-gray-400">Email</p><a href={`mailto:${detailApplication.email}`} className="mt-1 block break-all text-sm font-semibold text-gray-900 hover:underline dark:text-white">{detailApplication.email || "Not provided"}</a></div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700 sm:col-span-2">
                        <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                        <div className="min-w-0"><p className="text-xs text-gray-500 dark:text-gray-400">Phone number</p><a href={`tel:${detailApplication.phoneNumber}`} className="mt-1 block text-sm font-semibold text-gray-900 hover:underline dark:text-white">{detailApplication.phoneNumber || "Not provided"}</a></div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">About the business</h3>
                    <p className="mt-3 whitespace-pre-wrap rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
                      {detailApplication.description || "No business description provided."}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Location</h3>
                    <div className="mt-3 flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-gray-900 dark:text-white">{detailApplication.address || "Address not provided"}</p>
                        {Array.isArray(detailApplication.coordinates) && detailApplication.coordinates.length === 2 && (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Coordinates: {detailApplication.coordinates.join(", ")}</p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Record information</h3>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                        <Hash className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                        <div className="min-w-0"><p className="text-xs text-gray-500 dark:text-gray-400">Tracking code</p><p className="mt-1 break-all font-mono text-xs font-semibold text-gray-900 dark:text-white">{detailApplication.trackingCode || detailApplication.id}</p></div>
                      </div>
                      <div className="flex gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
                        <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
                        <div className="min-w-0"><p className="text-xs text-gray-500 dark:text-gray-400">Last updated</p><p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{formatApplicationDateTime(detailApplication.updatedAt || detailApplication.createdAt)}</p></div>
                      </div>
                    </div>
                    {detailApplication.approvedStoreId && storesById[detailApplication.approvedStoreId] && (
                      <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Approved store: <span className="font-semibold">{storesById[detailApplication.approvedStoreId].name || storesById[detailApplication.approvedStoreId].businessName}</span>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>

            <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-end sm:px-7">
              {(detailApplication.status || "pending") === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await handleRejectApplication(detailApplication.id);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-950/70"
                  >
                    <Ban className="h-4 w-4" /> Reject
                  </button>
                  <button type="button" onClick={() => handleApproveApplication(detailApplication)} className="rounded-xl bg-[#1b1b1b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black dark:border dark:border-white/10">
                    Process Setup
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}

      {showAddModal && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm animate-in fade-in duration-200 dark:bg-black/60">
          <div className="relative max-h-[90vh] w-full max-w-150 overflow-y-auto rounded-4xl border border-gray-100 bg-white shadow-xl transition-colors dark:border-gray-800 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-gray-50/50 p-6 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/50">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">New Store Setup</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="rounded-full border border-gray-200 bg-gray-100 p-2 text-gray-400 transition-colors hover:text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddStore} className="space-y-6 p-6">
              {selectedApplication && (
                <div className="flex gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                    {selectedApplication.logoUrl ? (
                      <img
                        src={getDisplayImageUrl(selectedApplication.logoUrl)}
                        alt={`${selectedApplication.businessName || "Application"} logo`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedApplication.businessName}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedApplication.applicantName} - {selectedApplication.email}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{selectedApplication.description}</p>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h4 className="border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-widest text-gray-900 dark:border-gray-800 dark:text-white">Store Details</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Store Name</label>
                  <input type="text" required value={storeName} onChange={(e) => setStoreName(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="e.g. Downtown Coffee" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Location (Address)</label>
                  <input type="text" value={storeLocation} onChange={(e) => setStoreLocation(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="123 Main St, City" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Logo Image Upload</label>
                  <div className="flex items-center gap-4">
                    {storeLogo ? (
                      <button type="button" onClick={() => pendingLogo && setLogoEditorFile(pendingLogo)} disabled={!pendingLogo} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 disabled:cursor-default" aria-label={pendingLogo ? "Edit selected logo" : "Logo preview"}>
                        <img src={getDisplayImageUrl(storeLogo)} alt="Logo Preview" loading="lazy" className="h-full w-full object-cover" />
                        {pendingLogo && (
                          <span className="absolute inset-0 flex scale-95 items-center justify-center bg-black/60 text-xs font-semibold text-white opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100">
                            Edit
                          </span>
                        )}
                      </button>
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-400">
                        <ImageIcon className="h-5 w-5" />
                      </div>
                    )}
                    <label className="cursor-pointer">
                      <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100">
                        <Upload className="h-4 w-4" />
                        Choose File
                      </div>
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                    </label>
                  </div>
                </div>

                <PayMongoDefaultsControl
                  enabled={payMongoDefaultsEnabled}
                  hasExistingValues={Boolean(subStart || subEnd || paymentSchedule !== "every_30_days" || billingIntervalDays !== 30)}
                  onApply={applyPayMongoDefaults}
                  onDisable={() => setPayMongoDefaultsEnabled(false)}
                />
                <AlreadyPaidControl value={alreadyPaid} onChange={setAlreadyPaid} />
                {!alreadyPaid && !payMongoDefaultsEnabled && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">Initial payment is required by default. Enable the PayMongo standard to create the payment invoice, or turn on Already paid to bypass it.</p>}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Level</label>
                    <CustomDropdown options={billingPlans.map((p) => ({ label: p.name || "Unnamed Plan", value: p.name || p.id || "Standard" }))} value={subLevel} onChange={setSubLevel} className="w-full" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owed Amount</label>
                    <div className="w-full rounded-xl border border-gray-200 bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white">
                      {formatMoney(selectedOwedAmount)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription Start</label>
                    <input type="date" required value={subStart} onChange={(e) => setSubStart(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Subscription End</label>
                    <input type="date" required value={subEnd} onChange={(e) => setSubEnd(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Payment Schedule</label>
                    <CustomDropdown options={PAYMENT_SCHEDULE_OPTIONS} value={paymentSchedule} onChange={setPaymentSchedule} className="w-full" />
                  </div>
                  {paymentSchedule === "every_30_days" && <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Billing Interval (Days)</label>
                    <input type="number" min="1" max="365" required value={billingIntervalDays} onChange={(event) => setBillingIntervalDays(Math.max(1, Math.min(365, Math.trunc(Number(event.target.value) || 1))))} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                  </div>}
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="border-b border-gray-200 pb-2 text-sm font-semibold uppercase tracking-widest text-gray-900 dark:border-gray-800 dark:text-white">Owner Account</h4>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Name</label>
                  <input type="text" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="John Doe" />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Owner Email</label>
                  <input type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white" placeholder="owner@store.com" />
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
                <button type="submit" disabled={isSubmitting || (!alreadyPaid && !payMongoDefaultsEnabled) || !validateStrongPassword(ownerPassword, { name: ownerName, email: ownerEmail }).valid} className="rounded-lg bg-[#1b1b1b] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-[#1b1b1b] dark:hover:bg-black">
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating...</span>
                  ) : "Create Record"}
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
