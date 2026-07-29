# Store Review Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build compact animated public reviews with full-review and full-image modals, a modal feedback form, a public all-reviews page, and secure owner hide/restore/remove controls.

**Architecture:** Shared review types, helpers, cards, montage, and dialogs provide one presentation layer for both public pages. Public queries exclude hidden records defensively in the client and through RLS. A dedicated authenticated Edge Function verifies store ownership server-side and coordinates visibility changes or permanent record/image deletion.

**Tech Stack:** React 19, TypeScript, React Router 7, Tailwind CSS 4, Vitest, Testing Library, Supabase Postgres/RLS, Supabase Edge Functions.

## Global Constraints

- Anonymous reviews display `Anonymous Customer` and a generic user icon; never render stored initials or avatars.
- Thumbnail clicks open a full-image modal; card/text clicks open a full-review modal.
- The montage moves slowly, pauses on hover/focus, and is stationary under reduced motion.
- Hide is reversible; remove is permanent and confirmation-gated.
- Only the owning store owner or an authorized administrator may moderate a review.
- Store-owner analytics include hidden reviews; public lists and rating summaries do not.
- Preserve all unrelated working-tree changes.

---

### Task 1: Shared Review Presentation

**Files:**
- Create: `src/lib/storeReviews.ts`
- Create: `src/components/store-reviews/ReviewCard.tsx`
- Create: `src/components/store-reviews/ReviewDetailsModal.tsx`
- Create: `src/components/store-reviews/ReviewImageModal.tsx`
- Create: `src/components/store-reviews/ReviewMontage.tsx`
- Create: `src/components/store-reviews/ReviewExperience.test.tsx`
- Modify: `src/index.css`

**Interfaces:**
- Produces: `StoreReview`, `getPublicReviewer(review)`, `getReviewDate(value)`, `getAverageRating(reviews)`, `getPublicReviews(reviews)`.
- Produces: `ReviewCard({ review, storeName, onOpenReview, onOpenImage })`.
- Produces: `ReviewDetailsModal({ review, storeName, onClose, onOpenImage })`.
- Produces: `ReviewImageModal({ imageUrl, alt, onClose })`.
- Produces: `ReviewMontage({ reviews, storeName, onOpenReview, onOpenImage })`.

- [ ] **Step 1: Write failing component tests**

Create tests with literal fixtures proving:

```tsx
const anonymousReview = {
  id: "review-anon",
  anonymous: true,
  customerName: "Secret Name",
  customerInitials: "SN",
  customerAvatarUrl: "https://example.com/secret.jpg",
  rating: 4,
  comment: "A complete anonymous review that must remain available in details.",
  imageUrls: ["https://example.com/review.jpg"],
};

expect(screen.queryByText("SN")).not.toBeInTheDocument();
expect(screen.queryByRole("img", { name: /secret name/i })).not.toBeInTheDocument();
expect(screen.getByText("Anonymous Customer")).toBeInTheDocument();
```

Also prove card activation opens details, thumbnail activation opens only the image callback, details show untruncated text, the full image uses `object-contain`, one montage card is not duplicated, multiple cards create an aria-hidden duplicate track, and hover/focus pause hooks exist on the montage container.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/components/store-reviews/ReviewExperience.test.tsx`

Expected: FAIL because the shared modules do not exist.

- [ ] **Step 3: Implement helpers and components**

Implement `StoreReview` including:

```ts
hidden?: boolean;
hiddenAt?: string;
hiddenBy?: string;
```

`getPublicReviewer` must return only `{ name: "Anonymous Customer", avatarUrl: "", initials: "" }` for anonymous records. Build accessible dialogs with Escape handling, body scroll locking, backdrop dismissal, and opener focus restoration. Stop propagation from thumbnail controls.

- [ ] **Step 4: Add montage animation**

Add a review-specific keyframe and classes:

```css
@keyframes review-montage-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

.review-montage-track { animation: review-montage-scroll 55s linear infinite; }
.review-montage:hover .review-montage-track,
.review-montage:focus-within .review-montage-track { animation-play-state: paused; }
```

Within the existing reduced-motion media query, disable this animation and keep the container horizontally scrollable.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm.cmd test -- src/components/store-reviews/ReviewExperience.test.tsx`

Expected: PASS with no warnings.

### Task 2: Public Store Review Integration and Feedback Modal

**Files:**
- Create: `src/components/store-reviews/ReviewFormModal.tsx`
- Create: `src/pages/StorePage.reviews.test.tsx`
- Modify: `src/pages/StorePage.tsx`

**Interfaces:**
- Consumes: shared review components and helpers from Task 1.
- Produces: `ReviewFormModal` with controlled form state and `onSubmit`, `onClose`, image selection, and image removal callbacks.

- [ ] **Step 1: Write failing store-page tests**

Mock only data/network/auth boundaries. Render the real store page and prove:

```tsx
expect(screen.getByRole("link", { name: /show all/i }))
  .toHaveAttribute("href", "/store/store-1/reviews");

await user.click(screen.getByRole("button", { name: /create feedback/i }));
expect(screen.getByRole("dialog", { name: /create feedback/i })).toBeInTheDocument();
```

Also prove hidden fixtures are excluded from the public count/montage, anonymous initials are absent, a successful submit closes the form dialog, and failure leaves it open.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/pages/StorePage.reviews.test.tsx`

Expected: FAIL because the old grid/form remain.

- [ ] **Step 3: Replace static review grid**

Filter fetched records through `getPublicReviews`, calculate the public average from that list, render `ReviewMontage`, add `Show all`, and wire shared review/image modal state.

- [ ] **Step 4: Move the feedback form into a modal**

Replace the large inline form with a compact feedback call-to-action panel. Open `ReviewFormModal` for customer accounts, preserve draft state across ordinary closes, close after `fetchReviews()` succeeds, and update anonymous helper copy to say profile image and initials are hidden.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm.cmd test -- src/pages/StorePage.reviews.test.tsx src/components/store-reviews/ReviewExperience.test.tsx`

Expected: PASS.

### Task 3: Public All-Reviews Page

**Files:**
- Create: `src/pages/StoreReviewsPage.tsx`
- Create: `src/pages/StoreReviewsPage.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ReviewCard`, `ReviewDetailsModal`, `ReviewImageModal`, and public review helpers.
- Produces: public route `/store/:storeId/reviews`.

- [ ] **Step 1: Write the failing route/page test**

Use newest-first literal review timestamps and one hidden fixture. Prove the page shows only public reviews, orders them newest-first, displays the public average/count, links back to `/store/store-1`, and opens both modal types through the shared cards.

- [ ] **Step 2: Run test and verify RED**

Run: `npm.cmd test -- src/pages/StoreReviewsPage.test.tsx`

Expected: FAIL because the page and route do not exist.

- [ ] **Step 3: Implement the page and lazy route**

Fetch the store and its reviews together, reject missing/non-public stores, use the same public header/footer/SEO conventions as product and promotion pages, and render a non-animated responsive review grid.

- [ ] **Step 4: Run test and verify GREEN**

Run: `npm.cmd test -- src/pages/StoreReviewsPage.test.tsx`

Expected: PASS.

### Task 4: Moderation Authorization and Persistence

**Files:**
- Modify: `supabase/migrations/20260729093044_store_review_moderation.sql`
- Create: `supabase/tests/database/store_review_moderation.test.sql`
- Create: `supabase/functions/store-review-moderation/index.ts`
- Create: `src/lib/storeReviewModeration.ts`
- Create: `src/lib/storeReviewModeration.test.ts`

**Interfaces:**
- Produces: `moderateStoreReview({ action, reviewId })`, where `action` is `"hide" | "show" | "remove"`.
- Edge response: `{ reviewId, action, hidden?, removed?, cleanupFailures?: number }`.

- [ ] **Step 1: Write failing database tests**

Create a transactional SQL test that installs fixture users/stores/reviews and proves:

- anonymous/public readers cannot select `data.hidden = true` reviews;
- the owning store owner can still select hidden reviews;
- another store owner cannot select the hidden review through owner access;
- public visible reviews remain selectable.

Run using the repository’s existing database-test command or local `psql` harness and confirm failure before the migration is implemented.

- [ ] **Step 2: Implement the migration**

Replace public and authenticated SELECT policies so hidden rows are public only when:

```sql
coalesce((store_reviews.data->>'hidden')::boolean, false) = false
```

Authenticated owners/admins may additionally see hidden records. Add a JSON shape constraint ensuring `hidden` is boolean when present. Do not grant authenticated DELETE.

- [ ] **Step 3: Write failing client API tests**

Prove `moderateStoreReview({ action: "remove", reviewId: "review-1" })` invokes `store-review-moderation` with exactly that action/id and surfaces returned function errors.

- [ ] **Step 4: Run client tests and verify RED**

Run: `npm.cmd test -- src/lib/storeReviewModeration.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 5: Implement the authenticated moderation Edge Function**

Authenticate from the Authorization header, require MFA where the shared project pattern requires it, load the actor profile server-side, load the review, and authorize when the actor is an admin/assistant admin or owns the referenced store. For hide/show, update only server-generated moderation fields. For remove, delete the review using the service client, then best-effort permanently delete each registered Drive image and registry row. Never trust client role, store ID, hidden metadata, or image URLs.

- [ ] **Step 6: Implement the client API and verify GREEN**

Run: `npm.cmd test -- src/lib/storeReviewModeration.test.ts`

Expected: PASS.

- [ ] **Step 7: Verify database behavior**

Run the database test harness against `supabase/tests/database/store_review_moderation.test.sql`.

Expected: all authorization assertions pass.

### Task 5: Store-Owner Moderation UI

**Files:**
- Create: `src/pages/store-owner/StoreOwnerFeedback.moderation.test.tsx`
- Modify: `src/pages/store-owner/StoreOwnerFeedback.tsx`

**Interfaces:**
- Consumes: `moderateStoreReview`.

- [ ] **Step 1: Write failing owner-dashboard tests**

Render the real feedback page with visible and hidden fixtures. Prove hidden status is labeled, Hide becomes Show for hidden records, Hide/Show updates UI only after success, Remove opens a confirmation dialog, cancel preserves the review, and confirmed removal deletes it from the dashboard.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm.cmd test -- src/pages/store-owner/StoreOwnerFeedback.moderation.test.tsx`

Expected: FAIL because moderation controls do not exist.

- [ ] **Step 3: Implement controls and confirmation**

Add per-review `Hide review`/`Show review` and `Remove review` buttons, busy states scoped by review ID, a visible Hidden badge, error feedback, and an accessible destructive confirmation dialog naming the permanent effect and image deletion.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm.cmd test -- src/pages/store-owner/StoreOwnerFeedback.moderation.test.tsx`

Expected: PASS.

### Task 6: Integrated Verification

**Files:**
- Modify only files needed to address verification failures caused by this feature.

- [ ] **Step 1: Run targeted tests**

Run:

```powershell
npm.cmd test -- src/components/store-reviews/ReviewExperience.test.tsx src/pages/StorePage.reviews.test.tsx src/pages/StoreReviewsPage.test.tsx src/lib/storeReviewModeration.test.ts src/pages/store-owner/StoreOwnerFeedback.moderation.test.tsx
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full project checks**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

Expected: zero test failures, TypeScript errors, or build errors.

- [ ] **Step 3: Review requirements and diff**

Check every design requirement against the rendered code and tests, run `git diff --check`, and verify no unrelated dirty files were modified.

- [ ] **Step 4: Commit implementation**

Stage only review feature, moderation, test, migration, and plan/spec files. Commit with:

```powershell
git commit -m "feat: redesign and moderate store reviews"
```
