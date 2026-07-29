# Auditor Subscription Editing Design

## Goal

Auditors must have the same editing capabilities as administrators on the
Subscriptions page.

## Scope

- Treat `auditor` as a subscription plan manager alongside `admin` and
  `assistant_admin`.
- Show auditors the existing **Edit Offers** workflow.
- Allow auditors to add, remove, reorder, and edit plans, prices, intervals,
  features, preferred-plan selection, and subscription limits.
- Allow auditors to use the existing validation, impact confirmation, and save
  workflow.
- Authorize the writes performed by that workflow, including the subscription
  catalog update and its existing propagation to affected stores and owner
  branch limits.

This change does not alter unrelated pages or redesign the application's
general role hierarchy.

## Authorization

The browser must not be the only enforcement layer. The protected subscription
save path must accept `auditor` wherever it accepts `admin`, while continuing to
reject non-administrative roles. Existing billing synchronization and audit
behavior remain unchanged.

## User Experience

Auditors see the same controls, confirmation dialog, validation errors, loading
states, and success or failure messages that administrators see. The auditor
read-only subscription message is removed.

## Testing

- Replace the auditor read-only regression with a test proving an auditor can
  enter edit mode.
- Prove an auditor can complete the existing confirmed save workflow.
- Keep the existing administrator behavior tests.
- Verify non-administrative roles remain unable to edit.
- Verify the relevant authorization layer accepts auditors and rejects
  non-administrative roles.

