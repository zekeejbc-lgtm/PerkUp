# Customer Map Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every customer-facing store map one consistent custom pin, show shop logos fully without icon overlays, and combine shops at the same coordinates into a clear count marker.

**Architecture:** Add a small, framework-independent grouping and marker-presentation module, plus one Leaflet icon factory shared by the public landing map, signed-in customer directory, and public store branch map. Each map keeps its context-specific popup content while consuming the same grouped locations and marker visuals.

**Tech Stack:** React 19, TypeScript, Leaflet 1.9, React Leaflet 5, Node's built-in test runner

## Global Constraints

- Customer-facing maps only; admin and owner location-entry maps remain unchanged.
- A single shop with `logoUrl` shows that full logo with no store-icon or count overlay.
- A single shop without `logoUrl` shows the standard custom store pin.
- Two or more shops at the same coordinate render as one count pin and expose every shop in the popup.
- Coordinates are grouped after rounding to six decimal places to absorb insignificant storage precision differences.

---

### Task 1: Grouping and presentation rules

**Files:**
- Create: `src/lib/customerMapMarkers.ts`
- Test: `src/lib/customerMapMarkers.test.ts`

**Interfaces:**
- Produces: `groupCustomerMapLocations<T>(locations: T[]): CustomerMapLocationGroup<T>[]`
- Produces: `getCustomerMapMarkerPresentation(group): { kind: "store" } | { kind: "logo"; logoUrl: string } | { kind: "group"; count: number }`

- [ ] **Step 1: Write failing tests**

Cover grouping two coordinates that differ below six-decimal precision, keeping genuinely distinct coordinates separate, selecting a logo-only presentation for a single logo-backed shop, selecting the store presentation without a logo, and selecting the count presentation for a co-located group.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test src/lib/customerMapMarkers.test.ts`

Expected: FAIL because `customerMapMarkers.ts` does not exist.

- [ ] **Step 3: Implement the minimum pure functions**

Normalize numeric coordinates, key them to six decimal places, preserve input order, and derive the marker presentation only from group size and the trimmed logo URL.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --experimental-strip-types --test src/lib/customerMapMarkers.test.ts`

Expected: all tests pass.

### Task 2: Shared Leaflet icon

**Files:**
- Create: `src/components/CustomerStoreMapPin.ts`

**Interfaces:**
- Consumes: `getCustomerMapMarkerPresentation`
- Produces: `createCustomerStoreMapPin(group, options?): L.DivIcon`

- [ ] **Step 1: Build the icon from the tested presentation**

Render a 44-pixel pin head and pointer. Use `object-fit: contain` for logo artwork, a store glyph for the fallback, and a centered numeric count for a group. Do not render fallback glyphs or badges over a single logo.

- [ ] **Step 2: Type-check the icon**

Run: `npm run lint`

Expected: TypeScript exits successfully.

### Task 3: Landing and customer-directory maps

**Files:**
- Modify: `src/components/LandingStoreMap.tsx`
- Modify: `src/pages/customer/CustomerStores.tsx`

**Interfaces:**
- Consumes: `groupCustomerMapLocations`
- Consumes: `createCustomerStoreMapPin`

- [ ] **Step 1: Replace one-marker-per-store rendering**

Memoize coordinate groups, render one marker per group, and keep single-store popup actions unchanged.

- [ ] **Step 2: Add grouped popup content**

For a group, label the number of shops and render a compact list containing each full logo or fallback glyph, shop name, details link, and directions action.

- [ ] **Step 3: Type-check**

Run: `npm run lint`

Expected: TypeScript exits successfully.

### Task 4: Public store branch map and final verification

**Files:**
- Modify: `src/pages/StorePage.tsx`

**Interfaces:**
- Consumes: `groupCustomerMapLocations`
- Consumes: `createCustomerStoreMapPin`

- [ ] **Step 1: Group branch markers**

Group mapped branches by coordinates, render the shared icon, and list every co-located branch in one popup while preserving branch navigation and directions.

- [ ] **Step 2: Run focused tests**

Run: `node --experimental-strip-types --test src/lib/customerMapMarkers.test.ts`

Expected: all tests pass.

- [ ] **Step 3: Run full static and production verification**

Run: `npm run lint`

Run: `npm run build`

Expected: both commands exit successfully.
