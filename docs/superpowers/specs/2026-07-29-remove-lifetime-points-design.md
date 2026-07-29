# Remove Lifetime Points Design

## Goal

Perk will use one general loyalty balance per customer store card. The separate
customer-level `lifetimeStars` value will be removed from storage, update logic,
and user interfaces. Promotion stamp progress remains separate and unchanged.

## User Experience

The store-owner customer details page will show only the selected store card's
current points. The profile details section will no longer show lifetime points.

The customer overview will no longer show a Lifetime Stars summary card. Its
remaining overview cards will reflow within the existing responsive grid.

Customer segments on the store-owner customer list and detail view will continue
to use the existing thresholds:

- `0` through `5` current points: New Customer
- `6` through `20` current points: Regular Customer
- More than `20` current points: Loyal Regular

These labels will be calculated from the selected store card's current `stars`
balance, making the segment specific to the store whose customers are being
viewed. Search terms for `new`, `regular`, and `loyal` will use the same rule.

Promotion stamp cards will continue to read and write
`cards.data.promoProgress[promotionId]`. Their progress will not affect current
points or customer segments.

## Data and Backend Changes

A new Supabase migration will:

1. Remove the `lifetimeStars` key from every `public.customers.data` JSON object.
2. Replace `public.increment_loyalty_totals` with an implementation that updates
   only `public.cards.data.stars` and its receipt/update metadata.
3. Preserve the RPC's existing name, parameters, grants, and validation so
   currently deployed Edge Functions remain compatible while deployments roll
   forward.

Application backend code will stop initializing, preserving, or returning
`lifetimeStars` when creating or updating customer records. Point adjustments
and general QR scans will continue calling the existing RPC and will update only
the relevant store card.

Historical migrations will remain unchanged because they describe already
applied database history. The new migration is the authoritative removal.

## Frontend Changes

`StoreOwnerCustomers` will remove all lifetime-point loading and display logic.
Its customer model and segment calculations will use the card's `stars` value.

`CustomerOverview` will remove the customer-record fetch performed solely for
`lifetimeStars`, along with the Lifetime Stars state and summary card. Other
overview data loading remains unchanged.

The Firebase blueprint, which documents the compatibility data model, will stop
declaring `lifetimeStars`. Security documentation will remove the obsolete
lifetime-point tampering scenario or rewrite it to cover direct card-star
tampering.

## Compatibility and Failure Handling

The RPC will retain its existing public signature to prevent failures if a
database migration and Edge Function deployment briefly run different versions.
Its access remains restricted to `service_role`.

Removing `lifetimeStars` is idempotent at the data level: customer rows without
the key remain unchanged. Existing card balances and promotion progress are not
modified.

Customer profile updates must not recreate the removed key. Account creation and
administrative customer creation must likewise omit it.

## Verification

Automated coverage will prove that:

- the loyalty RPC changes only the targeted card balance;
- customer JSON no longer gains a `lifetimeStars` key;
- store-owner segmentation uses current store-card points;
- owner and customer interfaces no longer render lifetime-point labels;
- promotion progress remains independent;
- existing point adjustment and scan workflows still build and pass their
  focused tests.

Verification will include focused database and frontend tests, TypeScript,
the full test suite where practical, the production build, and a repository
search confirming that active source code no longer references
`lifetimeStars` or lifetime-point labels.
