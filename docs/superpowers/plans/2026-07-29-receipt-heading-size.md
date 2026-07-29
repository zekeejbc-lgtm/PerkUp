# Receipt Heading Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the generated receipt heading to 16pt while retaining the invoice heading at 26pt.

**Architecture:** Keep the shared jsPDF renderer and select only the title font size from `document.kind`. Expose the size selection as a small pure function so both receipt and invoice behavior can be tested without mocking jsPDF.

**Tech Stack:** TypeScript, jsPDF, Vitest

## Global Constraints

- Receipt heading: 16pt.
- Invoice heading: 26pt.
- Do not change title text, alignment, spacing, document numbers, or other styles.

---

### Task 1: Select the Billing Document Heading Size

**Files:**
- Create: `src/lib/subscriptionInvoicePdf.test.ts`
- Modify: `src/lib/subscriptionInvoicePdf.ts:91-95`
- Modify: `src/lib/subscriptionInvoicePdf.ts:168-171`

**Interfaces:**
- Consumes: billing document kind `"invoice" | "receipt"`.
- Produces: `billingDocumentTitleFontSize(kind): number`.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { billingDocumentTitleFontSize } from "./subscriptionInvoicePdf";

describe("billingDocumentTitleFontSize", () => {
  it("uses a compact heading for receipts while preserving invoice sizing", () => {
    expect(billingDocumentTitleFontSize("receipt")).toBe(16);
    expect(billingDocumentTitleFontSize("invoice")).toBe(26);
  });
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- src/lib/subscriptionInvoicePdf.test.ts`

Expected: FAIL because `billingDocumentTitleFontSize` is not exported.

- [x] **Step 3: Add the minimal selector and use it in the renderer**

```ts
export const billingDocumentTitleFontSize = (kind: "invoice" | "receipt") =>
  kind === "receipt" ? 16 : 26;
```

Replace `doc.setFontSize(26)` immediately before drawing the title with:

```ts
doc.setFontSize(billingDocumentTitleFontSize(document.kind));
```

- [x] **Step 4: Verify the focused test, TypeScript, and production build**

Run:

```powershell
npm.cmd test -- src/lib/subscriptionInvoicePdf.test.ts
npm.cmd run lint
npm.cmd run -s build
```

Expected: all commands exit successfully.

- [x] **Step 5: Review and commit the focused implementation**

```powershell
git diff --check
git diff -- src/lib/subscriptionInvoicePdf.ts src/lib/subscriptionInvoicePdf.test.ts
git add src/lib/subscriptionInvoicePdf.ts src/lib/subscriptionInvoicePdf.test.ts docs/superpowers/plans/2026-07-29-receipt-heading-size.md
git commit -m "fix: resize receipt document heading"
```
