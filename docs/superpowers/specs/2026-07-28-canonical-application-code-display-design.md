# Canonical Application Code Display

## Problem

Partner application submission returns and displays the canonical public identifier
stored in `applications.public_id`, such as `APP-J42HXT4F`. The tracking result
currently converts that identifier into the older derived `PKUP-...` tracking code
before rendering it. This makes one application appear to have two different
application codes.

## Design

The tracking result will render the `trackingNumber` returned by the
`partner-application` Edge Function without reformatting it. The Edge Function
already returns `applications.public_id` as `trackingNumber`, so submission,
email, and tracking results will consistently show the same `APP-...` value.

The tracking input placeholder will use an `APP-...` example to reinforce the
canonical format.

Legacy compatibility remains unchanged in the Edge Function. Existing `PKUP-...`
codes will still resolve through the stored `data.trackingCode` field or the
derived-code fallback, but successful results will display the canonical
`APP-...` identifier.

## Testing

A focused regression test will assert that the display-code selector:

- returns an `APP-...` tracking number unchanged;
- returns a legacy `PKUP-...` tracking number unchanged as a defensive fallback.

The relevant test suite, type checking, and production build will be run after
the implementation.

## Scope

No database schema, stored application record, Edge Function lookup behavior, or
legacy data will be changed.
