# Mobile Button and Email Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent long signup emails and crowded action labels from overflowing or producing oversized mobile controls.

**Architecture:** Keep the change local to `AuthModal`: recover narrow-screen width through responsive spacing, allow status copy to break long tokens, and compact only its crowded form actions. Exercise the real signup flow in a component test so the OTP-state DOM is verified without adding production-only test hooks.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Vitest, Testing Library

## Global Constraints

- Preserve deliberately large marketing and primary call-to-action buttons.
- Keep existing touch-target padding and desktop spacing.
- Do not change authentication, OTP, or validation behavior.
- Do not add a global button font-size override.

---

### Task 1: Compact responsive AuthModal

**Files:**
- Create: `src/components/AuthModal.test.tsx`
- Modify: `src/components/AuthModal.tsx:580-610`
- Modify: `src/components/AuthModal.tsx:680-690`
- Modify: `src/components/AuthModal.tsx:1012-1057`

**Interfaces:**
- Consumes: existing `AuthModal({ isOpen, onClose, initialMode })` interface and signup services.
- Produces: the same AuthModal interface with responsive class and copy changes only.

- [ ] **Step 1: Write the failing component test**

Mock the authentication services, render signup mode, accept privacy, and
advance the real form through the OTP request. Assert:

```tsx
expect(screen.getByText(/We sent a 6-digit OTP/)).toHaveClass("break-words", "[overflow-wrap:anywhere]");
expect(screen.getByRole("button", { name: "Create account" })).toHaveClass("text-sm");
expect(screen.queryByRole("button", { name: "Verify & create account" })).not.toBeInTheDocument();
expect(screen.getByRole("button", { name: "Back" })).toHaveClass("text-sm");
```

Also assert the modal content uses compact mobile padding while retaining
`sm:p-10`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- src/components/AuthModal.test.tsx
```

Expected: FAIL because the status message lacks wrapping classes, actions lack
`text-sm`, the old label is still rendered, and mobile padding is still `p-8`.

- [ ] **Step 3: Implement the minimal responsive change**

In `AuthModal.tsx`:

```tsx
className="... p-5 sm:p-10"
```

for ordinary small-screen modal content; remove the redundant dialog `mx-4`
because the overlay already supplies `p-4`.

Add:

```tsx
break-words [overflow-wrap:anywhere]
```

to inline error/success notices. Add `text-sm` to the Back and submit actions,
and change the final signup label to:

```tsx
Create account
```

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
npm.cmd test -- src/components/AuthModal.test.tsx
npm.cmd test
npm.cmd run lint
npm.cmd run -s build
```

Expected: the focused test and full suite pass, TypeScript reports no errors,
and Vite completes the production build.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- src/components/AuthModal.tsx src/components/AuthModal.test.tsx docs/superpowers/plans/2026-07-29-mobile-button-and-email-overflow.md
git commit -m "fix: compact mobile authentication actions"
```
