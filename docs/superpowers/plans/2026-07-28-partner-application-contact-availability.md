# Partner Application Contact Availability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject partner applications whose email or phone is already attached to a Perk account or application.

**Architecture:** Put normalization and conflict-selection rules in a pure shared module, then use those rules from the partner-application Edge Function for both an availability action and final submission. Add unique expression indexes as the authoritative same-table race guard, and make the modal run the early check before advancing.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 3, Supabase Edge Functions, PostgreSQL.

## Global Constraints

- Email normalization is trim plus lowercase.
- Phone normalization is digits-only, converting `09XXXXXXXXX` and `9XXXXXXXXX` to `639XXXXXXXXX`.
- Existing Supabase Auth users, customer phone records, and every partner application status reserve contact details.
- Final submission repeats all checks before logo upload or application insertion.
- Contact conflicts return HTTP 409 with stable codes and field-specific messages.

---

### Task 1: Shared contact rules

**Files:**
- Create: `supabase/functions/_shared/partner-contact.ts`
- Test: `supabase/functions/_shared/partner-contact.test.ts`

**Interfaces:**
- Produces: `normalizePartnerEmail(value: unknown): string`
- Produces: `normalizePartnerPhone(value: unknown): string`
- Produces: `getPartnerContactConflict(emailAvailable: boolean, phoneAvailable: boolean): PartnerContactConflict | null`

- [ ] **Step 1: Write failing normalization and conflict tests**

Cover lowercase email normalization, the three Philippine phone input forms, email-only conflict, phone-only conflict, combined conflict, and no conflict.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- supabase/functions/_shared/partner-contact.test.ts`

Expected: FAIL because `partner-contact.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use exact conflict codes `email_unavailable`, `phone_unavailable`, and `contact_unavailable`, with the approved user-facing messages.

- [ ] **Step 4: Verify the tests pass**

Run: `npm test -- supabase/functions/_shared/partner-contact.test.ts`

Expected: all partner contact tests PASS.

### Task 2: Database uniqueness

**Files:**
- Create: migration using `supabase migration new partner_application_contact_uniqueness`
- Test: `supabase/tests/database/partner_application_contact_uniqueness.test.sql`

**Interfaces:**
- Produces: unique expression index `applications_normalized_email_key`
- Produces: unique expression index `applications_normalized_phone_key`

- [ ] **Step 1: Write a failing pgTAP test**

Assert that the two named unique indexes exist and that duplicate normalized email and phone insertions raise `unique_violation`.

- [ ] **Step 2: Run the database test before the migration**

Run the repository’s Supabase database test command discovered with `npx supabase test db --help`, then target or run the database suite.

Expected: FAIL because the indexes do not exist.

- [ ] **Step 3: Create the migration using the Supabase CLI**

Run `npx supabase migration new partner_application_contact_uniqueness`. Add a guard that raises a descriptive exception if normalized legacy duplicates exist, then create unique partial expression indexes for non-empty normalized email and phone values.

- [ ] **Step 4: Verify the database test passes locally**

Run the same database test command.

Expected: new pgTAP test PASS.

### Task 3: Server availability and authoritative submission check

**Files:**
- Modify: `supabase/functions/partner-application/index.ts`
- Test: `supabase/functions/_shared/partner-contact.test.ts`

**Interfaces:**
- Consumes: shared contact normalization and conflict helpers from Task 1.
- Produces: Edge Function action `check_availability`.
- Produces: response `{ emailAvailable: boolean, phoneAvailable: boolean }`.

- [ ] **Step 1: Add failing tests for lookup result composition**

Extend the shared module with a dependency-injected `checkPartnerContactAvailability` function. Test Auth-email, customer-phone, application-email, and application-phone conflicts using deterministic lookup callbacks.

- [ ] **Step 2: Verify the new tests fail**

Run: `npm test -- supabase/functions/_shared/partner-contact.test.ts`

Expected: FAIL because the availability function is missing.

- [ ] **Step 3: Implement server lookups and routes**

Use paginated `admin.auth.admin.listUsers` for Auth email lookup, `customer_phones` for account phone lookup, and normalized application JSON queries for application contacts. Return availability for `check_availability`; on final submission return the conflict helper’s HTTP 409 response before any logo upload.

- [ ] **Step 4: Handle database race errors**

Translate Postgres error `23505` for either named application contact index into the corresponding approved 409 response.

- [ ] **Step 5: Verify shared tests and TypeScript**

Run: `npm test -- supabase/functions/_shared/partner-contact.test.ts`

Run: `npm run lint`

Expected: both commands PASS.

### Task 4: Client-side early check

**Files:**
- Modify: `src/lib/partnerApplication.ts`
- Modify: `src/components/PartnerApplicationModal.tsx`
- Test: `src/lib/partnerApplicationAvailability.test.ts`

**Interfaces:**
- Produces: `checkPartnerApplicationAvailability(email: string, phoneNumber: string): Promise<{ emailAvailable: boolean; phoneAvailable: boolean }>`
- Consumes: the Edge Function `check_availability` action from Task 3.

- [ ] **Step 1: Write a failing client behavior test**

Test a pure `getPartnerApplicationAvailabilityError` helper for email-only, phone-only, combined, and available results so the modal’s blocking behavior has deterministic coverage.

- [ ] **Step 2: Verify the client test fails**

Run: `npm test -- src/lib/partnerApplicationAvailability.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement client availability API and modal behavior**

On step one submission, call the availability action with `email` and `+63${phoneNumber}`. Stay on step one and display/alert the approved conflict message if unavailable; advance to step two only when both are available. Preserve the Edge Function’s final authoritative check.

- [ ] **Step 4: Verify client tests**

Run: `npm test -- src/lib/partnerApplicationAvailability.test.ts`

Expected: all availability tests PASS.

### Task 5: Full verification and deployment

**Files:**
- Modify only if verification identifies a defect in the scoped change.

- [ ] **Step 1: Run repository verification**

Run:

```text
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits successfully without new warnings.

- [ ] **Step 2: Review Supabase guidance and advisors**

Fetch the current Supabase changelog, check relevant documentation, and run database/security advisors before applying remote changes.

- [ ] **Step 3: Apply and deploy**

Apply the reviewed migration to the connected production project and deploy the updated `partner-application` Edge Function with its shared dependencies.

- [ ] **Step 4: Verify production**

Read back the active function version, query `pg_indexes` for both named indexes, and invoke non-mutating availability checks for known-conflicting and synthetic-unused contacts.

- [ ] **Step 5: Commit implementation**

Stage only scoped files and commit with:

```text
feat: prevent duplicate partner application contacts
```
