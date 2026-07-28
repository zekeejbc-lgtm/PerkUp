# Shared-Location Map Pin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the malformed overlapping shared-location marker with one polished SVG count pin.

**Architecture:** `createCustomerStoreMapPin` will return a dedicated SVG-backed `DivIcon` for grouped locations before entering the existing single-store rendering path. This isolates the group visual while preserving all existing grouping and popup behavior.

**Tech Stack:** TypeScript 5.8, Leaflet 1.9, React DOM server rendering, Node test runner

## Global Constraints

- Change only the shared-location visual produced by `CustomerStoreMapPin`.
- Preserve grouping, count calculation, click behavior, popups, and map interaction.
- Add no dependencies.

---

### Task 1: Render a cohesive shared-location count pin

**Files:**
- Create: `src/components/CustomerGroupMapPin.ts`
- Create: `src/components/CustomerGroupMapPinVisual.ts`
- Create: `src/components/CustomerGroupMapPinVisual.test.ts`
- Modify: `src/components/CustomerStoreMapPin.ts`

**Interfaces:**
- Consumes: `CustomerMapLocationGroup<T>` and `getCustomerMapMarkerPresentation`.
- Produces: `getCustomerGroupMapPinVisual(count: number)`, a browser-independent SVG visual model.
- Produces: `createCustomerGroupMapPin(count: number): L.DivIcon`.
- Produces: the existing `createCustomerStoreMapPin<T>(group): L.DivIcon` API.

- [ ] **Step 1: Write the failing generated-icon test**

Call `getCustomerGroupMapPinVisual(2)` and assert that its generated HTML has the group marker identifier, exactly one SVG path, no legacy `inset:-5px` stacked-circle geometry, and the count text `2`. Assert that `iconSize` is `[48, 56]` and `iconAnchor` is `[24, 55]`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
node --experimental-strip-types --test src/components/CustomerGroupMapPinVisual.test.ts
```

Expected: FAIL because the current marker has no cohesive group SVG and still includes the offset stacked circle.

- [ ] **Step 3: Add the minimal group SVG path**

Implement `getCustomerGroupMapPinVisual(count)` as a browser-independent module returning the icon HTML and geometry. Implement `createCustomerGroupMapPin(count)` as a focused Leaflet adapter returning a `DivIcon` from that visual model:

```html
<svg data-customer-map-pin="group" width="48" height="56" viewBox="0 0 48 56">
  <path d="M24 1.5C11.57 1.5 1.5 11.57 1.5 24c0 15.22 18.47 28.4 22.5 31 4.03-2.6 22.5-15.78 22.5-31C46.5 11.57 36.43 1.5 24 1.5Z" />
  <text x="24" y="30">COUNT</text>
</svg>
```

Style the path with a black fill, white 2px stroke, rounded joins, and a restrained drop shadow. Center the count in bold white system text, using 18px for one digit, 15px for two digits, and 12px for three or more digits.

Use:

```ts
iconSize: [48, 56]
iconAnchor: [24, 55]
popupAnchor: [0, -52]
```

When the presentation kind is `group`, return `createCustomerGroupMapPin(presentation.count)`. Remove the legacy `stackedShops` element and keep the existing single-store path unchanged.

- [ ] **Step 4: Run focused and repository verification**

Run:

```powershell
node --experimental-strip-types --test src/components/CustomerGroupMapPinVisual.test.ts src/components/landingMapInteractions.test.ts src/lib/customerMapMarkers.test.ts src/lib/partnerApplicationStore.test.ts
npm run lint
npm run build
```

Expected: all tests pass and both repository commands exit with status 0.
