import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, Star, Ticket } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";

type CustomerTicket = {
  id: string;
  ticketNumber: string;
  status: string;
  storeName: string;
  promotionTitle: string | null;
  points: number;
  issuedAt: string;
};

const ticketTime = (ticket: CustomerTicket) => new Date(ticket.issuedAt || 0).getTime();

export default function CustomerTickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const knownIds = useRef(new Set<string>());

  const loadTickets = useCallback(async (quiet = false) => {
    if (!user?.id) return;
    if (!quiet) setRefreshing(true);

    const { data, error: queryError } = await supabase
      .from("promotions_scanned")
      .select("id,data,created_at")
      .eq("data->>customerId", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (queryError) {
      setError("Could not load your scan tickets.");
    } else {
      const next = (data || []).map((row: any) => ({
        id: row.id,
        ticketNumber: row.data.ticketNumber || `LEGACY-${String(row.id).slice(0, 8).toUpperCase()}`,
        status: row.data.status || "issued",
        storeName: row.data.storeName || "PerkUp Store",
        promotionTitle: row.data.promotionTitle || null,
        points: Number(row.data.points || 0),
        issuedAt: row.data.issuedAt || (
          row.data.timestamp?.seconds
            ? new Date(row.data.timestamp.seconds * 1000).toISOString()
            : row.created_at
        ),
      })).sort((a, b) => ticketTime(b) - ticketTime(a));
      setTickets(next);
      knownIds.current = new Set(next.map((ticket) => ticket.id));
      setError("");
    }
    setLoading(false);
    setRefreshing(false);
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
    return <div className="flex min-h-[24rem] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">My Tickets</h1>
          <p className="mt-1 text-gray-500 dark:text-gray-400">Every successful staff scan issues a ticket here.</p>
        </div>
        <button type="button" onClick={() => loadTickets()} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold dark:border-gray-700 dark:bg-gray-900">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      {tickets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <Ticket className="mx-auto h-12 w-12 text-gray-300" />
          <h2 className="mt-4 font-bold text-gray-900 dark:text-white">No scan tickets yet</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Your first successful scan will appear here automatically.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tickets.map((ticket) => (
            <article key={ticket.id} className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs font-bold text-gray-500 dark:text-gray-400">{ticket.ticketNumber}</p>
                  <h2 className="mt-1 text-lg font-bold text-gray-900 dark:text-white">{ticket.storeName}</h2>
                  {ticket.promotionTitle && <p className="text-sm text-gray-500 dark:text-gray-400">{ticket.promotionTitle}</p>}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Successful
                </span>
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
      )}
    </div>
  );
}
