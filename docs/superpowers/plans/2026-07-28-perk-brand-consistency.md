# Perk Brand Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the PerkUp product to Perk across the repository and connected development backend while preserving real operational account identities and the canonical `https://www.perktoday.com` URL.

**Architecture:** A repository-level consistency checker establishes the allowed naming contract before mechanical changes begin. Static assets, public/generated content, application code, and Supabase sources are then updated in bounded groups, followed by one data-only migration for stored legal copy and targeted Edge Function deployments.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Node.js ESM scripts, Supabase Postgres, Supabase Edge Functions/Deno

## Global Constraints

- Use **Perk** in normal customer-facing prose and **perk.** only for the visual wordmark.
- Use lowercase `perk` for internal identifiers and brand asset filenames.
- Keep `https://www.perktoday.com` as the canonical absolute website URL.
- Preserve `perkup.shop@youthserviceph.org`, admin/auditor login emails, the Supabase project reference, provider identifiers, and secrets.
- Legacy browser state and QR formats do not require compatibility.
- Do not overwrite or revert unrelated working-tree changes.
- Do not commit pre-existing user changes that share a file with this implementation.

---

## File Structure

- `scripts/check-brand-consistency.mjs`: repository-wide naming contract and exact allowlist.
- `package.json`: exposes the checker as `npm run check:brand`.
- `public/icons/perk-*`: renamed visual brand assets.
- Public and generator files: canonical copy, metadata, offline content, email templates, and generated SEO.
- `src/**`: visible product copy, accessibility text, PDF copy, and development-only key/prefix changes.
- `supabase/functions/**`: backend response/default copy and internal prefixes.
- `supabase/migrations/20260728000000_rebrand_legacy_content_to_perk.sql`: idempotent stored legal-copy update.
- Existing historical migrations: current product defaults and development identifiers use Perk.

### Task 1: Add the Failing Brand Consistency Check

**Files:**
- Create: `scripts/check-brand-consistency.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository files beneath `process.cwd()`
- Produces: `npm run check:brand`, exiting `0` only when no non-allowlisted `perkup` path or content remains

- [ ] **Step 1: Add the consistency checker**

```js
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const ignoredFiles = new Set([
  "docs/superpowers/specs/2026-07-28-perk-brand-consistency-design.md",
  "docs/superpowers/plans/2026-07-28-perk-brand-consistency.md",
]);
const allowedValues = ["perkup.shop@youthserviceph.org"];
const violations = [];

const normalize = (value) => value.split(path.sep).join("/");
const removeAllowedValues = (value) =>
  allowedValues.reduce((result, allowed) => result.replaceAll(allowed, ""), value);

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalize(path.relative(root, absolutePath));
    if (entry.isDirectory()) {
      await scan(absolutePath);
      continue;
    }
    if (ignoredFiles.has(relativePath)) continue;
    if (/perkup/i.test(removeAllowedValues(relativePath))) {
      violations.push(`${relativePath}: legacy brand in path`);
    }
    const buffer = await readFile(absolutePath);
    if (buffer.includes(0)) continue;
    const text = removeAllowedValues(buffer.toString("utf8"));
    text.split(/\r?\n/).forEach((line, index) => {
      if (/perkup/i.test(line)) violations.push(`${relativePath}:${index + 1}: ${line.trim()}`);
    });
  }
}

await scan(root);
if (violations.length) {
  console.error(["Legacy PerkUp branding remains:", ...violations].join("\n"));
  process.exit(1);
}
console.log("Perk brand consistency check passed.");
```

- [ ] **Step 2: Add the package command**

Add `"check:brand": "node scripts/check-brand-consistency.mjs"` to `scripts` in `package.json`.

- [ ] **Step 3: Run the check and verify RED**

Run: `npm run check:brand`

Expected: FAIL with repository paths and lines that still contain `PerkUp` or non-allowlisted `perkup`.

- [ ] **Step 4: Record the baseline without committing unrelated files**

Run: `git diff -- scripts/check-brand-consistency.mjs package.json`

Expected: only the checker and package-script registration are shown.

### Task 2: Rename Static Assets and Public/Generated Content

**Files:**
- Rename: `public/icons/perkup-logo-source.png` to `public/icons/perk-logo-source.png`
- Rename: `public/icons/perkup-wordmark-dark-transparent.png` to `public/icons/perk-wordmark-dark-transparent.png`
- Rename: `public/icons/perkup-wordmark-dark.png` to `public/icons/perk-wordmark-dark.png`
- Rename: `public/icons/perkup-wordmark-email-safe.png` to `public/icons/perk-wordmark-email-safe.png`
- Rename: `public/icons/perkup-wordmark-light-transparent.png` to `public/icons/perk-wordmark-light-transparent.png`
- Rename: `public/icons/perkup-wordmark-light.png` to `public/icons/perk-wordmark-light.png`
- Modify: `index.html`
- Modify: `metadata.json`
- Modify: `public/404.html`
- Modify: `public/manifest.json`
- Modify: `public/offline.html`
- Modify: `scripts/email.html`
- Modify: `scripts/email-sender.gs`
- Modify: `scripts/generate-seo.mjs`
- Modify: `scripts/generate-service-worker.mjs`
- Modify: `PAYMONGO_SUBSCRIPTION_BILLING_PLAN.md`
- Modify: `security_spec.md`
- Modify: `docs/superpowers/plans/2026-07-28-subscription-upgrade-at-renewal.md`
- Modify: `docs/superpowers/specs/2026-07-28-subscription-upgrade-at-renewal-design.md`

**Interfaces:**
- Consumes: the naming standard and existing image bytes
- Produces: `perk-*` asset URLs, Perk public metadata/copy, and `perk-*` service-worker cache keys

- [ ] **Step 1: Rename each image without modifying its bytes**

Use `Move-Item -LiteralPath <old-absolute-path> -Destination <new-absolute-path>` for each exact pair above after resolving and verifying both paths are under `public/icons`.

- [ ] **Step 2: Update public copy and asset references**

Replace product-name prose `PerkUp` with `Perk`, change asset path stems from `perkup-` to `perk-`, and change internal service-worker cache strings from `perkup-` to `perk-`. Leave `perkup.shop@youthserviceph.org` unchanged.

- [ ] **Step 3: Verify the bounded result**

Run:

```powershell
rg -n -i 'PerkUp|perkup' index.html metadata.json public scripts PAYMONGO_SUBSCRIPTION_BILLING_PLAN.md security_spec.md docs/superpowers/plans/2026-07-28-subscription-upgrade-at-renewal.md docs/superpowers/specs/2026-07-28-subscription-upgrade-at-renewal-design.md
```

Expected: only exact occurrences of `perkup.shop@youthserviceph.org`.

- [ ] **Step 4: Review the diff**

Run: `git diff -- index.html metadata.json public scripts PAYMONGO_SUBSCRIPTION_BILLING_PLAN.md security_spec.md docs/superpowers/plans/2026-07-28-subscription-upgrade-at-renewal.md docs/superpowers/specs/2026-07-28-subscription-upgrade-at-renewal-design.md`

Expected: brand/name/path changes only; pre-existing `scripts/email-sender.gs` behavior edits remain intact.

### Task 3: Rename Application Copy and Internal Identifiers

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/AlertModalProvider.tsx`
- Modify: `src/components/AuthModal.tsx`
- Modify: `src/components/BrandMark.tsx`
- Modify: `src/components/MaintenanceScreen.tsx`
- Modify: `src/components/NewsletterForm.tsx`
- Modify: `src/components/PartnerApplicationTrackingModal.tsx`
- Modify: `src/components/PayMongoDefaultsControl.tsx`
- Modify: `src/components/PublicPageShell.tsx`
- Modify: `src/components/PublicSiteHeader.tsx`
- Modify: `src/components/PwaPrompts.tsx`
- Modify: `src/components/Seo.tsx`
- Modify: `src/components/SubscriptionAccessGate.tsx`
- Modify: `src/contexts/CurrencyContext.tsx`
- Modify: `src/contexts/RuntimeModeContext.tsx`
- Modify: `src/lib/backend.ts`
- Modify: `src/lib/chunkRecovery.ts`
- Modify: `src/lib/customerScanCache.ts`
- Modify: `src/lib/legalContent.ts`
- Modify: `src/lib/promotionClaims.ts`
- Modify: `src/lib/pwa.ts`
- Modify: `src/lib/secureQr.ts`
- Modify: `src/lib/subscriptionAccess.ts`
- Modify: `src/lib/subscriptionInvoicePdf.ts`
- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/trustedDevice.ts`
- Modify: `src/lib/username.ts`
- Modify: `src/pages/admin/AdminHomepage.tsx`
- Modify: `src/pages/admin/AdminRuntimeControl.tsx`
- Modify: `src/pages/customer/CustomerOverview.tsx`
- Modify: `src/pages/customer/CustomerTickets.tsx`
- Modify: `src/pages/CustomerQrLandingPage.tsx`
- Modify: `src/pages/FeedbackPage.tsx`
- Modify: `src/pages/LandingPage.tsx`
- Modify: `src/pages/MarketingPage.tsx`
- Modify: `src/pages/staff/StaffCustomers.tsx`
- Modify: `src/pages/staff/StaffPromotionScan.tsx`
- Modify: `src/pages/staff/StaffScanner.tsx`
- Modify: `src/pages/store-owner/StoreOwnerSubscription.tsx`
- Modify: `src/pages/StorePage.tsx`
- Modify: `src/pages/StoreProductsPage.tsx`
- Modify: `src/pages/StorePromotionsPage.tsx`
- Modify: `src/pages/StoresPage.tsx`

**Interfaces:**
- Consumes: existing UI behavior and QR/cache APIs
- Produces: Perk product copy, `perk:` QR/storage prefixes, `perk-*` asset paths, and `Perk-*` downloaded PDF filenames

- [ ] **Step 1: Update customer-facing text**

Replace `PerkUp` with `Perk` in prose, titles, accessibility labels, QR artwork, PDF metadata, filenames, defaults, and error messages.

- [ ] **Step 2: Update development identifiers**

Replace lowercase internal `perkup` prefixes with `perk` in browser storage, IndexedDB, cache, QR, auth, promotion, offline queue, and event names. Replace the reserved username `perkup` with `perk`.

- [ ] **Step 3: Update image references**

Replace `/icons/perkup-` with `/icons/perk-` in `BrandMark.tsx`, `subscriptionInvoicePdf.ts`, and `CustomerOverview.tsx`.

- [ ] **Step 4: Preserve operational addresses**

Confirm every `perkup.shop@youthserviceph.org` literal remains byte-for-byte unchanged.

- [ ] **Step 5: Run focused checks**

Run:

```powershell
npm run check:brand
npm run lint
```

Expected: the brand checker may still fail only for Supabase files scheduled in Task 4; TypeScript exits `0`.

- [ ] **Step 6: Review overlapping user files**

Run:

```powershell
git diff -- scripts/email-sender.gs src/lib/subscriptionInvoicePdf.ts src/pages/StorePage.tsx
```

Expected: existing functional edits remain present and branding changes are limited to strings, keys, or asset paths.

### Task 4: Rename Supabase Sources and Add Stored-Content Migration

**Files:**
- Modify: `supabase/functions/_shared/paymongo.ts`
- Modify: `supabase/functions/_shared/runtime.ts`
- Modify: `supabase/functions/admin-backend/index.ts`
- Modify: `supabase/functions/check-signup-availability/index.ts`
- Modify: `supabase/functions/issue-customer-qr/index.ts`
- Modify: `supabase/functions/paymongo-webhook/index.ts`
- Modify: `supabase/functions/public-feedback/index.ts`
- Modify: `supabase/functions/redeem-customer-scan/index.ts`
- Modify: `supabase/functions/subscription-billing-worker/index.ts`
- Modify: `supabase/functions/update-customer-profile/index.ts`
- Modify: `supabase/migrations/20260710034741_promotion_claim_redemption.sql`
- Modify: `supabase/migrations/20260722004023_paymongo_subscription_billing.sql`
- Modify: `supabase/migrations/20260722020911_harden_subscription_billing_lifecycle.sql`
- Modify: `supabase/migrations/20260722070000_initial_payment_reminders_and_expiry.sql`
- Modify: `supabase/migrations/20260726100000_add_runtime_modes_and_maintenance_lock.sql`
- Rename: `supabase/migrations/20260618000000_create_perkup_json_tables.sql` to `supabase/migrations/20260618000000_create_perk_json_tables.sql`
- Rename: `supabase/migrations/20260618113441_create_perkup_json_tables.sql` to `supabase/migrations/20260618113441_create_perk_json_tables.sql`
- Create: `supabase/migrations/20260728000000_rebrand_legacy_content_to_perk.sql`

**Interfaces:**
- Consumes: `public.settings(id text, data jsonb)` and existing Edge Function behavior
- Produces: Perk backend copy/prefixes and an idempotent legal-content data migration

- [ ] **Step 1: Update function and historical migration source**

Replace product-name copy with `Perk` and development identifiers with `perk`. Preserve `perkup.shop@youthserviceph.org`, external account identities, and all authorization logic.

- [ ] **Step 2: Rename the two historical migration files**

Resolve and verify each source/destination under `supabase/migrations`, then move only the two exact filenames listed above. Do not change their numeric versions.

- [ ] **Step 3: Create the stored-content migration**

Create the migration through the Supabase CLI if available. If the CLI remains unavailable, create the exact file through `apply_patch` with:

```sql
update public.settings
set
  data = replace(data::text, 'Perk' || 'Up', 'Perk')::jsonb,
  updated_at = timezone('utc'::text, now())
where id = 'legal-pages'
  and data::text like ('%Perk' || 'Up%');
```

This targets only the legal-page row and therefore does not change the operational homepage email.

- [ ] **Step 4: Run the brand checker and inspect the migration**

Run:

```powershell
npm run check:brand
Get-Content -Raw supabase/migrations/20260728000000_rebrand_legacy_content_to_perk.sql
```

Expected: the checker passes and the migration targets only `id = 'legal-pages'`.

- [ ] **Step 5: Run existing backend-oriented validation**

Run:

```powershell
npm run test:auditor
npm run lint
```

Expected: both commands exit `0`.

### Task 5: Full Local Verification

**Files:**
- Verify: all files changed by Tasks 1–4
- Verify generated output: `dist/**`

**Interfaces:**
- Consumes: complete local rename
- Produces: verified production bundle with no non-allowlisted legacy brand references

- [ ] **Step 1: Run all automated checks**

Run:

```powershell
npm run check:brand
npm run lint
npm run test:auditor
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 2: Verify generated output**

Run:

```powershell
rg -n -i 'PerkUp|perkup' dist
rg -n 'https://(?!www\\.)?perktoday\\.com' dist
```

Expected: the first search returns only `perkup.shop@youthserviceph.org`; the second search returns no noncanonical absolute website URLs.

- [ ] **Step 3: Verify renamed assets**

Run:

```powershell
Get-ChildItem public/icons/perk-*.png | Select-Object Name, Length
rg -n '/icons/perkup-' . -g '!node_modules' -g '!.git' -g '!dist'
```

Expected: six nonempty renamed images are listed and the old-path search returns no matches.

- [ ] **Step 4: Review the complete diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; unrelated pre-existing edits and branding edits are both still present.

### Task 6: Apply and Verify the Development Supabase Changes

**Files:**
- Deploy: `supabase/migrations/20260728000000_rebrand_legacy_content_to_perk.sql`
- Deploy changed functions from Task 4

**Interfaces:**
- Consumes: locally verified SQL and Edge Function source
- Produces: connected development project with Perk legal copy and matching function versions

- [ ] **Step 1: Apply the data migration**

Use Supabase MCP `apply_migration` with name `rebrand_legacy_content_to_perk` and the exact SQL from the local migration file.

Expected: migration succeeds once; rerunning the SQL would make no further row changes.

- [ ] **Step 2: Verify stored content and the operational address**

Run read-only SQL:

```sql
select
  id,
  regexp_count(data::text, 'PerkUp', 1, 'i') as legacy_brand_mentions,
  data #>> '{footerInfo,email}' as footer_email
from public.settings
where id in ('homepage', 'legal-pages')
order by id;
```

Expected:

- `homepage` retains `perkup.shop@youthserviceph.org`.
- `legal-pages` has `0` legacy product-name mentions.

- [ ] **Step 3: Redeploy only changed Edge Functions**

For each changed function, fetch its current metadata, preserve its existing `verify_jwt` value, and deploy the local entrypoint plus all imported local files. Do not deploy functions whose source did not change.

- [ ] **Step 4: Verify deployment state**

List Edge Functions and confirm every redeployed function is `ACTIVE` with a newer version. Run the live settings query from Step 2 again.

- [ ] **Step 5: Final handoff without absorbing user changes**

Report:

- local commands and their exit status,
- renamed assets and invalidated development identifiers,
- applied Supabase migration,
- redeployed function names and versions,
- preserved operational email,
- any pre-existing dirty files left uncommitted.
