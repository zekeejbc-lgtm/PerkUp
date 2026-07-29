import assert from "node:assert/strict";
import { test } from "vitest";
import {
  buildTicketStoreGroups,
  filterStoreTickets,
  filterTicketStores,
  getTicketStoreGroup,
  type CustomerTicket,
} from "./customerTicketStores.ts";

const ticket = (overrides: Partial<CustomerTicket> = {}): CustomerTicket => ({
  id: "ticket-1",
  ticketNumber: "TKT-ONE",
  type: "points",
  status: "issued",
  storeId: "store-1",
  storeName: "Ticket Store",
  staffName: "Alex",
  promotionId: "",
  promotionTitle: null,
  points: 1,
  issuedAt: "2026-07-29T08:00:00.000Z",
  ...overrides,
});

test("groups canonical stores separately and applies authoritative metadata", () => {
  const groups = buildTicketStoreGroups(
    [
      ticket(),
      ticket({ id: "ticket-2", ticketNumber: "TKT-TWO", storeId: "store-2" }),
      ticket({ id: "ticket-3", ticketNumber: "TKT-THREE" }),
    ],
    [
      { id: "store-1", name: "Coffee House", logoUrl: "/coffee.png" },
      { id: "store-2", name: "Coffee House", logoUrl: "/coffee-branch.png" },
    ],
  );

  assert.deepEqual(
    groups.map(({ key, storeName, logoUrl, tickets }) => ({
      key,
      storeName,
      logoUrl,
      ticketNumbers: tickets.map((item) => item.ticketNumber),
    })),
    [
      {
        key: "store-1",
        storeName: "Coffee House",
        logoUrl: "/coffee.png",
        ticketNumbers: ["TKT-ONE", "TKT-THREE"],
      },
      {
        key: "store-2",
        storeName: "Coffee House",
        logoUrl: "/coffee-branch.png",
        ticketNumbers: ["TKT-TWO"],
      },
    ],
  );
});

test("keeps legacy tickets routable with a deterministic store-name key", () => {
  const groups = buildTicketStoreGroups([
    ticket({ id: "legacy-1", storeId: "", storeName: "  Tagum Pay  " }),
    ticket({ id: "legacy-2", storeId: "", storeName: "tagum pay" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "legacy-tagum-pay");
  assert.deepEqual(groups[0].tickets.map((item) => item.id), ["legacy-1", "legacy-2"]);
});

test("sorts tickets chronologically with ticket ID as the tie-breaker", () => {
  const [group] = buildTicketStoreGroups([
    ticket({ id: "z", issuedAt: "invalid" }),
    ticket({ id: "b", issuedAt: "2026-07-29T09:00:00.000Z" }),
    ticket({ id: "a", issuedAt: "2026-07-29T09:00:00.000Z" }),
    ticket({ id: "early", issuedAt: "2026-07-29T07:00:00.000Z" }),
  ]);

  assert.deepEqual(group.tickets.map((item) => item.id), ["z", "early", "a", "b"]);
});

test("returns only the exact selected store group", () => {
  const groups = buildTicketStoreGroups([
    ticket(),
    ticket({ id: "ticket-2", storeId: "store-2" }),
  ]);

  assert.deepEqual(getTicketStoreGroup(groups, "store-2")?.tickets.map((item) => item.id), ["ticket-2"]);
  assert.equal(getTicketStoreGroup(groups, "missing"), undefined);
});

test("filters directory names separately from ticket history fields", () => {
  const groups = buildTicketStoreGroups([
    ticket({ promotionTitle: "Birthday Reward" }),
    ticket({
      id: "ticket-2",
      storeId: "store-2",
      storeName: "Bakery",
      staffName: "Domingo",
      ticketNumber: "TKT-BAKE",
    }),
  ]);

  assert.deepEqual(filterTicketStores(groups, "ticket store").map((group) => group.key), ["store-1"]);
  assert.deepEqual(filterTicketStores(groups, "birthday reward"), []);
  assert.deepEqual(
    filterStoreTickets(getTicketStoreGroup(groups, "store-1")!.tickets, "birthday").map((item) => item.id),
    ["ticket-1"],
  );
  assert.deepEqual(
    filterStoreTickets(getTicketStoreGroup(groups, "store-2")!.tickets, "domingo").map((item) => item.id),
    ["ticket-2"],
  );
});
