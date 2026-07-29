import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const ticketRows = [
  {
    id: "referral-ticket",
    public_id: "TKT-REFERRAL",
    created_at: "2026-07-29T08:22:29.000Z",
    data: {
      customerId: "customer-1",
      storeId: "store-1",
      storeName: "Perk Store",
      type: "referral",
      points: 1,
    },
  },
  {
    id: "scan-ticket",
    public_id: "TKT-SCAN",
    created_at: "2026-07-29T09:22:29.000Z",
    data: {
      customerId: "customer-1",
      storeId: "store-1",
      storeName: "Perk Store",
      staffName: "Alex",
      type: "points",
      points: 2,
    },
  },
  {
    id: "promotion-ticket",
    public_id: "TKT-PROMO",
    created_at: "2026-07-29T10:22:29.000Z",
    data: {
      customerId: "customer-1",
      storeId: "store-1",
      storeName: "Perk Store",
      staffName: "Domingo",
      promotionId: "promotion-1",
      promotionTitle: "Testing the Promotion",
      type: "points",
      points: 1,
    },
  },
  {
    id: "other-store-ticket",
    public_id: "TKT-OTHER",
    created_at: "2026-07-29T11:22:29.000Z",
    data: {
      customerId: "customer-1",
      storeId: "store-2",
      storeName: "Other Store",
      staffName: "Taylor",
      type: "points",
      points: 3,
    },
  },
];

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "customer-1" } }),
}));

vi.mock("../../lib/supabase", () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    range: vi.fn(async () => ({ data: ticketRows, error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);

  const channel = {
    on: vi.fn(),
    subscribe: vi.fn(),
  };
  channel.on.mockReturnValue(channel);
  channel.subscribe.mockReturnValue(channel);

  return {
    supabase: {
      from: vi.fn(() => query),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock("../../lib/dataCompat", () => ({
  doc: (_db: unknown, _collection: string, id: string) => ({ id }),
  getDoc: vi.fn(async ({ id }: { id: string }) => ({
    exists: () => id === "store-1" || id === "store-2",
    data: () => id === "store-1"
      ? { name: "Perk Store", logoUrl: "/perk-store.png" }
      : { name: "Other Store", logoUrl: "/other-store.png" },
  })),
}));

vi.mock("../../lib/backend", () => ({
  db: {},
}));

import CustomerTickets from "./CustomerTickets";

describe("CustomerTickets store routes", () => {
  it("shows a store directory before any ticket cards", async () => {
    renderTicketsRoute("/customer/tickets");

    await screen.findByRole("link", { name: /open perk store ticket history/i });

    expect(screen.getByRole("link", { name: /open other store ticket history/i })).toBeInTheDocument();
    expect(screen.getByAltText("Perk Store logo")).toHaveAttribute("src", "/perk-store.png");
    expect(screen.queryByText("TKT-SCAN")).not.toBeInTheDocument();
  });

  it("shows only the selected store history with credit sources in chronological order", async () => {
    renderTicketsRoute("/customer/tickets/store-1");

    await screen.findByText("TKT-REFERRAL");

    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("TKT-REFERRAL"),
      expect.stringContaining("TKT-SCAN"),
      expect.stringContaining("TKT-PROMO"),
    ]);
    expect(screen.getAllByText("General loyalty credit")).toHaveLength(2);
    expect(screen.getByText("Promotion credited")).toBeInTheDocument();
    expect(screen.getByText("Testing the Promotion")).toBeInTheDocument();
    expect(screen.queryByText("TKT-OTHER")).not.toBeInTheDocument();
  });

  it("labels referral rewards separately from staff scans", async () => {
    renderTicketsRoute("/customer/tickets/store-1");

    await waitFor(() => {
      expect(screen.getByText("TKT-REFERRAL")).toBeInTheDocument();
    });

    expect(screen.getByText("Store referral code redeemed")).toBeInTheDocument();
    expect(screen.getByText("Scanned by Alex")).toBeInTheDocument();
    expect(screen.queryByText("Scanned by Store staff")).not.toBeInTheDocument();
  });

  it("does not expose tickets for an invalid store route", async () => {
    renderTicketsRoute("/customer/tickets/missing");

    await screen.findByRole("heading", { name: "Ticket store not found" });
    expect(screen.queryByText("TKT-SCAN")).not.toBeInTheDocument();
    expect(screen.queryByText("TKT-OTHER")).not.toBeInTheDocument();
  });
});

function renderTicketsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/customer/tickets" element={<CustomerTickets />} />
        <Route path="/customer/tickets/:storeId" element={<CustomerTickets />} />
      </Routes>
    </MemoryRouter>,
  );
}
