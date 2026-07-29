# Customer Cards Store Directory Design

## Goal

Revise the customer Cards experience so customers choose a store before viewing reward cards. Each store entry and store-specific card page must show the customer's existing loyalty credit balance for that store.

## Routes and Navigation

- `/customer/cards` is the store directory.
- `/customer/cards/:storeId` is the selected store's reward-card page.
- Selecting a store in the directory navigates to its store-specific route.
- The store page includes a visible back action to the store directory.
- Direct visits to a store route load that store when the customer owns a loyalty card for it.
- An unknown store ID, or a store for which the customer has no loyalty card, shows a safe not-found state with a return action.

## Store Directory

The directory retains the `Reward Cards` page title but changes its introductory text to explain that customers should select a store.

Each store tile shows:

- Store logo, with a store-icon fallback.
- Store name.
- The customer's loyalty credit balance from the existing card `stars` field.
- The number of visible reward cards associated with that store.
- A clear affordance indicating that the tile opens the store's cards.

Stores are grouped by canonical `storeId`, not by display name. If multiple loyalty-card rows exist for the same store, the directory shows one store tile and sums their general `stars` balances. Store metadata is loaded from the store document, with card data used only as a fallback for the store name and stamp style.

The directory search filters by store name. It does not search promotions because promotions are not shown until a store is selected.

## Store-Specific Header and Location

The selected store page shows:

- Back action.
- Store logo and name.
- The customer's loyalty credit balance.
- A location map using the existing customer map base layers, marker presentation, and coordinate conventions.
- A Navigate button using the existing `DirectionsButton` behavior.

When valid coordinates are unavailable, the page shows the store address when present and a concise location-unavailable state instead of an empty or broken map. The Navigate button may still use the address fallback supported by the existing directions helper.

## Reward Card Organization

Only promotions associated with the selected `storeId` are displayed. Search on this page filters that store's cards by promotion title, description, public IDs, and linked product name.

Cards are shown in this order:

1. `Ready to Claim`
2. `Ongoing`
3. `Archived / Expired`

State mapping:

- `Ready to Claim`: progress has reached the required stamp count, including an active reserved claim. An active reserved claim opens its existing QR/code redemption details.
- `Ongoing`: progress is greater than zero but below the required stamp count, and the promotion is still active.
- `Archived / Expired`: redeemed claims, expired claims or reservations, and promotions that are inactive or past their end date.

The existing grid/list control, reward-card presentation, details modal, claim action, QR/code panel, and realtime refresh behavior remain available within the selected store page.

## Data Flow

The page loads the customer's loyalty-card rows and promotion claims as it does today. It then:

1. Extracts unique store IDs from the customer's card rows.
2. Loads each store document once to obtain authoritative metadata and stamp styling.
3. Loads promotions for those stores.
4. Associates promotions, customer progress, and claims.
5. Builds one store summary per store ID.
6. Uses the route `storeId` to select and display a store without a second independent data model.

No database migration or new balance field is required. The requested loyalty credit is the existing per-card `stars` balance used by the staff loyalty workflow.

## Empty, Loading, and Error States

- While data loads, retain a Cards page skeleton.
- A customer with no loyalty cards sees the existing discovery-oriented empty state and a link to find stores.
- A directory search with no matches shows a store-specific no-results message.
- A selected store with no visible reward promotions still shows the store identity, loyalty credit, map/navigation area, and an empty-card message.
- Claim failures retain the existing user-visible error behavior.
- Store metadata failures fall back to information on the customer's loyalty-card row where possible.

## Accessibility and Responsive Behavior

- Store tiles are semantic links with descriptive accessible labels.
- Logos have meaningful alternative text; icon fallbacks are decorative.
- Map and navigation controls retain keyboard access.
- The directory uses one column on small screens and expands to multiple columns on larger screens.
- The store header and map stack on mobile and use a balanced multi-column layout on larger screens.
- Existing dark-mode behavior is preserved.

## Testing

Automated tests will cover the pure grouping and classification behavior:

- Multiple card rows for one store produce one directory entry.
- Loyalty credit balances are summed per store.
- Promotions are isolated to the selected store.
- Ready, ongoing, and archived/expired states are classified correctly.
- Directory search matches store names only.
- Invalid or inaccessible store IDs do not expose another store's cards.

The implementation will also be verified with the project TypeScript check, focused tests, full Vitest suite, and production build.
