# Security Exception Register

## React Router RSC-mode advisory

- Advisory: `GHSA-qwww-vcr4-c8h2`
- Package reviewed: `react-router-dom@7.18.2` / `react-router@7.18.2`
- Audit severity: high
- Review date: 2026-08-02
- Applicability: not exploitable in the current application architecture. Perk is a client-only Vite SPA and does not enable React Server Components, Framework Mode server actions, or React Router action endpoints. The affected RSC action-execution path is absent from both the source and production bundle.
- Decision: retain the latest available React Router release instead of downgrading to a release with older fixed advisories. Keep dependency scanning enabled and upgrade as soon as an upstream patched release exists.
- Compensating controls: static hosting, no application server action handler, restrictive CSP, same-site Supabase authentication, and production build/test verification.
- Owner / approval: **DPO or security owner must sign before production deployment.**
- Re-review: each dependency update, any move to React Server Components/Framework Mode, or 2026-09-02, whichever comes first.

This is a narrowly scoped risk acceptance, not a general waiver for high-severity findings.
