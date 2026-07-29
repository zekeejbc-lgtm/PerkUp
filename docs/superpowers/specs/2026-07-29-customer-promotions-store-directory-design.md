# Customer Promotions Store Directory Design

## Goal

Replace the customer Promotions & Campaigns page's all-store promotion feed with a store-first directory. Selecting a store opens a routed store page containing every promotion for that store, split into active and archived/unavailable sections, while selecting a promotion opens the existing details modal.

## Navigation and Presentation

- `/customer/promotions` shows one tile for every available store that has at least one promotion.
- `/customer/promotions/:storeId` shows only that store's promotions.
- Store tiles show the store logo, name, category, total promotion count, active count, and archived/unavailable count.
- The store page has a back link, store identity, store-specific search, the existing card/page/table view selector, and pagination.
- Promotion cards, rows, status badges, and the existing information modal remain the source of truth for promotion details.

## Promotion Sections

The store page renders `Active promotions` before `Archived & unavailable`.

A promotion is active only when its store exists and is active, the promotion has not been discontinued, its start date has arrived, its end date has not passed, and claims remain. All other promotions—including ended, discontinued, fully claimed, upcoming, and promotions belonging to inactive stores—appear in `Archived & unavailable` while retaining their precise existing status badge.

## Data Flow and Safety

The current parallel load of promotions, stores, and cards remains unchanged. A tested pure model groups loaded promotions by canonical store ID, computes section counts, filters the store directory, and isolates the selected store's promotions. Unknown store routes render a safe not-found state and never show another store's promotions.

No database or backend changes are required.

## Empty, Responsive, and Accessible States

- No promotions: retain a discovery-oriented empty state.
- No matching stores or promotions: show a scoped no-results state with a clear-search action.
- Invalid store route: show a back-to-stores action.
- Store tiles and promotion cards remain keyboard-accessible.
- Existing dark mode and responsive layouts are preserved.

## Testing

Automated tests cover store grouping/counts, directory filtering, active/archive classification, selected-store isolation, section ordering, and promotion search. Verification includes focused Vitest tests, TypeScript, the full test suite, the production build, and whitespace checks.
