# Perk Security Specification

Perk uses Supabase Auth, Postgres Row Level Security, Edge Functions, and server-only integrations. Browser authorization is never treated as the security boundary.

## Security invariants

1. Roles, account status, store ownership, and subscription access are changed only through RLS-protected writes or an authenticated Edge Function.
2. Customers can read only their own private profile and loyalty records. Store personnel can access a customer only when a card ties that customer to their assigned store.
3. Loyalty mutations, QR issuance/redemption, promotion claims, account administration, billing, and managed-image changes are authorized on the server.
4. Privileged Edge actions require a valid Supabase user, an allowed database role, active account status, and AAL2 whenever an enrolled MFA factor requires it.
5. Public submission endpoints validate size and type, use salted rate-limit identifiers, and do not disclose whether an email or telephone number belongs to an account.
6. Service-role, PayMongo, cron, and Google integration secrets exist only in server secret stores.
7. Email changes require confirmation by both the current and new address. Account deletion revokes refresh sessions before deleting Auth identity data.
8. PayMongo state changes require verified webhook signatures and invoice matching.
9. Personal-data retention is finite and enforced by the daily privacy-retention job, subject to explicit legal holds.
10. Audit and diagnostic payloads exclude passwords, tokens, cookies, card credentials, and other secrets.

## Required verification

- `npm run lint`
- `npm test`
- `npm run build`
- `npx supabase db lint --linked --schema public,storage --level warning --fail-on none`
- Database tests under `supabase/tests/database`
- Manual negative tests for RLS cross-tenant access, unauthenticated Edge calls, rate limits, email-change confirmation, newsletter opt-in/unsubscribe, deletion, and signed PayMongo webhooks

Production releases must record these results in the release checklist and must not rely on the obsolete `firestore.rules` file as the active authorization layer.
