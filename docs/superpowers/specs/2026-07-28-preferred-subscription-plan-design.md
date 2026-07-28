# Preferred Subscription Plan Design

## Goal

Allow administrators and auditors to choose one preferred subscription plan, while treating the last configured plan as preferred for existing configurations that do not yet store a preference.

## Data Model

Add an optional `preferred` boolean to each `SubscriptionPlan`.

At runtime, plan preference follows these rules:

1. If one or more stored plans have `preferred: true`, use the first such plan and normalize all others to `preferred: false`.
2. If no plan is explicitly preferred, use the last plan.
3. If there are no plans, there is no preferred plan.

Whenever plans are saved from the dashboard, exactly one plan is persisted with `preferred: true` when the plan list is non-empty.

## Shared Plan Helpers

Add small, focused helpers to the subscription billing module:

- Resolve the preferred plan index using the explicit flag and last-plan fallback.
- Normalize a plan array so at most one plan is preferred.
- Mark a selected plan as the only preferred plan.

These helpers keep preference behavior consistent across the dashboard, public pricing, and partner application form without changing billing calculations.

## Administrator and Auditor Dashboard

The existing Subscriptions screen is shared by administrators and auditors. Each plan card will show its preference state.

While editing:

- Each card includes a control labeled to mark that plan as preferred.
- Choosing a plan immediately clears the preferred state from every other plan.
- The currently preferred plan cannot be toggled off without choosing another plan, preserving the single-selection rule.

While previewing:

- The preferred plan shows a visible `Preferred` badge.
- The preferred card receives a modest visual highlight consistent with the existing design.

Adding a plan does not automatically replace the current explicit preference. If the list has no preferred plan, the last plan is used. Removing the preferred plan makes the new last plan preferred. Saving persists the normalized result.

## Public Plan Displays

The public pricing page and the partner application plan-selection step resolve preference through the shared helper.

- The preferred card shows a visible `Preferred` badge and a modest highlight.
- Plan order remains unchanged.
- The partner application form initially selects the preferred plan.
- Users may still choose any other plan.

The label is informational and does not affect price, billing interval, subscription limits, or eligibility.

## Legacy and Error Behavior

Configurations created before this feature require no migration because the missing flag falls back to the last plan.

If malformed data contains multiple preferred plans, the first explicitly preferred plan wins in memory and the next dashboard save repairs the stored array to exactly one preferred plan.

Loading and saving continue to use the existing subscription settings document and existing error handling.

## Testing

Add focused automated coverage for the preference helpers:

- An explicit preferred plan is resolved.
- A legacy plan array falls back to its last plan.
- Multiple explicit flags normalize to one.
- Selecting a new preferred plan clears the old selection.
- Removing the preferred plan falls back to the new last plan.
- An empty plan array has no preferred plan.

Run the relevant test suite, TypeScript checks, and production build before completion.

## Out of Scope

- Reordering subscription plans.
- Customizing the badge text.
- Allowing multiple preferred plans.
- Changing pricing, invoicing, or subscription access rules.
