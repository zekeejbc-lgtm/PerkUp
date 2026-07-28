# Partner Location Search CSP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore production partner address lookup with an explicit, policy-compliant search action.

**Architecture:** Keep the existing Nominatim fetch and suggestion UI inside `PartnerApplicationModal`, but replace address-change debounce with a single reusable `searchLocations` callback invoked by Enter or a Search button. Extend only Vercel's `connect-src` directive for the geocoder origin and protect both the interaction and deployment policy with focused tests.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Testing Library, Vercel configuration

## Global Constraints

- Modify only the partner application address lookup and deployment CSP.
- Keep Nominatim's existing search endpoint and response shape.
- Do not add dependencies, backend services, API keys, caching, or unrelated refactors.
- Preserve manual map pin placement and the existing form submission flow.

---

### Task 1: Explicit partner location search and deployment CSP

**Files:**
- Create: `src/components/PartnerApplicationModal.locationSearch.test.tsx`
- Create: `src/deploymentCsp.test.ts`
- Modify: `src/components/PartnerApplicationModal.tsx`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: the existing Nominatim `/search` endpoint and `LocationSuggestion` response.
- Produces: an address input that searches only on Enter or Search-button activation, plus a CSP that permits the Nominatim HTTPS origin.

- [ ] **Step 1: Write failing interaction tests**

Render `PartnerApplicationModal` with its external map, data, and currency dependencies isolated. Change the address to `Tagum`, advance timers beyond the old 400 ms debounce, and assert `fetch` was not called. In a separate test, change the address to `Tagum`, press Enter, and assert one request was made to:

```text
https://nominatim.openstreetmap.org/search?q=Tagum&format=jsonv2&addressdetails=1&limit=5
```

- [ ] **Step 2: Write the failing deployment-policy test**

Parse `vercel.json`, find the catch-all `Content-Security-Policy` header, isolate its `connect-src` directive, and assert that its tokens include:

```text
https://nominatim.openstreetmap.org
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```powershell
npx vitest run src/components/PartnerApplicationModal.locationSearch.test.tsx src/deploymentCsp.test.ts
```

Expected: typing still calls `fetch`, Enter does not directly search, and the CSP origin is absent.

- [ ] **Step 4: Implement the explicit search action**

Remove the debounce effect and its `skipNextLocationSearch` ref. Move the existing request body into `searchLocations`, validate the trimmed query length, and invoke it from both the input's Enter handler and a `type="button"` Search control. On address change, clear stale suggestions and search errors without fetching. Keep abort handling, loading state, result rendering, and selection behavior.

- [ ] **Step 5: Permit the geocoder in production CSP**

Add this exact origin to `connect-src` in `vercel.json`:

```text
https://nominatim.openstreetmap.org
```

- [ ] **Step 6: Run focused and repository verification**

Run:

```powershell
npx vitest run src/components/PartnerApplicationModal.locationSearch.test.tsx src/deploymentCsp.test.ts
npm test
npm run lint
npm run build
```

Expected: all commands exit with status 0 and the production bundle completes without warnings attributable to this change.
