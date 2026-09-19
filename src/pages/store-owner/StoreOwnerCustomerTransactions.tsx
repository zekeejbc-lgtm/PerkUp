import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { buildScanActivity } from "../../lib/customerActivity";
import { Pagination } from "../../components/Pagination";
import { PageSkeleton } from "../../components/LoadingSkeleton";
import { CustomerTransactionModal } from "../../components/CustomerTransactionModal";

const PAGE_SIZE = 20;
const BATCH_SIZE = 500;
const inputClass = "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
type Activity = ReturnType<typeof buildScanActivity>[number];

export default function StoreOwnerCustomerTransactions({ storeId, customer, onBack }: {
  storeId: string;
  customer: { customerId: string; name: string; recentHistory?: Activity[] };
  onBack: () => void;
}) {
  const [history, setHistory] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedTransaction, setSelectedTransaction] = useState<Activity | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const load = async () => {
      try {
        const scans: any[] = [];
        let offset = 0;
        while (true) {
          const { data, error: queryError } = await supabase.from("promotions_scanned")
            .select("id,public_id,data,created_at")
            .eq("data->>storeId", storeId)
            .eq("data->>customerId", customer.customerId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + BATCH_SIZE - 1);
          if (cancelled) return;
          if (queryError) throw queryError;
          const batch = data || [];
          scans.push(...batch.map(row => ({ ...row.data, id: row.id, publicId: row.public_id, createdAt: row.data?.createdAt || row.created_at })));
          if (batch.length === 0) break;
          offset += batch.length;
        }
        // Manual adjustments are shown immediately by the customer profile.
        const adjustments = (customer.recentHistory || []).filter(item => typeof item.id === "number");
        setHistory([...adjustments, ...buildScanActivity(scans)].sort((a, b) =>
          (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0)));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [storeId, customer.customerId, customer.recentHistory, attempt]);

  const invalidRange = period === "custom" && Boolean(from && to && from > to);
  const now = new Date();
  let start = -Infinity;
  let end = Infinity;
  if (period === "custom") {
    if (from) start = new Date(`${from}T00:00:00`).getTime();
    if (to) {
      const nextDay = new Date(`${to}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      end = nextDay.getTime();
    }
  } else if (period !== "all") {
    const firstDay = new Date(now);
    firstDay.setHours(0, 0, 0, 0);
    firstDay.setDate(firstDay.getDate() - (Number(period) - 1));
    start = firstDay.getTime();
    end = now.getTime() + 1;
  }
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const filtered = history.filter(item => {
    if (invalidRange) return false;
    const date = item.date ? Date.parse(item.date) : NaN;
    if (period !== "all" && !(date >= start && date < end)) return false;
    const text = [item.action, item.posReferenceNumber, item.points, item.details?.staffName, item.details?.staffId, item.details?.ticketNumber, item.isSimulatedDemoScan ? "demo simulation" : ""].join(" ").toLocaleLowerCase();
    return terms.every(term => text.includes(term));
  });
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  return (
    <div className="space-y-6 pb-20">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <ArrowLeft className="h-5 w-5" /> Back to customer
      </button>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Transaction history</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">All recorded activity for {customer.name} at this store, newest first.</p>
      </div>
      <div className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            Search transactions
            <div className="relative mt-2">
              <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400" />
              <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Search activity or POS reference..." className={`${inputClass} pl-12`} />
            </div>
          </label>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
            Time filter
            <select value={period} onChange={event => { setPeriod(event.target.value); setPage(1); }} className={`${inputClass} mt-2`}>
              <option value="all">All time</option>
              <option value="1">Today</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom range</option>
            </select>
          </label>
        </div>
        {period === "custom" && <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">From
            <input type="date" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setPage(1); }} className={`${inputClass} mt-2`} />
          </label>
          <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">To
            <input type="date" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }} className={`${inputClass} mt-2`} />
          </label>
        </div>}
        {invalidRange && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">The end date must be on or after the start date.</p>}
      </div>
      {loading ? <PageSkeleton variant="table" /> : error ? (
        <div role="alert" className="rounded-3xl border border-gray-200 p-8 text-center dark:border-gray-800">
          <p className="text-gray-700 dark:text-gray-300">Transaction history could not be loaded.</p>
          <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 font-bold text-white dark:bg-white dark:text-gray-900">Try again</button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <p role="status" className="border-b border-gray-100 px-6 py-4 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">{filtered.length} {filtered.length === 1 ? "transaction" : "transactions"}</p>
          {filtered.length === 0 ? <div className="px-6 py-12 text-center">
            <Clock className="mx-auto mb-3 h-8 w-8 text-gray-400" />
            <p className="font-semibold text-gray-900 dark:text-white">{history.length ? "No transactions match your filters." : "No transactions yet."}</p>
            {history.length > 0 && <button type="button" onClick={() => { setSearch(""); setPeriod("all"); setFrom(""); setTo(""); setPage(1); }} className="mt-3 text-sm font-bold text-gray-600 underline dark:text-gray-300">Clear filters</button>}
          </div> : <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map(item => <li key={item.id}>
              <button type="button" onClick={() => setSelectedTransaction(item)} aria-haspopup="dialog" className="flex w-full items-start justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] dark:hover:bg-gray-800/60">
              <div className="min-w-0">
                <p className="break-words font-semibold text-gray-900 dark:text-white">{item.action}</p>
                {item.isSimulatedDemoScan && <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">Demo simulation</span>}
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.date ? new Date(item.date).toLocaleString() : "Date unavailable"}</p>
                {item.posReferenceNumber && <p className="mt-1 break-all font-mono text-xs text-gray-500 dark:text-gray-400">POS ref: {item.posReferenceNumber}</p>}
                <p className="mt-2 text-xs font-semibold text-gray-500 dark:text-gray-400">{item.details?.staffName ? `Scanned by ${item.details.staffName} · ` : ""}View details</p>
              </div>
              <span className={`shrink-0 font-black ${item.points.startsWith("+") ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}`}>{item.points}</span>
              </button>
            </li>)}
          </ul>}
          <Pagination page={currentPage} pageSize={PAGE_SIZE} totalItems={filtered.length} itemLabel="transactions" onPageChange={setPage} />
        </div>
      )}
      {selectedTransaction && <CustomerTransactionModal transaction={selectedTransaction} customerName={customer.name} onClose={() => setSelectedTransaction(null)} />}
    </div>
  );
}
