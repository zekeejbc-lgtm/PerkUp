# Processor and Transfer Register

| Provider | Purpose/data | Required evidence | Status |
|---|---|---|---|
| Supabase | Auth, database, Edge Functions, logs | DPA, subprocessor list, region, retention, breach terms, access controls | Obtain/confirm |
| Vercel | web hosting and request logs | DPA, subprocessors, log retention, region, breach terms | Obtain/confirm |
| Google Workspace/Drive/Apps Script/OAuth | images, email, login identity | Workspace terms/DPA, sharing settings, retention, admin MFA | Obtain/confirm |
| PayMongo | store subscription payment references | merchant agreement/DPA, PCI scope, webhook and retention terms | Obtain/confirm |
| OpenStreetMap/Nominatim/Google Maps | location search and directions | terms, request-log/privacy review | Confirm |
| Have I Been Pwned | five-character hash prefix | API terms and privacy review; no full password/hash | Confirm |

The DPO records the controller/processor role, processing location, subprocessors, transfer safeguard, security commitments, deletion/return terms, audit rights, and incident-notification deadline before approval. Provider changes trigger a PIA and notice review.
