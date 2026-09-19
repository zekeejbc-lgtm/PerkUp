import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { buildScanActivity } from "../lib/customerActivity";

type Transaction = ReturnType<typeof buildScanActivity>[number];

export function CustomerTransactionModal({ transaction, customerName, onClose }: {
  transaction: Transaction;
  customerName: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      // The close button is the only interactive control in this read-only panel.
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const details = transaction.details;
  const isManual = typeof transaction.id === "number";
  const isReferral = details?.type === "referral";
  const location = details?.scannerLocation;
  const hasLocation = typeof location?.lat === "number" && Number.isFinite(location.lat)
    && typeof location?.lng === "number" && Number.isFinite(location.lng);
  const fields = [
    ["Customer", customerName],
    [isManual ? "Recorded at" : isReferral ? "Awarded at" : "Scanned at", transaction.date ? new Date(transaction.date).toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" }) : "Not recorded"],
    [isManual ? "Adjusted by" : "Scanned by", isReferral ? "Automatic referral reward" : details?.staffName || "Not recorded"],
    ["Scanner ID", details?.staffId || (isReferral ? "Not applicable" : "Not recorded")],
    [transaction.action.includes("stamp") ? "Stamp change" : "Points change", transaction.points],
    ["Transaction type", isManual ? "Manual adjustment" : isReferral ? "Referral reward" : details?.promotionId ? "Promotion scan" : "Points scan"],
    ["Status", details?.status || "Not recorded"],
    ["Scan mode", isManual || isReferral ? "Not applicable" : transaction.isSimulatedDemoScan ? "Demo simulation" : "Standard scan"],
    ["Store", details?.storeName || "Not recorded"],
    ["Store ID", details?.storeId || "Not recorded"],
    ["POS reference", transaction.posReferenceNumber || "Not recorded"],
    ["Ticket number", details?.ticketNumber || "Not recorded"],
    ["Transaction ID", String(transaction.id)],
    ["Customer ID", details?.customerId || "Not recorded"],
    ...(details?.promotionTitle || details?.promotionId ? [["Promotion", details.promotionTitle || "Not recorded"], ["Promotion ID", details.promotionId || "Not recorded"]] : []),
    ...(details?.referralCode ? [["Referral code", details.referralCode]] : []),
    ["Scanner location", hasLocation ? `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}` : "Not recorded"],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-950/60 p-4 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="transaction-details-title" aria-describedby="transaction-details-description" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 p-6 dark:border-gray-800">
          <div>
            <h2 id="transaction-details-title" className="text-xl font-bold text-gray-900 dark:text-white">Transaction details</h2>
            <p id="transaction-details-description" className="mt-1 text-sm text-gray-500 dark:text-gray-400">{transaction.action}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close transaction details" className="rounded-xl p-2 text-gray-500 hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 dark:text-gray-400 dark:hover:bg-gray-800"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto p-6">
          <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {fields.map(([label, value]) => <div key={label} className="min-w-0">
              <dt className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</dt>
              <dd className="mt-1 break-words text-sm font-semibold text-gray-900 dark:text-white">{value}</dd>
            </div>)}
          </dl>
        </div>
      </section>
    </div>, document.body,
  );
}
