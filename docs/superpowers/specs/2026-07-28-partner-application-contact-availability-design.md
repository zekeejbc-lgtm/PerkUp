# Partner Application Contact Availability Design

## Goal

Prevent partner applications from using an email address or phone number that is already associated with any Perk account or any existing partner application. This avoids applications that cannot be converted into store-owner accounts during approval.

## Contact Rules

- Normalize email addresses by trimming whitespace and converting them to lowercase.
- Normalize Philippine phone numbers to digits-only `63XXXXXXXXXX` form, matching the existing customer phone registry.
- An email is unavailable when it belongs to a Supabase Auth user or appears in any existing partner application.
- A phone number is unavailable when it appears in `customer_phones` or any existing partner application.
- All application statuses participate in the check. Rejected or approved applications continue to reserve their submitted contact details unless the application record is deleted.

## User Flow

When the applicant clicks **Next Step**, the client calls a server-side availability action with the normalized email and phone. If either value is unavailable, the form remains on the business-details step and shows a clear error naming the conflicting field.

When the applicant submits the final application, the partner-application Edge Function repeats the authoritative availability check before uploading a logo or inserting an application. This protects against stale client checks and direct API calls.

## Server and Database Design

The partner-application Edge Function will expose a `check_availability` action and share normalization and lookup logic with its submission path. Account email checks use the existing Supabase Auth admin API pattern. Customer phone checks use `customer_phones`. Application checks query normalized JSON contact fields.

The database will add unique expression indexes for normalized application email addresses and phone numbers. These indexes close the race between simultaneous application requests. Before creating them, the migration will fail clearly if legacy duplicate application contacts exist rather than silently deleting or modifying user data.

The Edge Function will translate database unique violations into the same contact-conflict response used by the pre-check.

## Responses and Errors

Availability responses contain booleans only:

- `emailAvailable`
- `phoneAvailable`

Conflict submissions return HTTP 409 with a stable conflict code and a user-facing message:

- `email_unavailable`: `This email address is already associated with an account or application.`
- `phone_unavailable`: `This phone number is already associated with an account or application.`
- `contact_unavailable`: both values conflict.

Unexpected lookup or database failures return a generic server error and do not claim that contact details are available.

## Security

All privileged lookups remain inside the Edge Function using the service-role key; no privileged key or raw account record is exposed to the browser. The public response reveals only availability, consistent with the existing signup-availability behavior.

## Testing and Verification

- Unit-test email and phone normalization.
- Unit-test conflict response selection for email-only, phone-only, and combined conflicts.
- Test that the client cannot advance when availability reports a conflict.
- Test that the server performs the authoritative check before file upload and insertion.
- Run the Vitest suite, TypeScript check, and production build.
- Apply the migration, deploy the Edge Function, inspect database advisors, and run read-only verification queries for the new indexes and active function version.
