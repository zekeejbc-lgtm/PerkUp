# Perk Privacy Compliance Register

Owner: Data Protection Officer  
Review cadence: quarterly and before each material feature, provider, or data-use change  
Legal scope: Philippine Data Privacy Act of 2012 and its IRR; assess additional jurisdictions before serving users elsewhere

## Release gate

A production release that changes personal-data collection or use requires:

- an updated processing register and Privacy Impact Assessment;
- a privacy-notice and collection-notice review;
- approved retention and deletion behavior;
- processor/subprocessor and cross-border transfer review;
- security tests and Supabase database advisors;
- a named incident owner and current breach-notification contacts;
- DPO approval recorded in the release ticket.

## Current technical controls

- Supabase RLS and least-privilege grants
- MFA assurance for enrolled users and privileged operations
- secure old-and-new email confirmation
- server-only email delivery with throttled OTP issuance
- neutral public account-availability responses
- newsletter double opt-in and one-click unsubscribe
- verified account deletion and session revocation
- authenticated self-service JSON data export with security secrets excluded
- daily retention cleanup with legal holds for accounting records
- signed PayMongo webhooks, encrypted local scan cache, CSP and HSTS

The documents in this directory are operational records and must be completed and signed by the organization. Code alone does not create regulatory compliance.
The current dependency risk decision is recorded in `security-exceptions.md` and requires owner approval.
