import { FormEvent, useState } from "react";
import { CheckCircle2, Clock3, Loader2, Search, Store, X, XCircle } from "lucide-react";
import { PartnerApplicationStatus, trackPartnerApplication } from "../lib/partnerApplication";
import { getDisplayImageUrl } from "../lib/imageStorage";
import { formatApplicationTrackingCode } from "../lib/applicationTracking";

interface PartnerApplicationTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrackingNumber?: string;
}

const getTimestampMs = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === "string") return new Date(value).getTime() || 0;
  if (typeof value === "object" && Number.isFinite(Number((value as { seconds?: unknown }).seconds))) {
    return Number((value as { seconds?: unknown }).seconds) * 1000;
  }
  return 0;
};

const formatDate = (value: unknown) => {
  const timestamp = getTimestampMs(value);
  if (!timestamp) return "Date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(timestamp));
};

const normalizeStatus = (status: string) => status.trim().toLowerCase() || "pending";

const getStatusMeta = (status: string) => {
  const normalized = normalizeStatus(status);
  if (normalized === "approved") {
    return {
      label: "Approved",
      description: "Your application has been approved. Check your email for the next setup steps.",
      icon: CheckCircle2,
      className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
    };
  }
  if (normalized === "rejected") {
    return {
      label: "Rejected",
      description: "Your application was not approved. Contact Perk support if you need more details.",
      icon: XCircle,
      className: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-200",
    };
  }
  return {
    label: "Pending Review",
    description: "Your application is still being reviewed by the Perk team.",
    icon: Clock3,
    className: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  };
};

export function PartnerApplicationTrackingModal({
  isOpen,
  onClose,
  initialTrackingNumber = "",
}: PartnerApplicationTrackingModalProps) {
  const [trackingNumber, setTrackingNumber] = useState(initialTrackingNumber);
  const [application, setApplication] = useState<PartnerApplicationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTrackingNumber = trackingNumber.trim();
    if (!normalizedTrackingNumber) {
      setError("Enter your application code.");
      setApplication(null);
      return;
    }
    setIsLoading(true);
    setError("");
    setApplication(null);
    try {
      const result = await trackPartnerApplication(normalizedTrackingNumber);
      setApplication(result);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Could not track that application.");
    } finally {
      setIsLoading(false);
    }
  };

  const statusMeta = application ? getStatusMeta(application.status) : null;
  const StatusIcon = statusMeta?.icon;
  const applicationCode = application
    ? application.trackingNumber.startsWith("PKUP-")
      ? application.trackingNumber
      : formatApplicationTrackingCode(application.applicationId || application.trackingNumber, application.businessName)
    : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm transition-colors dark:bg-black/60">
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[2rem] border border-gray-100 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-gray-50 p-2 text-gray-400 transition-colors hover:text-gray-600 dark:bg-gray-800 dark:hover:text-gray-300"
          aria-label="Close tracking modal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-gray-100 p-6 pr-16 dark:border-gray-800">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Track Application</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Enter the application code shown after submission or sent to your email.
          </p>
        </div>

        <div className="overflow-y-auto p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="partner-tracking-number" className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                Application Code
              </label>
              <div className="relative mt-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                  <Search className="h-4 w-4" />
                </div>
                <input
                  id="partner-tracking-number"
                  type="text"
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  className="block w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  placeholder="PKUP-SHOP-1234-ABCD"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1b1b1b] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {isLoading ? "Checking..." : "Track"}
            </button>
          </form>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          )}

          {application && statusMeta && StatusIcon && (
            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-white dark:ring-gray-700">
                  {application.logoUrl ? (
                    <img
                      src={getDisplayImageUrl(application.logoUrl)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Store className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="break-words font-bold text-gray-900 dark:text-white">{application.businessName || "Partner application"}</p>
                  {application.subscriptionLevel && (
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{application.subscriptionLevel} plan</p>
                  )}
                </div>
              </div>

              <div className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${statusMeta.className}`}>
                <StatusIcon className="h-4 w-4" />
                {statusMeta.label}
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{statusMeta.description}</p>
              <dl className="mt-5 grid gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Submitted</dt>
                  <dd className="mt-1 text-gray-900 dark:text-white">{formatDate(application.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">Application Code</dt>
                  <dd className="mt-1 break-all font-mono text-sm font-bold text-gray-900 dark:text-white">{applicationCode}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
