# Homepage Map Pinch-Zoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable two-finger pinch zoom on the homepage store map without capturing one-finger page scrolling or enabling mouse-wheel zoom.

**Architecture:** Define a pointer-aware homepage map interaction contract in a small typed module and spread those options into the existing Leaflet `MapContainer`. Coarse-pointer devices disable one-finger map dragging while retaining touch zoom; fine-pointer devices retain mouse dragging. Verify the application-owned Leaflet boundary with Node's built-in test runner.

**Tech Stack:** React 19, React Leaflet 5, Leaflet 1.9, TypeScript 5.8, Node test runner

## Global Constraints

- Change only the homepage store map.
- Keep mouse-wheel zoom disabled.
- Add no dependencies.

---

### Task 1: Homepage map touch interaction

**Files:**
- Create: `src/components/landingMapInteractions.ts`
- Create: `src/components/landingMapInteractions.test.ts`
- Modify: `src/components/LandingStoreMap.tsx`

**Interfaces:**
- Produces: `getLandingMapInteractionOptions(usesCoarsePointer: boolean)`, which enables touch zoom, disables mouse-wheel zoom, and controls dragging by pointer type.
- Consumes: React Leaflet `MapContainer` interaction props.

- [ ] **Step 1: Write the failing boundary test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getLandingMapInteractionOptions } from "./landingMapInteractions.ts";

test("uses cooperative touch gestures on coarse-pointer devices", () => {
  assert.deepEqual(getLandingMapInteractionOptions(true), {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: false,
  });
});

test("keeps mouse dragging available on fine-pointer devices", () => {
  assert.deepEqual(getLandingMapInteractionOptions(false), {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: true,
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --experimental-strip-types --test src/components/landingMapInteractions.test.ts`

Expected: FAIL because `getLandingMapInteractionOptions` does not exist.

- [ ] **Step 3: Add the minimal interaction options**

```ts
export function getLandingMapInteractionOptions(usesCoarsePointer: boolean) {
  return {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: !usesCoarsePointer,
  } as const;
}
```

- [ ] **Step 4: Apply the options to the homepage map**

Detect `(pointer: coarse)` with `window.matchMedia`, pass that result to `getLandingMapInteractionOptions`, spread the returned options onto `MapContainer`, and remove the existing inline `scrollWheelZoom={false}` prop.

- [ ] **Step 5: Run focused and repository verification**

Run:

```powershell
node --experimental-strip-types --test src/components/landingMapInteractions.test.ts
npm run lint
npm run build
```

Expected: the focused test passes and both repository commands exit with status 0.
