# Subscription Access Action Assessment

## Goal

Before an administrator, assistant administrator, or auditor confirms a manual
subscription access action, show whether the action is justified by the store's
current billing facts. The check is advisory: authorized users may still force an
action that falls outside the expected billing lifecycle.

## Scope

The assessment applies to the existing Warn, Grace, Freeze for non-payment, and
Restore actions on the primary store's billing controls. Saving billing settings
and administrative suspensions are unchanged.

## Policy assessment

The backend is the authoritative assessor. It uses the current billing
subscription, the latest relevant unpaid invoice, the invoice due date, configured
warning lead time and grace period, initial-payment state, payment status, current
effective access state, and the store subscription end date when billing rows are
unavailable.

- Warn is expected when an unpaid invoice is approaching its due date within the
  configured warning window.
- Grace is expected when an unpaid invoice has reached its due date but its
  configured grace deadline has not passed.
- Freeze for non-payment is expected when initial payment is outstanding or an
  unpaid invoice has passed its grace deadline.
- Restore is expected when access is warning, grace, or frozen and billing no
  longer supports that restriction, such as after confirmed payment. A manual
  restore while debt remains is reported as outside policy but remains possible.

Missing or contradictory billing evidence produces an outside-policy verdict
rather than a false valid verdict. The response includes a concise reason and the
facts used, including relevant dates and invoice identifiers.

## User flow

Pressing an action button opens the existing confirmation panel immediately. The
panel shows an assessment loading state while it requests a fresh server verdict.
Once loaded, it displays either:

- **Valid under billing policy**, with the supporting reason; or
- **Outside expected billing policy**, with the reason and relevant billing facts.

The confirmation button remains enabled after assessment. For an outside-policy
decision its label changes to `Force <action>`. The button is disabled only while
the assessment or mutation is in flight. If assessment cannot be completed, the
panel reports that validation is unavailable and treats confirmation as a forced
override.

## Execution and audit

Confirmation sends the requested action and whether the user acknowledged an
outside-policy or unavailable verdict. The backend reassesses against current data
immediately before writing. It does not block an authorized override, but returns
the execution-time verdict and records it in the existing audit event metadata:

- requested access status;
- whether the action matched policy;
- whether it was forced;
- assessment reason;
- relevant invoice and policy dates.

Existing authorization remains unchanged: the privileged roles already accepted
by the admin backend may perform these actions. Initial-payment protection remains
a hard safety rule where the current implementation already forbids restoring or
softening access before payment confirmation.

## Components

1. A pure subscription action assessment helper owns the lifecycle rules and is
   unit tested with a fixed clock.
2. The admin backend exposes a read-only assessment action and reuses the same
   helper during mutation.
3. `AdminStoreDetail` requests the assessment when the panel opens and renders the
   verdict, facts, loading state, and forced-action label.
4. Audit metadata records the execution-time assessment.

## Error handling

- A missing store or unauthorized actor uses the existing 403/404 behavior.
- Recoverable assessment-data gaps produce an outside-policy result.
- Network or server errors leave the panel open, explain that validation is
  unavailable, and keep the forced confirmation available.
- Mutation failures remain visible inside the panel and do not close it.

## Testing

- Unit tests cover each action before, during, and after its valid window, paid
  invoices, initial payments, missing evidence, and already-matching states.
- Backend-focused tests verify assessment and forced audit metadata.
- Component tests verify loading, valid, outside-policy, unavailable, normal
  confirm, and forced confirm states.
- The full test suite, TypeScript check, and production build must pass.
