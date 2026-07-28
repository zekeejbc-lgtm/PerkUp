# Acknowledgement Receipt Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename paid subscription document headings to acknowledgement receipts and disclose that an Official Receipt is available upon request.

**Architecture:** Make narrowly scoped conditional-copy changes in the two existing PDF renderers. Receipt filenames, UI controls, email subjects, compact receipt-number labels, and invoice rendering remain unchanged.

**Tech Stack:** TypeScript, jsPDF, Google Apps Script HTML-to-PDF

## Global Constraints

- The receipt heading must be exactly `ACKNOWLEDGEMENT RECEIPT`.
- The receipt footer must include exactly `Official Receipt will be provided upon request.`
- Invoice output and receipt filenames must remain unchanged.

---

### Task 1: Update both receipt renderers

**Files:**
- Modify: `src/lib/subscriptionInvoicePdf.ts`
- Modify: `scripts/email-sender.gs`

**Interfaces:**
- Consumes: Existing `document.kind === "receipt"` and `documentType === "receipt"` branches.
- Produces: Paid PDFs with the approved heading and footer notice; no new public interface.

- [x] **Step 1: Confirm the existing copy**

Inspect both renderer branches and confirm their receipt headings are `RECEIPT` and their footers do not promise an Official Receipt upon request.

- [x] **Step 2: Update the in-app PDF receipt copy**

Set the receipt-only heading to `ACKNOWLEDGEMENT RECEIPT`. Use a receipt-specific default footer that describes the document as an acknowledgement receipt and includes `Official Receipt will be provided upon request.` Keep the invoice default footer unchanged.

- [x] **Step 3: Update the emailed PDF receipt copy**

Set the receipt-only main heading to `ACKNOWLEDGEMENT RECEIPT`, while preserving the metadata label `RECEIPT #`. Use a receipt-specific footer that includes `Official Receipt will be provided upon request.` Keep the invoice footer unchanged.

- [x] **Step 4: Run static verification**

Run: `npm run lint`

Expected: TypeScript exits with code 0.

- [x] **Step 5: Run production verification**

Run: `npm run build`

Expected: Vite and both post-build scripts exit with code 0.

- [x] **Step 6: Review the focused diff**

Run: `git diff --check` and inspect `git diff -- src/lib/subscriptionInvoicePdf.ts scripts/email-sender.gs`.

Expected: No whitespace errors; only the approved receipt heading and footer behavior change.
