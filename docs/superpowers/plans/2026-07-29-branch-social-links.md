# Branch-Specific Store Social Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let store owners manage unlimited branch-specific social links in Edit Store and show inferred platform logos on that branch's public page.

**Architecture:** Store ordered `{ url }` entries in the existing branch document. A pure utility normalizes URLs and safely infers platforms; focused editor and public-list components consume that utility, while the existing owner and public pages remain responsible for persistence and branch loading.

**Tech Stack:** React 19, TypeScript 5.8, Vitest, Testing Library, Supabase-backed `dataCompat`, `react-icons`.

## Global Constraints

- Store `socialLinks` directly on `stores/{branchId}`; never inherit or synchronize them between branches.
- Permit unlimited entries, duplicate URLs, and multiple links for the same platform.
- Accept only HTTP(S) links and add `https://` when the scheme is omitted.
- Use platform logos for recognized links and a globe icon plus hostname for unknown links.
- Preserve link order and ignore blank rows when saving.
- Do not add social links to partner applications, staff editing, admin editing, or homepage configuration.

---

### Task 1: Social-link normalization and platform inference

**Files:**
- Create: `src/lib/storeSocialLinks.ts`
- Test: `src/lib/storeSocialLinks.test.ts`

**Interfaces:**
- Produces: `StoreSocialLink`, `SocialPlatform`, `normalizeSocialLinkUrl(value)`, `getSocialLinkPresentation(value)`, and `normalizeSocialLinks(values)`.

- [ ] **Step 1: Write the failing utility tests**

```ts
import { describe, expect, it } from "vitest";
import {
  getSocialLinkPresentation,
  normalizeSocialLinks,
  normalizeSocialLinkUrl,
} from "./storeSocialLinks";

describe("store social links", () => {
  it("trims links and supplies an HTTPS scheme", () => {
    expect(normalizeSocialLinkUrl(" instagram.com/perkup ")).toBe("https://instagram.com/perkup");
  });

  it.each(["javascript:alert(1)", "mailto:owner@example.com", "not a domain"])(
    "rejects unsafe or malformed URL %s",
    (value) => expect(() => normalizeSocialLinkUrl(value)).toThrow("valid social media URL"),
  );

  it.each([
    ["https://m.facebook.com/perkup", "facebook", "Facebook"],
    ["https://instagram.com/perkup", "instagram", "Instagram"],
    ["https://tiktok.com/@perkup", "tiktok", "TikTok"],
    ["https://x.com/perkup", "x", "X"],
    ["https://twitter.com/perkup", "x", "X"],
    ["https://youtube.com/@perkup", "youtube", "YouTube"],
    ["https://linkedin.com/company/perkup", "linkedin", "LinkedIn"],
    ["https://pinterest.com/perkup", "pinterest", "Pinterest"],
    ["https://threads.net/@perkup", "threads", "Threads"],
    ["https://snapchat.com/add/perkup", "snapchat", "Snapchat"],
    ["https://wa.me/639123456789", "whatsapp", "WhatsApp"],
    ["https://t.me/perkup", "telegram", "Telegram"],
    ["https://discord.gg/example", "discord", "Discord"],
  ] as const)("detects %s", (url, platform, label) => {
    expect(getSocialLinkPresentation(url)).toMatchObject({ platform, label });
  });

  it("does not classify lookalike hostnames as known platforms", () => {
    expect(getSocialLinkPresentation("https://facebook.com.example.org/page")).toMatchObject({
      platform: "generic",
      label: "facebook.com.example.org",
    });
  });

  it("keeps duplicate, same-platform, ordered, and arbitrarily long lists", () => {
    const values = Array.from({ length: 40 }, (_, index) => ({
      url: index % 2 ? "instagram.com/second" : "instagram.com/first",
    }));
    expect(normalizeSocialLinks(values)).toHaveLength(40);
    expect(normalizeSocialLinks(values)[0]).toEqual({ url: "https://instagram.com/first" });
    expect(normalizeSocialLinks(values)[1]).toEqual({ url: "https://instagram.com/second" });
  });

  it("drops blank rows", () => {
    expect(normalizeSocialLinks([{ url: "" }, { url: "  " }, { url: "x.com/perkup" }]))
      .toEqual([{ url: "https://x.com/perkup" }]);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test -- src/lib/storeSocialLinks.test.ts`

Expected: FAIL because `storeSocialLinks.ts` does not exist.

- [ ] **Step 3: Implement the pure utility**

Create types for the 13 recognized platforms plus `generic`. Parse URLs only after adding `https://` when no scheme exists. Require `http:` or `https:`, a hostname containing a valid dot or an allowlisted short host (`x.com`, `t.me`, `wa.me`), and no embedded credentials. Match hosts with:

```ts
const matchesHost = (hostname: string, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);
```

Map exact domains and subdomains to presentation metadata. Return normalized hostname text for `generic`. `normalizeSocialLinks` must filter blank values, call `normalizeSocialLinkUrl`, retain duplicates, and preserve order.

- [ ] **Step 4: Run the utility test and verify GREEN**

Run: `npm.cmd test -- src/lib/storeSocialLinks.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/storeSocialLinks.ts src/lib/storeSocialLinks.test.ts
git commit -m "feat: normalize and detect store social links"
```

### Task 2: Reusable social-link editor and public list

**Files:**
- Create: `src/components/StoreSocialLinks.tsx`
- Test: `src/components/StoreSocialLinks.test.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `StoreSocialLink`, `getSocialLinkPresentation`, and `normalizeSocialLinkUrl` from Task 1.
- Produces: `StoreSocialLinksEditor({ value, onChange })` and `StoreSocialLinksList({ links })`.

- [ ] **Step 1: Install the icon package**

Run: `npm.cmd install react-icons`

Expected: `react-icons` appears in dependencies and the lockfile updates.

- [ ] **Step 2: Write failing component tests**

Test that:

```tsx
render(<StoreSocialLinksEditor value={[]} onChange={onChange} />);
await user.click(screen.getByRole("button", { name: /add social link/i }));
expect(onChange).toHaveBeenCalledWith([{ url: "" }]);
```

Test removal by rendering two rows and clicking the first row's accessible Remove button. Test that editing row 2 preserves row 1. Test that a recognized URL displays `Instagram`, an unknown URL displays `example.social`, and an invalid nonblank URL displays `Enter a valid social media URL.`.

For the public list, render Instagram, X, and an unknown domain; assert all three labels, exact normalized `href` values, `target="_blank"`, and `rel="noopener noreferrer"`. Render a malformed legacy link and assert that it is omitted.

- [ ] **Step 3: Run the component test and verify RED**

Run: `npm.cmd test -- src/components/StoreSocialLinks.test.tsx`

Expected: FAIL because `StoreSocialLinks.tsx` does not exist.

- [ ] **Step 4: Implement both components**

Use icons from `react-icons/fa6` for Facebook, Instagram, TikTok, X, YouTube, LinkedIn, Pinterest, Threads, Snapchat, WhatsApp, Telegram, and Discord. Use Lucide `Globe2`, `Plus`, and `Trash2` for fallback and controls.

The editor must remain controlled. It appends `{ url: "" }`, replaces one indexed entry on input, and removes one indexed entry without imposing a maximum. Each row computes a presentation preview; invalid nonblank rows show an inline error without throwing during render.

The public list normalizes each link inside a guarded conversion, filters invalid legacy entries, and renders safe anchors in the supplied order.

- [ ] **Step 5: Run component and utility tests and verify GREEN**

Run: `npm.cmd test -- src/components/StoreSocialLinks.test.tsx src/lib/storeSocialLinks.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit**

```powershell
git add -- package.json package-lock.json src/components/StoreSocialLinks.tsx src/components/StoreSocialLinks.test.tsx
git commit -m "feat: add store social link controls"
```

### Task 3: Integrate social links into the selected branch editor

**Files:**
- Modify: `src/pages/store-owner/StoreOwnerInfo.tsx`
- Create: `src/pages/store-owner/StoreOwnerInfo.social-links.test.tsx`

**Interfaces:**
- Consumes: `StoreSocialLinksEditor` and `normalizeSocialLinks`.
- Persists: `socialLinks: StoreSocialLink[]` through `updateDoc(doc(db, "stores", store.id), nextStoreData)`.

- [ ] **Step 1: Write a failing branch-persistence test**

Mock Leaflet, image storage, `doc`, and `updateDoc`. Render the page with:

```ts
const branch = {
  id: "branch-b",
  name: "Perk North",
  category: "Cafe",
  contact: "09170000000",
  lat: 7.4,
  lng: 125.8,
  socialLinks: [{ url: "https://instagram.com/north" }],
};
```

Enter edit mode, add `tiktok.com/@north`, submit, and assert:

```ts
expect(mocks.doc).toHaveBeenCalledWith(expect.anything(), "stores", "branch-b");
expect(mocks.updateDoc).toHaveBeenCalledWith(
  expect.anything(),
  expect.objectContaining({
    socialLinks: [
      { url: "https://instagram.com/north" },
      { url: "https://tiktok.com/@north" },
    ],
  }),
);
```

Rerender with `id: "branch-c"` and different links; assert the editor resets to branch C. Test Cancel restores the currently selected branch's saved values. Test that an invalid social URL blocks `updateDoc` and leaves an inline error visible.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm.cmd test -- src/pages/store-owner/StoreOwnerInfo.social-links.test.tsx`

Expected: FAIL because Edit Store does not render or persist social links.

- [ ] **Step 3: Integrate the editor**

Add `socialLinks` to `getStoreFormData` with an empty-array compatibility fallback. Render `StoreSocialLinksEditor` in a new Social Media card after Basic Details. At the beginning of `handleSubmit`, call `normalizeSocialLinks(formData.socialLinks)` before any image uploads; if validation fails, show the component's row-level validation state and do not call persistence. Put the normalized array into `nextStoreData`.

Keep the existing `store.id` document path unchanged. The existing `store` effect and `discardChanges` must recreate form state from the active branch, preventing cross-branch leakage.

- [ ] **Step 4: Run owner integration and social-link tests and verify GREEN**

Run: `npm.cmd test -- src/pages/store-owner/StoreOwnerInfo.social-links.test.tsx src/components/StoreSocialLinks.test.tsx src/lib/storeSocialLinks.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- src/pages/store-owner/StoreOwnerInfo.tsx src/pages/store-owner/StoreOwnerInfo.social-links.test.tsx
git commit -m "feat: edit social links per store branch"
```

### Task 4: Render social links on the exact public branch page

**Files:**
- Modify: `src/pages/StorePage.tsx`
- Modify: `src/components/StoreSocialLinks.test.tsx`

**Interfaces:**
- Consumes: `StoreSocialLink` and `StoreSocialLinksList`.
- Reads: `store.socialLinks` from the store record already loaded using the route's `branchId`.

- [ ] **Step 1: Extend the failing public-list test**

Add a case that passes branch A links and rerenders with branch B links:

```tsx
const { rerender } = render(
  <StoreSocialLinksList links={[{ url: "instagram.com/branch-a" }]} />,
);
expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
  "href",
  "https://instagram.com/branch-a",
);

rerender(<StoreSocialLinksList links={[{ url: "tiktok.com/@branch-b" }]} />);
expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
  "href",
  "https://tiktok.com/@branch-b",
);
```

- [ ] **Step 2: Run the public-list test and verify RED**

Run: `npm.cmd test -- src/components/StoreSocialLinks.test.tsx`

Expected: FAIL until list replacement behavior and accessible names satisfy the branch-switch case.

- [ ] **Step 3: Integrate the public list**

Add `socialLinks?: StoreSocialLink[]` to `StoreContent`. Render `StoreSocialLinksList links={store.socialLinks}` beneath phone and website in Contact Information. Change the empty state condition to use the count of valid renderable social links, so invalid legacy entries do not suppress the empty message.

Do not query sibling branches for social links. The page must use only the `store` object loaded from `/store/{branchId}`.

- [ ] **Step 4: Run focused tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/storeSocialLinks.test.ts src/components/StoreSocialLinks.test.tsx src/pages/store-owner/StoreOwnerInfo.social-links.test.tsx
npm.cmd run lint
```

Expected: all tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/pages/StorePage.tsx src/components/StoreSocialLinks.test.tsx
git commit -m "feat: show branch social links on store pages"
```

### Task 5: Full verification

**Files:**
- Verify only.

**Interfaces:**
- Verifies the complete feature and existing application behavior.

- [ ] **Step 1: Run all tests**

Run: `npm.cmd test`

Expected: all test files pass.

- [ ] **Step 2: Build the production application**

Run: `npm.cmd run -s build`

Expected: Vite, SEO generation, and service-worker generation complete successfully.

- [ ] **Step 3: Review the final diff**

Run:

```powershell
git status --short
git diff --check HEAD~4..HEAD
git log -5 --oneline
```

Expected: feature commits contain only planned files; pre-existing unrelated working-tree changes remain untouched; no whitespace errors.
