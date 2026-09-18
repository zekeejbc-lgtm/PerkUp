# Privacy Impact Assessment

System: Perk loyalty and store subscription platform  
Owner: **complete**  
DPO reviewer: **complete**  
Approval date/version: **complete**

## Necessity and proportionality

Perk needs verified identity and store relationships to prevent reward fraud and operate loyalty programs. Birthday, location, social links, images, diagnostics, and long-lived logs require feature-level necessity review. Optional marketing is separate and consent-based. Store personnel receive only store-linked customer data.

## Principal risks and controls

| Risk | Control | Residual action |
|---|---|---|
| cross-tenant disclosure | RLS, server authorization, tenant tests | quarterly access review |
| session/account takeover | MFA, current password, old/new email confirmation, session revocation | confirm Auth security notifications/JWT lifetime |
| account enumeration | neutral responses and salted rate limits | add managed bot challenge if abuse appears |
| email bombing/phishing | server-secret mail actions, rate-limited OTP, fixed server links | redeploy Apps Script and rotate secret |
| unwanted marketing | explicit consent, double opt-in, unsubscribe, finite suppression | confirm campaign sender uses only active rows |
| excessive retention | daily deletion/redaction job and invoice legal holds | quarterly cleanup evidence |
| processor/cross-border failure | vendor register and DPAs | obtain all listed evidence |
| privileged misuse | MFA, audit events, auditor separation | quarterly privileged-role review |
| breach response delay | 72-hour response runbook | tabletop exercise twice yearly |

## Approval

The DPO must verify the data inventory against production, complete provider locations and contracts, review residual risks, record stakeholder consultation, and sign acceptance before this PIA is considered complete.
