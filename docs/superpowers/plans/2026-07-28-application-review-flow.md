# Application Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show applicants a simple `Submitted → Under Review → Decision` flow and promise a decision within the day on the submission-success and pending-tracking screens.

**Architecture:** Create one reusable, presentation-only React component that owns the labels, state styling, accessibility text, and exact timing message. Integrate it into the two existing applicant-facing modals, with status normalization ensuring the tracking modal renders it only while an application is pending.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS 4, Lucide React, Vitest 3, Testing Library

## Global Constraints

- The visible steps must be exactly `Submitted`, `Under Review`, and `Decision`.
- The message must be exactly `Your submission will be reviewed and decided within the day.`
- `Submitted` is complete, `Under Review` is current, and `Decision` is upcoming.
- The flow is informational only, with no animation, interaction, or backend dependency.
- Approved and rejected tracking results retain their existing messages and do not render the pending flow.
- The flow must remain understandable without relying on color and must support the existing light and dark themes.

---

### Task 1: Reusable Application Review Flow

**Files:**
- Create: `src/components/ApplicationReviewFlow.tsx`
- Create: `src/components/ApplicationReviewFlow.test.tsx`

**Interfaces:**
- Consumes: `Check` and `Clock3` icons from `lucide-react`
- Produces: `ApplicationReviewFlow(): JSX.Element`, a presentation-only component with no props

- [ ] **Step 1: Write the failing component test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicationReviewFlow } from "./ApplicationReviewFlow";

describe("ApplicationReviewFlow", () => {
  it("shows the three review stages in order and the same-day decision message", () => {
    render(<ApplicationReviewFlow />);

    const flow = screen.getByLabelText("Application review process");
    const stages = within(flow).getAllByRole("listitem");

    expect(stages).toHaveLength(3);
    expect(stages.map((stage) => stage.textContent)).toEqual([
      expect.stringContaining("Submitted"),
      expect.stringContaining("Under Review"),
      expect.stringContaining("Decision"),
    ]);
    expect(stages[0]).toHaveTextContent("Completed");
    expect(stages[1]).toHaveAttribute("aria-current", "step");
    expect(stages[1]).toHaveTextContent("Current");
    expect(stages[2]).toHaveTextContent("Upcoming");
    expect(screen.getByText("Your submission will be reviewed and decided within the day.")).toBeVisible();
  });
});
```

- [ ] **Step 2: Run the test and verify the missing component fails**

Run: `npm test -- src/components/ApplicationReviewFlow.test.tsx`

Expected: FAIL because `./ApplicationReviewFlow` does not exist.

- [ ] **Step 3: Implement the minimal reusable component**

```tsx
import { Check, Clock3 } from "lucide-react";

const stages = [
  { label: "Submitted", state: "Completed" },
  { label: "Under Review", state: "Current" },
  { label: "Decision", state: "Upcoming" },
] as const;

export function ApplicationReviewFlow() {
  return (
    <div className="mx-auto mt-6 w-full max-w-md rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left dark:border-gray-700 dark:bg-gray-800">
      <ol aria-label="Application review process" className="grid grid-cols-3">
        {stages.map((stage, index) => {
          const isComplete = stage.state === "Completed";
          const isCurrent = stage.state === "Current";
          return (
            <li
              key={stage.label}
              aria-current={isCurrent ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center text-center"
            >
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`absolute right-1/2 top-4 h-0.5 w-full ${
                    isCurrent ? "bg-amber-300 dark:bg-amber-600" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-gray-50 dark:ring-gray-800 ${
                  isComplete
                    ? "bg-emerald-600 text-white"
                    : isCurrent
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200"
                      : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : isCurrent ? <Clock3 className="h-4 w-4" aria-hidden="true" /> : "3"}
              </span>
              <span className="mt-2 text-xs font-semibold text-gray-900 dark:text-white">{stage.label}</span>
              <span className="sr-only"> ({stage.state})</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm leading-6 text-gray-600 dark:text-gray-300">
        Your submission will be reviewed and decided within the day.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the focused component test**

Run: `npm test -- src/components/ApplicationReviewFlow.test.tsx`

Expected: PASS with one passing test.

- [ ] **Step 5: Run the TypeScript check**

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit the reusable component**

```bash
git add src/components/ApplicationReviewFlow.tsx src/components/ApplicationReviewFlow.test.tsx
git commit -m "Add application review process flow"
```

### Task 2: Submission and Tracking Integrations

**Files:**
- Modify: `src/components/PartnerApplicationModal.tsx`
- Modify: `src/components/PartnerApplicationTrackingModal.tsx`
- Create: `src/components/ApplicationReviewFlow.integration.test.tsx`

**Interfaces:**
- Consumes: `ApplicationReviewFlow(): JSX.Element` from `src/components/ApplicationReviewFlow.tsx`
- Produces: The review flow in the successful submission state and only the normalized `pending` tracking state

- [ ] **Step 1: Write a failing integration-source test**

```tsx
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const applicationModalSource = readFileSync(
  new URL("./PartnerApplicationModal.tsx", import.meta.url),
  "utf8",
);
const trackingModalSource = readFileSync(
  new URL("./PartnerApplicationTrackingModal.tsx", import.meta.url),
  "utf8",
);

describe("application review flow integrations", () => {
  it("renders the reusable flow in the successful application state", () => {
    expect(applicationModalSource).toContain('import { ApplicationReviewFlow } from "./ApplicationReviewFlow";');
    expect(applicationModalSource).toMatch(/isSuccess[\s\S]*?<ApplicationReviewFlow \/>/);
  });

  it("renders the reusable flow only for a pending tracked application", () => {
    expect(trackingModalSource).toContain('import { ApplicationReviewFlow } from "./ApplicationReviewFlow";');
    expect(trackingModalSource).toContain('const isPending = application ? normalizeStatus(application.status) === "pending" : false;');
    expect(trackingModalSource).toContain('{isPending && <ApplicationReviewFlow />}');
  });
});
```

- [ ] **Step 2: Run the integration test and verify the missing integrations fail**

Run: `npm test -- src/components/ApplicationReviewFlow.integration.test.tsx`

Expected: FAIL because neither modal imports or renders `ApplicationReviewFlow`.

- [ ] **Step 3: Add the flow to the successful submission state**

In `src/components/PartnerApplicationModal.tsx`, add:

```tsx
import { ApplicationReviewFlow } from "./ApplicationReviewFlow";
```

Render it after the existing “We'll review your details…” paragraph and before the application-code card:

```tsx
<ApplicationReviewFlow />
```

- [ ] **Step 4: Add the flow only to pending tracking results**

In `src/components/PartnerApplicationTrackingModal.tsx`, add:

```tsx
import { ApplicationReviewFlow } from "./ApplicationReviewFlow";
```

Next to the existing derived status values, add:

```tsx
const isPending = application ? normalizeStatus(application.status) === "pending" : false;
```

Render the component after `statusMeta.description` and before the application detail list:

```tsx
{isPending && <ApplicationReviewFlow />}
```

- [ ] **Step 5: Run the focused component and integration tests**

Run: `npm test -- src/components/ApplicationReviewFlow.test.tsx src/components/ApplicationReviewFlow.integration.test.tsx`

Expected: PASS with all tests passing.

- [ ] **Step 6: Run the full test and build verification**

Run: `npm test`

Expected: PASS with the entire Vitest suite passing.

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

Run: `npm run build`

Expected: PASS and generate the production bundle and derived public assets.

- [ ] **Step 7: Commit the modal integrations**

```bash
git add src/components/PartnerApplicationModal.tsx src/components/PartnerApplicationTrackingModal.tsx src/components/ApplicationReviewFlow.integration.test.tsx
git commit -m "Show same-day application review flow"
```

### Task 3: Visual and Accessibility Verification

**Files:**
- Verify: `src/components/ApplicationReviewFlow.tsx`
- Verify: `src/components/PartnerApplicationModal.tsx`
- Verify: `src/components/PartnerApplicationTrackingModal.tsx`

**Interfaces:**
- Consumes: The completed reusable flow and modal integrations from Tasks 1 and 2
- Produces: Verified mobile/desktop, light/dark, keyboard, and screen-reader behavior

- [ ] **Step 1: Start the local application**

Run: `npm run dev`

Expected: Vite reports the local application URL and serves the app without startup errors.

- [ ] **Step 2: Verify the successful submission modal**

Submit a valid partner application in the local test environment. Confirm:

```text
Submitted → Under Review → Decision
Your submission will be reviewed and decided within the day.
```

The first step is visibly complete, the second visibly current, and the third visibly upcoming.

- [ ] **Step 3: Verify tracking status conditions**

Track a pending application and confirm the flow appears below the pending-status description. Track approved and rejected applications and confirm the flow does not appear while each existing status-specific message remains visible.

- [ ] **Step 4: Verify responsive and theme behavior**

At a 320px viewport and a desktop viewport, confirm labels remain readable and inside the modal. Repeat in light and dark themes and confirm markers, connectors, labels, and the timing message have adequate contrast.

- [ ] **Step 5: Verify accessibility semantics**

Inspect the rendered accessibility tree and confirm:

- The process is an ordered list named `Application review process`.
- Each step exposes its label and textual state.
- `Under Review` exposes `aria-current="step"`.
- Decorative connectors and icons are excluded from the accessibility tree.

- [ ] **Step 6: Record any necessary visual corrections and re-run verification**

If the checks reveal a layout or accessibility defect, update only `ApplicationReviewFlow.tsx`, add a regression assertion to `ApplicationReviewFlow.test.tsx`, then run:

```bash
npm test -- src/components/ApplicationReviewFlow.test.tsx src/components/ApplicationReviewFlow.integration.test.tsx
npm run lint
npm run build
```

Expected: All commands pass after the correction.

