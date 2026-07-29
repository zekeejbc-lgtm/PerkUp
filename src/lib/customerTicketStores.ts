export type CustomerTicket = {
  id: string;
  ticketNumber: string;
  type: string;
  status: string;
  storeId: string;
  storeName: string;
  staffName: string;
  promotionId: string;
  promotionTitle: string | null;
  points: number;
  issuedAt: string;
};

export type TicketStoreMetadata = {
  id: string;
  name?: string;
  logoUrl?: string;
};

export type TicketStoreGroup = {
  key: string;
  storeId: string;
  storeName: string;
  logoUrl: string;
  latestIssuedAt: string;
  tickets: CustomerTicket[];
};

const ticketTime = (ticket: CustomerTicket) => {
  const time = new Date(ticket.issuedAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const legacyStoreKey = (storeName: string) => {
  const normalized = String(storeName || "Perk Store")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `legacy-${normalized || "perk-store"}`;
};

const storeKey = (ticket: CustomerTicket) => ticket.storeId || legacyStoreKey(ticket.storeName);

const compareTickets = (a: CustomerTicket, b: CustomerTicket) =>
  ticketTime(a) - ticketTime(b) || a.id.localeCompare(b.id);

export function buildTicketStoreGroups(
  tickets: CustomerTicket[],
  stores: TicketStoreMetadata[] = [],
): TicketStoreGroup[] {
  const metadataById = new Map(stores.map((store) => [store.id, store]));
  const grouped = new Map<string, CustomerTicket[]>();

  tickets.forEach((ticket) => {
    const key = storeKey(ticket);
    const storeTickets = grouped.get(key) || [];
    storeTickets.push(ticket);
    grouped.set(key, storeTickets);
  });

  return Array.from(grouped, ([key, storeTickets]) => {
    const sortedTickets = [...storeTickets].sort(compareTickets);
    const fallback = sortedTickets[0];
    const metadata = fallback.storeId ? metadataById.get(fallback.storeId) : undefined;
    const latestTicket = sortedTickets.reduce((latest, current) =>
      ticketTime(current) >= ticketTime(latest) ? current : latest,
    );

    return {
      key,
      storeId: fallback.storeId,
      storeName: String(metadata?.name || fallback.storeName || "Perk Store"),
      logoUrl: String(metadata?.logoUrl || ""),
      latestIssuedAt: latestTicket.issuedAt,
      tickets: sortedTickets,
    };
  }).sort((a, b) => a.storeName.localeCompare(b.storeName) || a.key.localeCompare(b.key));
}

export function filterTicketStores(groups: TicketStoreGroup[], query: string): TicketStoreGroup[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return groups;
  return groups.filter((group) => group.storeName.toLocaleLowerCase().includes(term));
}

export function filterStoreTickets(tickets: CustomerTicket[], query: string): CustomerTicket[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return tickets;

  return tickets.filter((ticket) => [
    ticket.ticketNumber,
    ticket.staffName,
    ticket.promotionTitle,
  ].some((value) => String(value || "").toLocaleLowerCase().includes(term)));
}

export function getTicketStoreGroup(
  groups: TicketStoreGroup[],
  routeKey: string | undefined,
): TicketStoreGroup | undefined {
  if (!routeKey) return undefined;
  return groups.find((group) => group.key === routeKey);
}
