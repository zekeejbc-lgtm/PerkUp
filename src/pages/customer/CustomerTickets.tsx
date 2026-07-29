import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Star,
  Store,
  Ticket,
  UserRoundCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { db } from "../../lib/backend";
import { doc, getDoc } from "../../lib/dataCompat";
import { getDisplayImageUrl } from "../../lib/imageStorage";
import {
  buildTicketStoreGroups,
  filterStoreTickets,
  filterTicketStores,
  getTicketStoreGroup,
  type CustomerTicket,
  type TicketStoreMetadata,
} from "../../lib/customerTicketStores";
import { Pagination } from "../../components/Pagination";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";

const STORE_GROUPS_PER_PAGE = 6;
const QUERY_PAGE_SIZE = 1000;

type SortOrder = "oldest" | "newest";

const ticketTime = (ticket: CustomerTicket) => {
  const time = new Date(ticket.issuedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const formatTicketDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
};

const formatTicketDay = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString();
};

export default function CustomerTickets() {
  const { user } = useAuth();
  const { storeId: routeStoreKey } = useParams<{ storeId: string }>();
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [storeMetadata, setStoreMetadata] = useState<TicketStoreMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const knownIds = useRef(new Set<string>());

  const groups = useMemo(
    () => buildTicketStoreGroups(tickets, storeMetadata),
    [storeMetadata, tickets],
  );
  const selectedGroup = useMemo(
    () => getTicketStoreGroup(groups, routeStoreKey),
    [groups, routeStoreKey],
  );
  const isStoreRoute = Boolean(routeStoreKey);

  const filteredStores = useMemo(
    () => filterTicketStores(groups, searchQuery),
    [groups, searchQuery],
  );
  const totalPages = Math.max(1, Math.ceil(filteredStores.length / STORE_GROUPS_PER_PAGE));
  const paginatedStores = filteredStores.slice(
    (currentPage - 1) * STORE_GROUPS_PER_PAGE,
    currentPage * STORE_GROUPS_PER_PAGE,
  );

  const filteredTickets = useMemo(() => {
    if (!selectedGroup) return [];
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const matching = filterStoreTickets(selectedGroup.tickets, searchQuery)
      .filter((ticket) => {
        const issuedTime = ticketTime(ticket);
        return (fromTime === null || issuedTime >= fromTime)
          && (toTime === null || issuedTime <= toTime);
      });
    return sortOrder === "newest" ? [...matching].reverse() : matching;
  }, [dateFrom, dateTo, searchQuery, selectedGroup, sortOrder]);

  const hasActiveFilters = Boolean(dateFrom) || Boolean(dateTo) || sortOrder !== "oldest";

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setSortOrder("oldest");
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setSearchQuery("");
    setShowFilters(false);
    clearFilters();
  }, [routeStoreKey]);

  const loadTickets = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (!quiet) setRefreshing(true);

    try {
      const rows: any[] = [];
      let offset = 0;

      while (true) {
        const { data, error: queryError } = await supabase
          .from("promotions_scanned")
          .select("id,public_id,data,created_at")
          .eq("data->>customerId", user.id)
          .order("created_at", { ascending: true })
          .range(offset, offset + QUERY_PAGE_SIZE - 1);

        if (queryError) throw queryError;
        const page = data || [];
        rows.push(...page);
        if (page.length < QUERY_PAGE_SIZE) break;
        offset += QUERY_PAGE_SIZE;
      }

      const next: CustomerTicket[] = rows.map((row: any) => {
        const data = row.data || {};
        return {
          id: String(row.id || ""),
          ticketNumber: String(row.public_id || data.ticketNumber || `LEGACY-${String(row.id).slice(0, 8).toUpperCase()}`),
          type: String(data.type || "points"),
          status: String(data.status || "issued"),
          storeId: String(data.storeId || ""),
          storeName: String(data.storeName || "Perk Store"),
          staffName: String(data.staffName || "Store staff"),
          promotionId: String(data.promotionId || ""),
          promotionTitle: data.promotionTitle ? String(data.promotionTitle) : null,
          points: Number(data.points || 0),
          issuedAt: String(data.issuedAt || (
            data.timestamp?.seconds
              ? new Date(data.timestamp.seconds * 1000).toISOString()
              : row.created_at
          ) || ""),
        };
      });

      const storeIds = Array.from(new Set(next.map((ticket) => ticket.storeId).filter(Boolean)));
      const metadata = await Promise.all(storeIds.map(async (storeId) => {
        try {
          const snapshot = await getDoc(doc(db, "stores", storeId));
          if (!snapshot.exists()) return null;
          const data = snapshot.data() || {};
          return {
            id: storeId,
            name: data.name ? String(data.name) : undefined,
            logoUrl: data.logoUrl ? String(data.logoUrl) : undefined,
          } satisfies TicketStoreMetadata;
        } catch {
          return null;
        }
      }));

      setTickets(next);
      setStoreMetadata(metadata.filter((store): store is TicketStoreMetadata => Boolean(store)));
      knownIds.current = new Set(next.map((ticket) => ticket.id));
      setError("");
    } catch {
      setError("Could not load your tickets.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadTickets(true);

    const channel = supabase
      .channel(`customer-tickets-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "promotions_scanned" },
        (payload) => {
          const row = payload.new as { id?: string; data?: Record<string, unknown> };
          if (row.data?.customerId === user.id && row.id && !knownIds.current.has(row.id)) {
            loadTickets(true);
          }
        },
      )
      .subscribe();
    const pollId = window.setInterval(() => loadTickets(true), 5000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [loadTickets, user?.id]);

  if (loading) return <PageSkeleton variant="tickets" />;

  if (isStoreRoute && !selectedGroup) {
    return (
      <div className="space-y-6">
        <Link to="/customer/tickets" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 transition hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Back to stores
        </Link>
        <div className="rounded-3xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <Store className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" />
          <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">Ticket store not found</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">This store is not part of your ticket history.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4">
        {selectedGroup && (
          <Link to="/customer/tickets" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-700 transition hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <ArrowLeft className="h-4 w-4" /> Back to stores
          </Link>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {selectedGroup ? (
              <div className="flex min-w-0 items-center gap-4">
                <StoreLogo name={selectedGroup.storeName} logoUrl={selectedGroup.logoUrl} size="lg" />
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">Ticket history</p>
                  <h1 className="truncate text-3xl font-bold text-gray-900 dark:text-white">{selectedGroup.storeName}</h1>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {selectedGroup.tickets.length} {selectedGroup.tickets.length === 1 ? "ticket" : "tickets"}
                    {selectedGroup.tickets.length > 1
                      ? ` · ${formatTicketDay(selectedGroup.tickets[0].issuedAt)} – ${formatTicketDay(selectedGroup.latestIssuedAt)}`
                      : ""}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
                <p className="mt-1 text-gray-500 dark:text-gray-400">Choose a store to view your chronological ticket history.</p>
              </>
            )}
          </div>
          <button type="button" onClick={() => loadTickets()} disabled={refreshing} className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {tickets.length > 0 && (
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{selectedGroup ? "Search store tickets" : "Search ticket stores"}</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={selectedGroup ? "Search ticket, promotion, or staff..." : "Search stores..."}
                className="min-h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-[#1b1b1b]/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-gray-500 dark:focus:ring-white/10"
              />
            </label>
            {selectedGroup && (
              <button
                type="button"
                aria-expanded={showFilters}
                aria-controls="customer-ticket-filters"
                onClick={() => setShowFilters((current) => !current)}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                  showFilters || hasActiveFilters
                    ? "border-[#1b1b1b] bg-[#1b1b1b] text-white dark:border-white dark:bg-white dark:text-[#1b1b1b]"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-emerald-400" aria-label="Filters active" />}
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${showFilters ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        )}
      </header>

      <AnimatePresence initial={false}>
        {selectedGroup && showFilters && (
          <motion.section
            id="customer-ticket-filters"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.3, ease: "easeInOut" }, opacity: { duration: 0.2 } }}
            className="overflow-hidden"
          >
            <div className="rounded-3xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                  <SlidersHorizontal className="h-4 w-4 text-gray-400" /> Filter tickets
                </h2>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <CustomDropdown
                  options={[
                    { label: "Oldest first", value: "oldest" },
                    { label: "Newest first", value: "newest" },
                  ]}
                  value={sortOrder}
                  onChange={(value) => setSortOrder(value as SortOrder)}
                  ariaLabel="Sort tickets chronologically"
                />
                <DateField label="Tickets from date" value={dateFrom} max={dateTo || undefined} onChange={setDateFrom} />
                <DateField label="Tickets through date" value={dateTo} min={dateFrom || undefined} onChange={setDateTo} />
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {tickets.length === 0 ? (
        <EmptyState
          icon={<Ticket className="mx-auto h-12 w-12 text-gray-300" />}
          title="No tickets yet"
          description="Your first successful scan or referral reward will appear here automatically."
        />
      ) : selectedGroup ? (
        filteredTickets.length ? (
          <>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300" aria-live="polite">
              Showing {filteredTickets.length} of {selectedGroup.tickets.length} {selectedGroup.tickets.length === 1 ? "ticket" : "tickets"} · {sortOrder === "oldest" ? "oldest to newest" : "newest to oldest"}
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredTickets.map((ticket) => <TicketCard key={ticket.id} ticket={ticket} />)}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<Search className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />}
            title="No tickets match your search"
            description="Try changing your search or date filters."
            action={<button type="button" onClick={() => { setSearchQuery(""); clearFilters(); }} className="text-sm font-semibold text-gray-700 hover:underline dark:text-gray-200">Clear search and filters</button>}
          />
        )
      ) : filteredStores.length ? (
        <>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300" aria-live="polite">
            {tickets.length} {tickets.length === 1 ? "ticket" : "tickets"} across {groups.length} {groups.length === 1 ? "store" : "stores"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedStores.map((group) => (
              <Link
                key={group.key}
                to={`/customer/tickets/${encodeURIComponent(group.key)}`}
                aria-label={`Open ${group.storeName} ticket history`}
                className="group flex min-h-36 items-center gap-4 rounded-3xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
              >
                <StoreLogo name={group.storeName} logoUrl={group.logoUrl} size="md" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-bold text-gray-900 dark:text-white">{group.storeName}</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{group.tickets.length} {group.tickets.length === 1 ? "ticket" : "tickets"}</p>
                  <p className="mt-2 text-xs text-gray-400">Latest: {formatTicketDay(group.latestIssuedAt)}</p>
                </div>
                <ArrowRight className="h-5 w-5 shrink-0 text-gray-300 transition group-hover:translate-x-1 group-hover:text-gray-600 dark:group-hover:text-gray-200" />
              </Link>
            ))}
          </div>
          {filteredStores.length > STORE_GROUPS_PER_PAGE && (
            <Pagination
              page={currentPage}
              pageSize={STORE_GROUPS_PER_PAGE}
              totalItems={filteredStores.length}
              itemLabel="stores"
              onPageChange={setCurrentPage}
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={<Search className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />}
          title="No stores match your search"
          description="Try searching for another store name."
          action={<button type="button" onClick={() => setSearchQuery("")} className="text-sm font-semibold text-gray-700 hover:underline dark:text-gray-200">Clear search</button>}
        />
      )}
    </div>
  );
}

function StoreLogo({ name, logoUrl, size }: { name: string; logoUrl: string; size: "md" | "lg" }) {
  const displayUrl = getDisplayImageUrl(logoUrl);
  const sizeClass = size === "lg" ? "h-16 w-16 rounded-2xl" : "h-14 w-14 rounded-2xl";
  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden border border-gray-100 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 ${sizeClass}`}>
      {displayUrl
        ? <img src={displayUrl} alt={`${name} logo`} className="h-full w-full object-contain" />
        : <Store className="h-6 w-6 text-gray-400" aria-hidden="true" />}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: CustomerTicket }) {
  return (
    <article className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <p className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">{ticket.ticketNumber}</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle2 className="h-3.5 w-3.5" /> Successful
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/70">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
          {ticket.promotionTitle ? "Promotion credited" : "General loyalty credit"}
        </p>
        {ticket.promotionTitle && <p className="mt-1 font-semibold text-gray-800 dark:text-gray-100">{ticket.promotionTitle}</p>}
      </div>
      <div className="mt-3 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
        {ticket.type === "referral" ? (
          <p className="flex items-center gap-2"><Store className="h-4 w-4 shrink-0" /> Store referral code redeemed</p>
        ) : (
          <p className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 shrink-0" /> Scanned by {ticket.staffName}</p>
        )}
      </div>
      <div className="mt-5 flex items-end justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
        <p className="text-xs text-gray-500 dark:text-gray-400">{formatTicketDate(ticket.issuedAt)}</p>
        <p className="flex items-center gap-1 text-lg font-black text-gray-900 dark:text-white">
          +{ticket.points} <Star className="h-4 w-4 fill-current" />
        </p>
      </div>
    </article>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative">
      <span className="sr-only">{label}</span>
      <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]"
      />
    </label>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
      {icon}
      <h2 className="mt-4 font-bold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
