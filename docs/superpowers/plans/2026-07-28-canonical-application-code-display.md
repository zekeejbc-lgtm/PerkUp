# Canonical Application Code Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make partner application submission and tracking results consistently display the canonical `APP-...` public identifier.

**Architecture:** Keep the Edge Function's backward-compatible lookup paths unchanged. Change only the tracking modal's presentation so it renders the API's `trackingNumber` directly, and protect the behavior with a component-level regression test.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

## Global Constraints

- Successful tracking results display only the canonical `APP-...` identifier returned by the API.
- Existing `PKUP-...` codes remain valid lookup inputs.
- No database schema, stored records, or Edge Function behavior changes.

---

### Task 1: Canonical tracking-result display

**Files:**
- Create: `src/components/PartnerApplicationTrackingModal.test.tsx`
- Modify: `src/components/PartnerApplicationTrackingModal.tsx:4,96-100,137`

**Interfaces:**
- Consumes: `trackPartnerApplication(trackingNumber: string)` and its `PartnerApplicationStatus` response.
- Produces: A tracking result card that displays `application.trackingNumber` unchanged.

- [ ] **Step 1: Write the failing regression test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("../lib/partnerApplication", () => ({
  trackPartnerApplication: vi.fn().mockResolvedValue({
    trackingNumber: "APP-J42HXT4F",
    legacyTrackingNumber: "PKUP-COFFEE-F4A6-1656",
    applicationId: "f4a6ee1f-4a30-41cc-a8a0-2bdb414d1656",
    businessName: "Coffee Shop",
    subscriptionLevel: "Testing Plan",
    status: "pending",
    createdAt: "2026-07-28T14:32:43.000Z",
    updatedAt: "2026-07-28T14:32:43.000Z",
  }),
}));

import { PartnerApplicationTrackingModal } from "./PartnerApplicationTrackingModal";

describe("PartnerApplicationTrackingModal", () => {
  test("displays the canonical application code returned by tracking", async () => {
    render(<PartnerApplicationTrackingModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Application Code"), {
      target: { value: "APP-J42HXT4F" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Track" }));

    expect(await screen.findByText("APP-J42HXT4F")).toBeInTheDocument();
    expect(screen.queryByText("PKUP-COFFEE-F4A6-1656")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/PartnerApplicationTrackingModal.test.tsx`

Expected: FAIL because the modal derives and displays `PKUP-COFFEE-F4A6-1656` instead of `APP-J42HXT4F`.

- [ ] **Step 3: Implement the minimal presentation fix**

Remove the `formatApplicationTrackingCode` import, set:

```tsx
const applicationCode = application?.trackingNumber || "";
```

Change the input placeholder to:

```tsx
placeholder="APP-ABCDEFGH"
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/components/PartnerApplicationTrackingModal.test.tsx`

Expected: PASS with one passing regression test.

- [ ] **Step 5: Run full verification**

Run:

```powershell
npm test
npm run lint
npm run build
```

Expected: all tests pass, TypeScript exits successfully, and Vite produces the production build.

- [ ] **Step 6: Commit**

```powershell
git add -- src/components/PartnerApplicationTrackingModal.tsx src/components/PartnerApplicationTrackingModal.test.tsx
git commit -m "fix: display canonical partner application code"
```
