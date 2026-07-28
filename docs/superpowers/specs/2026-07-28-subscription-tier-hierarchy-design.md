# Subscription Tier Hierarchy Design

## Goal

Give PerkUp administrators an explicit, safe way to declare subscription tier hierarchy so upgrade eligibility never depends on accidental plan insertion order. Auditors can review the hierarchy but cannot change it.

## Roles and governance

- Administrators and assistant administrators may edit and save tier hierarchy.
- Auditors see the same hierarchy, prices, intervals, and limits in read-only mode.
- Store owners cannot declare or override hierarchy.
- PayMongo invoice creation, payment links, webhook verification, and renewal settlement remain unchanged.

## Plan model

Each plan stores an integer `tierRank`.

- A larger rank means a higher subscription tier.
- Ranks must be non-negative integers and unique across the catalog.
- Ranks use gaps of 10 by default so administrators can insert plans later.
- Existing plans without `tierRank` are normalized by ascending price, then stable existing order.
- Server snapshots retain the existing `order` property for database compatibility, but its value comes from `tierRank`.

The development catalog is migrated to:

| Plan | Tier rank |
|---|---:|
| Testing Plan | 0 |
| Standard | 10 |
| Premium | 20 |
| Enterprise | 30 |

## Administrator experience

The Admin Dashboard's **Subscriptions** page displays a visible **Tier hierarchy** section on every plan card.

- Each card shows its numeric tier rank and a Lowest/Higher/Highest tier label.
- In edit mode, administrators can move a plan down or up in the hierarchy.
- Moving plans rewrites all ranks to `0, 10, 20, ...` in the visible hierarchy.
- Adding a plan assigns it the next available rank.
- Saving is blocked for duplicate ranks, invalid ranks, duplicate plan IDs, invalid prices, or empty names.
- Before persistence, a confirmation panel explains that hierarchy changes affect which future upgrades are offered, lists the resulting order, and reports the number of existing primary subscriptions whose catalog configuration may be affected.

Auditors see the hierarchy and an explicit read-only notice. Edit and save controls are unavailable.

## Upgrade eligibility

An upgrade candidate must satisfy every existing billing rule plus the explicit tier rule:

1. Target `tierRank` is greater than current `tierRank`.
2. Target catalog price is greater than the store's current contracted renewal amount.
3. Target interval matches the current interval.
4. Existing subscription-state, invoice-state, and feature-flag checks continue to pass.

This preserves the no-downgrade business rule and prevents a cheap testing plan from becoming the highest tier merely because it was added last.

## Migration and compatibility

A Supabase data migration updates the `settings/subscriptions` JSON document:

- Existing plans are sorted by ascending price with stable tie-breaking.
- `tierRank` values are assigned in increments of 10.
- All other plan fields are preserved.
- No billing subscription, invoice, payment link, payment event, or PayMongo record is changed.

The frontend also normalizes legacy catalogs defensively so an older cached document remains usable during rollout.

## Error handling

- Invalid hierarchy never reaches persistence.
- The server rejects an invalid or duplicate rank catalog rather than silently guessing.
- A stale upgrade quote remains invalidated through the existing catalog `updated_at` fingerprint.
- If the current plan is absent from the catalog, the existing support-facing blocked reason remains.

## Verification

- Unit tests prove legacy rank inference, explicit rank use, and rank-based upgrade eligibility.
- UI tests prove administrator controls, auditor read-only behavior, validation, and save confirmation.
- Existing subscription upgrade, TypeScript, auditor, build, Deno, and PayMongo regression suites must pass.
- A database query verifies the migrated catalog order and ranks.
- Deployed Edge Function source and the live frontend bundle must contain the hierarchy behavior.
