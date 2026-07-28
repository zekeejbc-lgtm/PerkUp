# Application Review Flow Design

## Goal

Reassure partner applicants by showing what happens after submission and setting a clear same-day decision expectation.

## Applicant Experience

Show the same compact three-step process on:

- The successful `Application Received` state immediately after submission.
- The `Pending Review` result in the application tracking modal.

The process is:

1. **Submitted**
2. **Under Review**
3. **Decision**

On both surfaces, `Submitted` appears complete, `Under Review` appears active, and `Decision` appears upcoming. Directly below the flow, display:

> Your submission will be reviewed and decided within the day.

Approved and rejected tracking results will not show the pending-state flow because a decision has already been made. Their existing status-specific messages remain unchanged.

## Visual Treatment

Use a compact horizontal flow that fits the existing modal cards and remains readable on mobile. Each step uses a small status marker, a short label, and a connecting line. Styling must follow the current light and dark themes and reuse the existing neutral, success, and pending color language.

The flow is informational only and has no interaction, animation, or backend dependency.

## Implementation Boundaries

- Add a small reusable presentational component for the review flow.
- Render it in the successful submission state of `PartnerApplicationModal`.
- Render it only for pending applications in `PartnerApplicationTrackingModal`.
- Do not change application status logic, review timing enforcement, email behavior, or admin workflows.

## Accessibility

The flow must remain understandable without relying on color. Each step has visible text, and the current/completed state should be conveyed semantically or with accessible supporting text where needed.

## Verification

- Confirm the flow appears after a successful submission.
- Confirm the flow appears for a pending tracked application.
- Confirm it does not appear for approved or rejected tracked applications.
- Confirm the message is exactly: `Your submission will be reviewed and decided within the day.`
- Confirm the layout remains readable at mobile and desktop modal widths in light and dark themes.
