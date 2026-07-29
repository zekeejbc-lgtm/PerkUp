# Customer Cards Store Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the customer Cards page's all-store reward list with a store directory and routed store-specific reward view that includes store loyalty credit, location, navigation, and active/archive card states.

**Architecture:** Extract deterministic store aggregation, search, and reward-state classification into a tested library module. Keep data loading, claims, realtime refresh, and presentation in `CustomerCards.tsx`, selecting the store from the route parameter. Add a focused map component that reuses the existing customer map pin, base layers, and directions button.

**Tech Stack:** React 19, React Router 7, TypeScript 5.8, Tailwind CSS 4, React Leaflet 5, Lucide React, Vitest 3, Supabase-backed `dataCompat`.

## Global Constraints

- `/customer/cards` is the store directory and `/customer/cards/:storeId` is the selected store page.
- Use the existing card `stars` field as store loyalty credit; do not add a database field or migration.
- Group stores by canonical `storeId`, sum loyalty credit across duplicate card rows, and never expose cards from a different store route.
- Show reward sections in this order: `Ready to Claim`, `Ongoing`, `Archived / Expired`.
- Reuse existing claim, QR/code, realtime, map marker, base layer, and directions behavior.
- Preserve responsive layout, dark mode, loading, empty, invalid-route, and missing-coordinate states.

---

### Task 1: Tested Customer Card Store Model

**Files:**
- Create: `src/lib/customerCardStores.ts`
- Create: `src/lib/customerCardStores.test.ts`

**Interfaces:**
- Consumes: customer card rows, loaded store records, and promotion-card view models from `CustomerCards.tsx`.
- Produces: `RewardSection`, `CustomerCardStoreSummary`, `getRewardSection(promo, now)`, `buildCustomerCardStores(cards, stores, promotions)`, `filterCustomerCardStores(stores, search)`, and `getStoreRewardGroups(promotions, storeId, search, now)`.

- [ ] **Step 1: Write failing tests for store aggregation and loyalty credit**

```ts
test("groups duplicate card rows by store and sums loyalty credit", () => {
  const result = buildCustomerCardStores(
    [
      { id: "card-1", storeId: "store-1", storeName: "Fallback", stars: 3 },
      { id: "card-2", storeId: "store-1", storeName: "Fallback", stars: 4 },
    ],
    [{ id: "store-1", name: "Coffee House", logoUrl: "/coffee.png" }],
    [{ id: "promo-1", storeId: "store-1", progress: 2 }],
  );

  expect(result).toEqual([
    expect.objectContaining({
      id: "store-1",
      name: "Coffee House",
      logoUrl: "/coffee.png",
      loyaltyCredit: 7,
      rewardCount: 1,
    }),
  ]);
});

test("filters the store directory by store name only", () => {
  const stores = [
    { id: "one", name: "Coffee House", loyaltyCredit: 1, rewardCount: 1, cards: [], store: {} },
    { id: "two", name: "Bakery", loyaltyCredit: 2, rewardCount: 1, cards: [], store: {} },
  ];

  expect(filterCustomerCardStores(stores, "coffee").map((store) => store.id)).toEqual(["one"]);
  expect(filterCustomerCardStores(stores, "reward title")).toEqual([]);
});
```

- [ ] **Step 2: Run the model tests and verify the missing-module failure**

Run: `npm.cmd test -- src/lib/customerCardStores.test.ts`

Expected: FAIL because `customerCardStores.ts` does not exist.

- [ ] **Step 3: Implement minimal store aggregation and directory search**

```ts
export type CustomerCardStoreSummary = {
  id: string;
  name: string;
  logoUrl: string;
  loyaltyCredit: number;
  rewardCount: number;
  cards: any[];
  store: any;
};

export function buildCustomerCardStores(cards: any[], stores: any[], promotions: any[]) {
  const storesById = new Map(stores.map((store) => [String(store.id), store]));
  const cardsByStore = new Map<string, any[]>();
  cards.forEach((card) => {
    const storeId = String(card.storeId || "");
    if (!storeId) return;
    cardsByStore.set(storeId, [...(cardsByStore.get(storeId) || []), card]);
  });

  return [...cardsByStore.entries()].map(([storeId, storeCards]) => {
    const store = storesById.get(storeId) || {};
    return {
      id: storeId,
      name: String(store.name || storeCards[0]?.storeName || "Participating store"),
      logoUrl: String(store.logoUrl || ""),
      loyaltyCredit: storeCards.reduce((sum, card) => sum + Math.max(Number(card.stars || 0), 0), 0),
      rewardCount: promotions.filter((promo) => String(promo.storeId || "") === storeId).length,
      cards: storeCards,
      store,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function filterCustomerCardStores(stores: CustomerCardStoreSummary[], search: string) {
  const term = search.trim().toLocaleLowerCase();
  return term ? stores.filter((store) => store.name.toLocaleLowerCase().includes(term)) : stores;
}
```

- [ ] **Step 4: Run the model tests and verify they pass**

Run: `npm.cmd test -- src/lib/customerCardStores.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing tests for reward sections and route isolation**

```ts
test("classifies active rewards into ready and ongoing sections", () => {
  expect(getRewardSection({ progress: 10, requiredStamps: 10 }, NOW)).toBe("Ready to Claim");
  expect(getRewardSection({ progress: 3, requiredStamps: 10 }, NOW)).toBe("Ongoing");
  expect(getRewardSection({ progress: 10, requiredStamps: 10, claim: { status: "claimed" } }, NOW)).toBe("Ready to Claim");
});

test("archives redeemed, expired, inactive, and ended rewards", () => {
  expect(getRewardSection({ claim: { status: "redeemed" } }, NOW)).toBe("Archived / Expired");
  expect(getRewardSection({ claim: { status: "expired" } }, NOW)).toBe("Archived / Expired");
  expect(getRewardSection({ active: false }, NOW)).toBe("Archived / Expired");
  expect(getRewardSection({ endDate: "2026-01-01" }, NOW)).toBe("Archived / Expired");
});

test("returns only the selected store rewards in display order", () => {
  const groups = getStoreRewardGroups([
    { id: "other", storeId: "store-2", title: "Other", progress: 10, requiredStamps: 10 },
    { id: "ongoing", storeId: "store-1", title: "Ongoing", progress: 2, requiredStamps: 10 },
    { id: "ready", storeId: "store-1", title: "Ready", progress: 10, requiredStamps: 10 },
  ], "store-1", "", NOW);

  expect(groups.map((group) => group.status)).toEqual(["Ready to Claim", "Ongoing"]);
  expect(groups.flatMap((group) => group.promotions.map((promo) => promo.id))).toEqual(["ready", "ongoing"]);
});
```

- [ ] **Step 6: Run the model tests and verify the new assertions fail**

Run: `npm.cmd test -- src/lib/customerCardStores.test.ts`

Expected: FAIL because reward classification and grouping exports are missing.

- [ ] **Step 7: Implement reward classification and selected-store grouping**

```ts
export type RewardSection = "Ready to Claim" | "Ongoing" | "Archived / Expired";

const rewardSectionOrder: RewardSection[] = ["Ready to Claim", "Ongoing", "Archived / Expired"];

export function getRewardSection(promo: any, now = Date.now()): RewardSection {
  const claimStatus = String(promo.claim?.status || "");
  const endsAt = promo.endDate ? getPhilippineDateTimeMillis(promo.endDate) : Number.NaN;
  if (
    claimStatus === "redeemed" ||
    claimStatus === "expired" ||
    promo.active === false ||
    (Number.isFinite(endsAt) && endsAt <= now)
  ) return "Archived / Expired";

  const required = Math.max(Number(promo.requiredStamps || 10), 1);
  return Number(promo.progress || 0) >= required ? "Ready to Claim" : "Ongoing";
}

export function getStoreRewardGroups(promotions: any[], storeId: string, search: string, now = Date.now()) {
  const term = search.trim().toLocaleLowerCase();
  const matching = promotions.filter((promo) =>
    String(promo.storeId || "") === storeId &&
    (!term || [promo.title, promo.description, promo.publicId, promo.card?.publicId, promo.linkedProductName]
      .some((value) => String(value || "").toLocaleLowerCase().includes(term)))
  );

  return rewardSectionOrder
    .map((status) => ({ status, promotions: matching.filter((promo) => getRewardSection(promo, now) === status) }))
    .filter((group) => group.promotions.length);
}
```

- [ ] **Step 8: Run the model tests and verify all pass**

Run: `npm.cmd test -- src/lib/customerCardStores.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit the tested model**

```powershell
git add -- src/lib/customerCardStores.ts src/lib/customerCardStores.test.ts
git commit -m "feat: model customer cards by store"
```

### Task 2: Store Location Panel

**Files:**
- Create: `src/components/CustomerRewardStoreLocation.tsx`
- Reference: `src/pages/customer/CustomerStores.tsx`
- Reference: `src/components/DirectionsButton.tsx`
- Reference: `src/components/MapBaseLayers.tsx`
- Reference: `src/components/CustomerStoreMapPin.ts`

**Interfaces:**
- Consumes: `store` with `id`, `name`, `logoUrl`, `lat`/`latitude`, `lng`/`longitude`, and `address`.
- Produces: `CustomerRewardStoreLocation({ store })`.

- [ ] **Step 1: Implement the focused location panel with existing map behavior**

```tsx
export function CustomerRewardStoreLocation({ store }: { store: any }) {
  const lat = Number(store.lat ?? store.latitude);
  const lng = Number(store.lng ?? store.longitude);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng);
  const destination = { lat, lng, address: String(store.address || ""), name: String(store.name || "Store") };

  return (
    <section aria-labelledby="store-location-heading" className="overflow-hidden rounded-3xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 id="store-location-heading" className="font-bold">Store location</h2>
          <p className="mt-1 text-sm text-gray-500">{store.address || "Location details are unavailable."}</p>
        </div>
        {(hasCoordinates || store.address) && <DirectionsButton destination={destination} />}
      </div>
      {hasCoordinates ? (
        <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom className="h-72 w-full" style={{ zIndex: 0 }}>
          <MapBaseLayers />
          <Marker
            position={[lat, lng]}
            icon={createCustomerStoreMapPin({ key: `${lat}:${lng}`, lat, lng, items: [{ ...store, lat, lng }] })}
          >
            <Popup><p className="font-bold">{store.name}</p><p className="mt-1 text-xs">{store.address}</p></Popup>
          </Marker>
        </MapContainer>
      ) : (
        <div className="flex h-32 items-center justify-center border-t border-dashed border-gray-200 px-6 text-center text-sm text-gray-500 dark:border-gray-800">
          Map coordinates are unavailable for this store.
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Run TypeScript to verify the component API and marker types**

Run: `npm.cmd run lint`

Expected: PASS. If the existing marker helper requires a grouped-location type annotation, import `CustomerMapLocationGroup` from `src/lib/customerMapMarkers.ts` and type the one-item group explicitly without changing runtime behavior.

- [ ] **Step 3: Commit the store location panel**

```powershell
git add -- src/components/CustomerRewardStoreLocation.tsx
git commit -m "feat: add reward store location panel"
```

### Task 3: Routed Store Directory and Store Reward Page

**Files:**
- Modify: `src/pages/CustomerDashboard.tsx`
- Modify: `src/pages/customer/CustomerCards.tsx`
- Use: `src/lib/customerCardStores.ts`
- Use: `src/components/CustomerRewardStoreLocation.tsx`

**Interfaces:**
- Consumes: Task 1 model functions and Task 2 location panel.
- Produces: store directory at `/customer/cards`, store detail at `/customer/cards/:storeId`, and unchanged reward claim/details interactions.

- [ ] **Step 1: Add the optional store route**

```tsx
<Route path="/cards" element={<CustomerCards />} />
<Route path="/cards/:storeId" element={<CustomerCards />} />
```

- [ ] **Step 2: Extend card loading to retain card rows and authoritative store metadata**

Add `cards` and `stores` state, keep the existing promotion/claim association, and store complete store documents:

```ts
const [cards, setCards] = useState<any[]>([]);
const [stores, setStores] = useState<any[]>([]);

const storeEntries = await Promise.all(storeIds.map(async (storeId) => {
  const storeSnap = await getDoc(doc(db, "stores", storeId));
  return { id: storeId, ...(storeSnap.exists() ? storeSnap.data() : {}) };
}));

setCards(cards);
setStores(storeEntries);
setStoreStyles(Object.fromEntries(storeEntries.map((store) => [store.id, normalizeStampStyle(store)])));
```

The local fetched-card variable must be renamed to `fetchedCards` to avoid shadowing the React state name.

- [ ] **Step 3: Build route-selected directory and reward view models**

```ts
const { storeId } = useParams();
const storeSummaries = useMemo(
  () => buildCustomerCardStores(cards, stores, promoCards),
  [cards, stores, promoCards],
);
const selectedStore = useMemo(
  () => storeSummaries.find((store) => store.id === storeId),
  [storeId, storeSummaries],
);
const visibleStores = useMemo(
  () => filterCustomerCardStores(storeSummaries, search),
  [search, storeSummaries],
);
const rewardGroups = useMemo(
  () => storeId ? getStoreRewardGroups(promoCards, storeId, search) : [],
  [promoCards, search, storeId],
);
```

- [ ] **Step 4: Render the store directory**

Each directory tile must be a `Link` to `/customer/cards/${encodeURIComponent(store.id)}` and show:

```tsx
<img src={getDisplayImageUrl(store.logoUrl)} alt={`${store.name} logo`} />
<h3>{store.name}</h3>
<p>{store.loyaltyCredit} loyalty credit</p>
<p>{store.rewardCount} {store.rewardCount === 1 ? "reward card" : "reward cards"}</p>
```

Use a `Store` icon in a bordered logo container when `logoUrl` is empty. Keep the responsive one-column, two-column, and three-column grid and retain `EmptyCards` when no store summaries exist.

- [ ] **Step 5: Render invalid-store and selected-store states**

When `storeId` exists but `selectedStore` does not, render a safe not-found card with a `Link` back to `/customer/cards`.

For a selected store, render:

- Back link.
- Store logo/name.
- `{selectedStore.loyaltyCredit} loyalty credit`.
- `CustomerRewardStoreLocation` with `{ ...selectedStore.store, id, name, logoUrl }`.
- Store-only search and grid/list control.
- Reward sections from `rewardGroups`.
- Existing `RewardCard` components and `PromoCardDetailsModal`.

- [ ] **Step 6: Preserve archived-card detail behavior**

Update `RewardCard` and the details modal so archived/expired cards remain openable but do not show a new claim button unless the existing claim rules allow it. Active claimed rewards continue to open `ClaimPanel`. Redeemed and expired messages remain visible.

- [ ] **Step 7: Run focused model tests and TypeScript**

Run: `npm.cmd test -- src/lib/customerCardStores.test.ts`

Expected: PASS.

Run: `npm.cmd run lint`

Expected: PASS.

- [ ] **Step 8: Commit the routed UI**

```powershell
git add -- src/pages/CustomerDashboard.tsx src/pages/customer/CustomerCards.tsx
git commit -m "feat: organize customer cards by store"
```

### Task 4: Full Verification

**Files:**
- Verify: `src/lib/customerCardStores.test.ts`
- Verify: `src/components/CustomerRewardStoreLocation.tsx`
- Verify: `src/pages/customer/CustomerCards.tsx`
- Verify: `src/pages/CustomerDashboard.tsx`

**Interfaces:**
- Consumes: the completed implementation.
- Produces: fresh evidence that tests, TypeScript, and production build succeed.

- [ ] **Step 1: Run all automated tests**

Run: `npm.cmd test`

Expected: all Vitest files and tests pass with zero failures.

- [ ] **Step 2: Run the TypeScript check**

Run: `npm.cmd run lint`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Run the production build**

Run: `npm.cmd run -s build`

Expected: exit code 0 and Vite produces the production bundle.

- [ ] **Step 4: Inspect the final diff and repository status**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only the user's pre-existing unrelated migration/test files may remain untracked; all feature files are committed.

- [ ] **Step 5: Report the implemented behavior and verification evidence**

Summarize the two routes, loyalty credit source, map/navigation reuse, reward section mapping, and exact test/build commands that passed.
