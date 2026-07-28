# Partner Location Search CSP Design

## Goal

Restore partner address lookup in production without retaining the public Nominatim service's prohibited autocomplete request pattern.

## Design

The Vercel Content Security Policy will add only `https://nominatim.openstreetmap.org` to `connect-src`, alongside the existing Supabase and third-party API origins. The partner application will stop launching a debounced request for every address change. Instead, the address input will perform a lookup only when the applicant presses Enter or clicks a visible Search button.

The existing loading, suggestion, selection, error, and map-centering behavior will remain. Search requires at least three non-whitespace characters; shorter input displays a concise validation message without making a network request. Typing a new address clears stale suggestions and errors.

## Scope

- Modify only the partner application address lookup and deployment CSP.
- Keep Nominatim's existing search endpoint and response shape.
- Do not add dependencies, backend services, API keys, caching, or unrelated refactors.
- Preserve manual map pin placement and the existing form submission flow.

## Verification

- A component test proves typing alone does not call the geocoder.
- A component test proves Enter triggers exactly one lookup.
- A deployment-policy test proves the geocoder origin is present in `connect-src`.
- Run TypeScript checks, the full Vitest suite, and a production build.
