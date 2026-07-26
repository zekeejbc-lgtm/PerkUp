import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { Pagination } from "../../components/Pagination";
import { CustomDropdown } from "../../components/CustomDropdown";
import { PageSkeleton } from "../../components/LoadingSkeleton";

const STORE_GROUPS_PER_PAGE = 5;
const QUERY_PAGE_SIZE = 1000;

type SortOrder = "oldest" | "newest";

type CustomerTicket = {
  id: string;
  publicId?: string;
  ticketNumber: string;
  status: string;
  storeName: string;
  staffName: string;
  promotionTitle: string | null;
  points: number;
  issuedAt: string;
};

type TicketGroup = {
  storeName: string;
  tickets: CustomerTicket[];
};

const ticketTime = (ticket: CustomerTicket) => {
  const time = new Date(ticket.issuedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

export default function CustomerTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [storeFilter, setStoreFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("oldest");
  const knownIds = useRef(new Set<string>());

  const storeOptions = useMemo(() => [
    { label: "All stores", value: "all" },
    ...Array.from(new Set(tickets.map((ticket) => ticket.storeName)))
      .sort((a, b) => a.localeCompare(b))
      .map((storeName) => ({ label: storeName, value: storeName })),
  ], [tickets]);

  const filteredGroups = useMemo<TicketGroup[]>(() => {
    const term = searchQuery.trim().toLocaleLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : null;
    const direction = sortOrder === "oldest" ? 1 : -1;
    const grouped = new Map<string, CustomerTicket[]>();

    tickets.forEach((ticket) => {
      const issuedTime = ticketTime(ticket);
      const matchesSearch = !term || [
        ticket.ticketNumber,
        ticket.storeName,
        ticket.staffName,
        ticket.promotionTitle,
      ].some((value) => String(value || "").toLocaleLowerCase().includes(term));
      const matchesStore = storeFilter === "all" || ticket.storeName === storeFilter;
      const matchesDate = (fromTime === null || issuedTime >= fromTime) && (toTime === null || issuedTime <= toTime);

      if (!matchesSearch || !matchesStore || !matchesDate) return;
      const storeTickets = grouped.get(ticket.storeName) || [];
      storeTickets.push(ticket);
      grouped.set(ticket.storeName, storeTickets);
    });

    return Array.from(grouped, ([storeName, storeTickets]) => ({
      storeName,
      tickets: storeTickets.sort((a, b) => direction * (ticketTime(a) - ticketTime(b))),
    })).sort((a, b) => a.storeName.localeCompare(b.storeName));
  }, [dateFrom, dateTo, searchQuery, sortOrder, storeFilter, tickets]);

  const filteredTicketCount = useMemo(
    () => filteredGroups.reduce((total, group) => total + group.tickets.length, 0),
    [filteredGroups],
  );
  const totalPages = Math.max(1, Math.ceil(filteredGroups.length / STORE_GROUPS_PER_PAGE));
  const paginatedGroups = filteredGroups.slice(
    (currentPage - 1) * STORE_GROUPS_PER_PAGE,
    currentPage * STORE_GROUPS_PER_PAGE,
  );
  const hasActiveFilters = storeFilter !== "all" || Boolean(dateFrom) || Boolean(dateTo) || sortOrder !== "oldest";

  const clearFilters = () => {
    setStoreFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortOrder("oldest");
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, searchQuery, sortOrder, storeFilter]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

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

      const next = rows.map((row: any) => ({
        id: row.id,
        publicId: row.public_id || "",
        ticketNumber: row.public_id || row.data.ticketNumber || `LEGACY-${String(row.id).slice(0, 8).toUpperCase()}`,
        status: row.data.status || "issued",
        storeName: row.data.storeName || "PerkUp Store",
        staffName: row.data.staffName || "Store staff",
        promotionTitle: row.data.promotionTitle || null,
        points: Number(row.data.points || 0),
        issuedAt: row.data.issuedAt || (
          row.data.timestamp?.seconds
            ? new Date(row.data.timestamp.seconds * 1000).toISOString()
            : row.created_at
        ),
      }));
      setTickets(next);
      knownIds.current = new Set(next.map((ticket) => ticket.id));
      setError("");
    } catch {
      setError("Could not load your scan tickets.");
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

  if (loading) {
    return <PageSkeleton variant="tickets" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
            <p className="mt-1 text-gray-500 dark:text-gray-400">Every successful staff scan issues a ticket here.</p>
          </div>
          <button type="button" onClick={() => loadTickets()} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {tickets.length > 0 && (
          <div className="flex w-full flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search tickets</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search ticket, store, promotion, or staff..."
                className="min-h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-[#1b1b1b]/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:border-gray-500 dark:focus:ring-white/10"
              />
            </label>
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
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {tickets.length > 0 && showFilters && (
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
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-gray-400" />
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Filter tickets</h2>
                </div>
                {hasActiveFilters && (
                  <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-black dark:text-gray-300 dark:hover:text-white">
                    <X className="h-3.5 w-3.5" /> Clear filters
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CustomDropdown options={storeOptions} value={storeFilter} onChange={setStoreFilter} ariaLabel="Filter by store" />
                <CustomDropdown
                  options={[
                    { label: "Oldest first", value: "oldest" },
                    { label: "Newest first", value: "newest" },
                  ]}
                  value={sortOrder}
                  onChange={(value) => setSortOrder(value as SortOrder)}
                  ariaLabel="Sort tickets chronologically"
                />
                <label className="relative">
                  <span className="sr-only">Tickets from date</span>
                  <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]" />
                </label>
                <label className="relative">
                  <span className="sr-only">Tickets through date</span>
                  <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="min-h-11 w-full rounded-xl border border-gray-200 bg-white pl-11 pr-3 text-sm text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:[color-scheme:dark]" />
                </label>
              </div>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Choose a store, date range, and chronological order.</p>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {tickets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <Ticket className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 font-bold text-gray-900 dark:text-white">No scan tickets yet</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your first successful scan will appear here automatically.</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <Search className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <h2 className="mt-4 font-bold text-gray-900 dark:text-white">No tickets match your search</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Try changing your search or filters.</p>
          <button type="button" onClick={() => { setSearchQuery(""); clearFilters(); }} className="mt-4 text-sm font-semibold text-gray-700 hover:underline dark:text-gray-200">Clear search and filters</button>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300" aria-live="polite">
            {filteredTicketCount} {filteredTicketCount === 1 ? "ticket" : "tickets"} across {filteredGroups.length} {filteredGroups.length === 1 ? "store" : "stores"}
          </p>
          <div className="space-y-8">
            {paginatedGroups.map((group) => (
              <section key={group.storeName} aria-labelledby={`store-${group.storeName.replace(/[^a-z0-9]/gi, "-")}`}>
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-200">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 id={`store-${group.storeName.replace(/[^a-z0-9]/gi, "-")}`} className="text-xl font-bold text-gray-900 dark:text-white">{group.storeName}</h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{group.tickets.length} {group.tickets.length === 1 ? "ticket" : "tickets"} · {sortOrder === "oldest" ? "oldest to newest" : "newest to oldest"}</p>
                  </div>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {group.tickets.map((ticket) => (
                    <article key={ticket.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">{ticket.ticketNumber}</p>
                          {ticket.promotionTitle && <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{ticket.promotionTitle}</p>}
                        </div>
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Successful
                        </span>
                      </div>
                      <div className="mt-4 rounded-2xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
                        <p className="flex items-center gap-2"><UserRoundCheck className="h-4 w-4 shrink-0" /> Scanned by {ticket.staffName}</p>
                      </div>
                      <div className="mt-5 flex items-end justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{new Date(ticket.issuedAt).toLocaleString()}</p>
                        <p className="flex items-center gap-1 text-lg font-black text-gray-900 dark:text-white">
                          +{ticket.points} <Star className="h-4 w-4 fill-current" />
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      <Pagination
        page={currentPage}
        pageSize={STORE_GROUPS_PER_PAGE}
        totalItems={filteredGroups.length}
        itemLabel="stores"
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
