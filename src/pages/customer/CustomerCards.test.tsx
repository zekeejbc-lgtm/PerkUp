import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, test, vi } from "vitest";

const cardRows = [
  {
    id: "card-coffee",
    storeId: "store-coffee",
    storeName: "Coffee House",
    stars: 8,
    promoProgress: { "promo-coffee": 5 },
  },
  {
    id: "card-bakery",
    storeId: "store-bakery",
    storeName: "Bakery",
    stars: 2,
    promoProgress: { "promo-bakery": 1 },
  },
];

const promotionRows = [
  {
    id: "promo-coffee",
    storeId: "store-coffee",
    title: "Free Coffee",
    description: "Coffee reward",
    requiredStamps: 5,
    active: true,
  },
  {
    id: "promo-bakery",
    storeId: "store-bakery",
    title: "Free Bread",
    description: "Bakery reward",
    requiredStamps: 5,
    active: true,
  },
];

const stores: Record<string, Record<string, unknown>> = {
  "store-coffee": {
    name: "Coffee House",
    logoUrl: "/coffee.png",
    address: "Tagum City",
    lat: 7.44,
    lng: 125.8,
  },
  "store-bakery": {
    name: "Bakery",
    logoUrl: "/bakery.png",
    address: "Apokon Road",
    lat: 7.45,
    lng: 125.81,
  },
};

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "customer-1" } }),
}));

vi.mock("@/src/lib/dataCompat", () => ({
  collection: (_db: unknown, name: string) => ({ name }),
  where: () => ({}),
  query: (source: unknown) => source,
  doc: (_db: unknown, _name: string, id: string) => ({ id }),
  getDocsFromServer: vi.fn(async () => ({
    docs: cardRows.map((row) => ({ id: row.id, data: () => row })),
  })),
  getDocs: vi.fn(async () => ({
    docs: promotionRows.map((row) => ({ id: row.id, data: () => row })),
  })),
  getDoc: vi.fn(async ({ id }: { id: string }) => ({
    exists: () => Boolean(stores[id]),
    data: () => stores[id] || {},
  })),
}));

vi.mock("../../lib/backend", () => ({
  db: {},
  handleDataError: vi.fn(),
  OperationType: { GET: "get" },
}));

const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
channel.on.mockReturnValue(channel);
channel.subscribe.mockReturnValue(channel);

vi.mock("../../lib/supabase", () => ({
  supabase: {
    channel: () => channel,
    removeChannel: vi.fn(),
  },
}));

vi.mock("../../lib/promotionClaims", () => ({
  listPromotionClaims: vi.fn(async () => []),
  claimPromotion: vi.fn(),
}));

vi.mock("../../components/CustomerRewardStoreLocation", () => ({
  CustomerRewardStoreLocation: ({ store }: { store: any }) => (
    <section aria-label="Store location">{store.address}</section>
  ),
}));

import CustomerCards from "./CustomerCards";

beforeEach(() => {
  channel.on.mockClear();
  channel.subscribe.mockClear();
});

test("shows stores and loyalty credit before reward cards", async () => {
  renderCardsRoute("/customer/cards");

  await screen.findByRole("link", { name: /open coffee house reward cards/i });
  screen.getByText("8 loyalty credit");
  screen.getByRole("link", { name: /open bakery reward cards/i });
  if (screen.queryByText("Free Coffee")) throw new Error("Promotion cards must not appear in the store directory.");
});

test("shows only the selected store rewards and location", async () => {
  renderCardsRoute("/customer/cards/store-coffee");

  await screen.findByRole("heading", { name: "Coffee House" });
  screen.getByText("8 loyalty credit");
  screen.getByRole("region", { name: "Store location" });
  screen.getByText("Free Coffee");
  if (screen.queryByText("Free Bread")) throw new Error("A store route must not expose another store's rewards.");
});

function renderCardsRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/customer/cards" element={<CustomerCards />} />
        <Route path="/customer/cards/:storeId" element={<CustomerCards />} />
      </Routes>
    </MemoryRouter>,
  );
}
