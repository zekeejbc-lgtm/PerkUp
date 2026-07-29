# Auditor Subscription Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give auditors the same subscription-offer editing and saving workflow as administrators.

**Architecture:** Extend the existing `canManagePlans` UI authorization branch to include `auditor`. Match that browser behavior at the database boundary by giving auditors the same update policies used by administrators for the settings, store, and owner rows touched by the existing confirmed subscription-save workflow.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Supabase/Postgres RLS, pgTAP

## Global Constraints

- Change only the Subscriptions-page authority required by the approved design.
- Preserve the existing uncommitted preferred-plan and hierarchy work.
- Keep existing validation, impact confirmation, propagation, and billing synchronization behavior unchanged.
- Non-administrative roles must remain read-only.
- Use test-first development and verify each regression fails for the expected missing authorization before implementing.

---

### Task 1: Auditor subscription editor controls

**Files:**
- Modify: `src/pages/admin/AdminSubscriptions.test.tsx`
- Modify: `src/pages/admin/AdminSubscriptions.tsx`

**Interfaces:**
- Consumes: `useAuth().user.role`
- Produces: `canManagePlans: boolean` that is true for `admin`, `assistant_admin`, and `auditor`

- [ ] **Step 1: Replace the auditor read-only test with a failing edit-and-save regression**

Change the existing auditor tests so they prove observable page behavior:

```tsx
it("lets an auditor edit and save subscription offers", async () => {
  mocks.role.current = "auditor";
  const user = userEvent.setup();
  render(<AdminSubscriptions />);

  await user.click(await screen.findByRole("button", { name: "Edit Offers" }));
  expect(screen.getByRole("button", { name: "Move Testing Plan higher" })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Save Changes" }));
  await user.click(await screen.findByRole("button", { name: "Save hierarchy" }));

  await waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
  expect(screen.queryByText(/auditor access is read-only/i)).not.toBeInTheDocument();
});

it("lets an auditor initialize a missing subscription catalog", async () => {
  mocks.role.current = "auditor";
  mocks.getDoc.mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  });

  render(<AdminSubscriptions />);

  await waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
  expect(await screen.findByRole("button", { name: "Edit Offers" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run src/pages/admin/AdminSubscriptions.test.tsx
```

Expected: FAIL because auditors cannot find the **Edit Offers** button and cannot initialize a missing catalog.

- [ ] **Step 3: Implement the minimal role change**

Update the existing role branch without changing the surrounding workflow:

```tsx
const canManagePlans =
  user?.role === "admin"
  || user?.role === "assistant_admin"
  || user?.role === "auditor";
```

The existing `canManagePlans` rendering and handler guards will automatically expose editing, remove the read-only message, permit catalog initialization, and permit confirmed saves.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```powershell
npx vitest run src/pages/admin/AdminSubscriptions.test.tsx src/pages/admin/AdminSubscriptions.preferred.test.tsx
```

Expected: both test files pass.

- [ ] **Step 5: Preserve and stage only task-owned hunks**

Inspect:

```powershell
git diff -- src/pages/admin/AdminSubscriptions.tsx src/pages/admin/AdminSubscriptions.test.tsx
git diff --check
```

Do not discard or overwrite the pre-existing preferred-plan and hierarchy changes. Because `AdminSubscriptions.tsx` already contains user changes, do not create a mixed commit unless task-owned hunks can be staged independently and verified.

---

### Task 2: Supabase authorization parity

**Files:**
- Create: the exact migration path emitted by `npx supabase migration new allow_auditor_subscription_management` in Step 3; the Supabase CLI is the path authority
- Create: `supabase/tests/database/auditor_subscription_management.test.sql`

**Interfaces:**
- Consumes: `private.current_user_role()`
- Produces: authenticated RLS authorization allowing `auditor` wherever the existing subscription save path relies on administrator updates to `settings`, `stores`, and `users`

- [ ] **Step 1: Write a failing pgTAP authorization regression**

Create a transactional pgTAP test that:

1. Inserts isolated auditor, customer, owner, store, and `subscriptions` setting fixtures as `service_role`.
2. Sets `request.jwt.claim.sub` to the auditor and `role` to `authenticated`.
3. Updates the subscription setting, propagated store subscription data, and owner `branchLimit`.
4. Resets to `service_role` and asserts all three values changed.
5. Repeats a settings update as the customer and asserts the auditor-saved value remains unchanged.

Use literal expected JSON values so the test fails if any required auditor policy remains admin-only.

- [ ] **Step 2: Run the database regression and verify RED when a local database is available**

Run:

```powershell
npx supabase test db supabase/tests/database/auditor_subscription_management.test.sql
```

Expected: FAIL on the auditor write assertions under the current admin-only policies.

If Docker/Podman remains unavailable, record that environment limitation and continue with SQL syntax checks and connected-project policy inspection; do not claim a local pgTAP pass.

- [ ] **Step 3: Generate the migration with the CLI**

Run:

```powershell
npx supabase migration new allow_auditor_subscription_management
```

Use the exact generated file. Do not invent or rename the timestamp.

- [ ] **Step 4: Implement administrator-equivalent update policies**

In the generated migration, drop and recreate these existing policies with `private.current_user_role()` membership checks that include both `admin` and `auditor`:

```sql
drop policy if exists "settings admin create" on public.settings;
create policy "settings admin create" on public.settings
for insert to authenticated
with check ((select private.current_user_role()) in ('admin', 'auditor'));

drop policy if exists "settings admin update" on public.settings;
create policy "settings admin update" on public.settings
for update to authenticated
using ((select private.current_user_role()) in ('admin', 'auditor'))
with check ((select private.current_user_role()) in ('admin', 'auditor'));

drop policy if exists "stores owner admin update" on public.stores;
create policy "stores owner admin update" on public.stores
for update to authenticated
using (
  (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.owns_store(id))
)
with check (
  (select private.current_user_role()) in ('admin', 'auditor')
  or (select private.owns_store(id))
);

drop policy if exists "users admin update" on public.users;
create policy "users admin update" on public.users
for update to authenticated
using ((select private.current_user_role()) in ('admin', 'auditor'))
with check ((select private.current_user_role()) in ('admin', 'auditor'));
```

Do not widen delete permissions or alter unrelated policies.

- [ ] **Step 5: Verify the migration and database test**

Run:

```powershell
npx supabase db lint
npx supabase test db supabase/tests/database/auditor_subscription_management.test.sql
```

Expected: SQL lint succeeds and pgTAP passes when the local database is available.

Inspect the connected project after migration application with Supabase security and performance advisors. Do not apply the migration remotely unless deployment is explicitly part of the active request and the local migration has been reviewed.

---

### Task 3: Full regression verification

**Files:**
- Verify only; no new files expected

**Interfaces:**
- Consumes: completed UI and RLS tasks
- Produces: evidence that the requested behavior works without breaking the application

- [ ] **Step 1: Run focused and role regression tests**

```powershell
npx vitest run src/pages/admin/AdminSubscriptions.test.tsx src/pages/admin/AdminSubscriptions.preferred.test.tsx
npm run test:auditor
```

Expected: all commands exit successfully.

- [ ] **Step 2: Run the full TypeScript and test suites**

```powershell
npm run lint
npm test
```

Expected: TypeScript reports no errors and Vitest reports zero failing tests.

- [ ] **Step 3: Review the final diff**

```powershell
git diff --check
git status --short
git diff -- src/pages/admin/AdminSubscriptions.tsx src/pages/admin/AdminSubscriptions.test.tsx supabase/migrations supabase/tests/database
```

Confirm the diff includes only auditor subscription-edit authorization plus the pre-existing user-owned preferred-plan/hierarchy work, with no unrelated permission changes.
