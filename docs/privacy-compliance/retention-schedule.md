# Retention and Disposal Schedule

| Record | Period | Disposal | Hold/exception |
|---|---:|---|---|
| Active customer/account data | account life | verified deletion; cards de-identified | active dispute or legal requirement |
| Approved application contact fields | 90 days after approval | automated field redaction | documented investigation |
| Rejected/declined/cancelled application | 24 months | automated row deletion | legal hold |
| Feedback | 24 months | automated deletion | unresolved complaint/legal hold |
| Fixed client diagnostics | 12 months after resolution | automated deletion | active investigation |
| Privileged audit events | 24 months | automated deletion | active investigation/legal hold |
| Billing invoices and completed plan changes | 5 years | automated deletion | audit, protest, refund, dispute, or legal hold |
| Processed PayMongo webhook payloads | 24 months | automated deletion | failed/unresolved event |
| Newsletter confirmation | 7 days | automated deletion | none |
| Newsletter suppression | 30 days after unsubscribe | automated deletion | none |
| Rate-limit hashes | 8 days since use | automated deletion | none |

The DPO reviews the scheduled cleanup quarterly and records counts, failures, legal holds, and any manual disposal. Provider backup periods must be appended after the contracts are confirmed.
