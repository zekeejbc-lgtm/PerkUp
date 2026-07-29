# Customer Ticket Store Directory Design

## Goal

Revise My Tickets so customers choose a store before viewing its scan-ticket history. The directory identifies stores by name and logo, while each store page shows that store's tickets in chronological order and clearly identifies the promotion credited by each scan.

## Routes and Navigation

- `/customer/tickets` is the store directory.
- `/customer/tickets/:storeId` is the selected store's ticket-history page.
- Selecting a store navigates to its ticket-history route.
- The ticket-history page includes a visible Back to stores action.
- Direct visits to a valid store route load that store when the signed-in customer owns at least one ticket from it.
- Unknown or inaccessible store IDs show a safe not-found state with a return action and never expose another store's tickets.
- Legacy tickets without a canonical `storeId` use a deterministic name-based route key so they remain accessible.

## Store Directory

Each store tile shows:

- The authoritative store logo, with a store-icon fallback.
- The authoritative store name, with the ticket's stored name as fallback.
- The customer's ticket count for that store.
- The date of the latest ticket.
- A clear affordance indicating that the tile opens the ticket history.

Stores are grouped by canonical `storeId`, not display name. Store metadata is loaded once from the existing `stores` collection for the store IDs found in the customer's tickets. Legacy tickets without `storeId` are grouped by a normalized store-name key.

Directory search filters store names. Pagination applies to store tiles rather than individual tickets.

## Store Ticket History

The selected store page shows:

- Back to stores action.
- Store logo and name.
- Total ticket count and date span.
- Search across ticket number, promotion, and staff.
- Date-range filters.
- Chronological sort with oldest first as the default and newest first as an option.

Ticket cards retain the existing ticket number, successful status, scanning staff, issued timestamp, and credited points. Each card includes a visible credit source:

- `Promotion credited` followed by the stored promotion title when the scan targeted a promotion.
- `General loyalty credit` when the scan was not associated with a promotion.

Ticket cards are sorted by issued time, with ticket ID as a deterministic tie-breaker. Invalid timestamps sort consistently rather than breaking rendering.

## Data Flow

The page continues loading all of the signed-in customer's `promotions_scanned` rows in paginated batches from Supabase. Each row is normalized into a customer-ticket model that includes `storeId`, `storeName`, `promotionId`, `promotionTitle`, points, staff, and issued time.

The page then:

1. Groups tickets by canonical store ID, using a deterministic legacy key only when no ID exists.
2. Loads matching store documents once through the existing compatibility data layer.
3. Merges authoritative store name and logo with ticket fallbacks.
4. Builds a store summary and chronologically sorted ticket list per store.
5. Uses the route `storeId` to select one safe store group from that same model.

Realtime insert notifications and the existing five-second quiet refresh remain in place. No database migration is required.

## Empty, Loading, and Error States

- Loading retains the Tickets page skeleton.
- A customer with no tickets sees the existing first-ticket guidance.
- Directory search with no matching stores shows a store-specific no-results state.
- Ticket-history search or date filters with no matches show a ticket-specific no-results state.
- A missing or inaccessible store route shows a safe not-found state.
- Ticket-query failures retain a visible reload error.
- Store metadata failures fall back to ticket data and the store-icon placeholder.

## Accessibility and Responsive Behavior

- Store tiles are semantic links with descriptive accessible labels.
- Logos have meaningful alternative text; fallback icons are decorative.
- Back, search, filters, and sort controls remain keyboard accessible.
- The directory and ticket cards use one column on small screens and multiple columns when space permits.
- Existing dark-mode behavior is preserved.

## Testing

Automated tests cover:

- Multiple tickets for one canonical store produce one directory entry.
- Stores with identical names but different IDs remain separate.
- Store metadata overrides stored ticket name and supplies the logo.
- Legacy tickets without store IDs remain grouped and routable.
- Selected-store lookup never returns another store's tickets.
- Ticket sorting is chronological with a deterministic tie-breaker.
- Promotion scans show their promotion title and general scans show the loyalty fallback.
- Store-directory search and store-ticket search operate on their intended fields.

Verification includes focused Vitest tests, the complete Vitest suite, the TypeScript check, and the production build.
