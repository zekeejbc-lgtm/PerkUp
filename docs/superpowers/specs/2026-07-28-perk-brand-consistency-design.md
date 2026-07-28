# Perk Brand Consistency Design

## Objective

Rename the product from **PerkUp** to **Perk** across the website, generated assets, application code, backend code, stored website content, and development identifiers. The canonical public website remains `https://www.perktoday.com`, and the visual wordmark remains **perk.**

The repository and connected Supabase project are still in development, so compatibility with legacy `perkup` browser keys, QR formats, cache names, and other development identifiers is not required.

## Naming Standard

- Use **Perk** in normal customer-facing prose, headings, metadata, document titles, accessibility labels, and system messages.
- Use **perk.** only when referring to or displaying the visual wordmark.
- Use lowercase `perk` in internal prefixes, storage keys, cache names, QR formats, reserved usernames, filenames, and other code identifiers.
- Use `https://www.perktoday.com` as the canonical absolute website URL.
- Preserve valid operational email addresses even when their local part contains `perkup`.
- Preserve admin and auditor login email addresses, Supabase project references, provider identifiers, secrets, and other external account identities.

## Repository Changes

### Customer-Facing Brand Copy

Replace legacy product-name references in:

- React pages and shared components
- SEO metadata and generated static SEO pages
- the HTML application shell
- PWA manifest, update prompts, and offline page
- email templates and email-sender copy
- invoice and receipt PDF metadata, filenames, headings, and explanatory text
- legal pages and data-deletion instructions
- QR instructions, downloaded QR artwork, validation messages, and loyalty-card defaults
- maintenance, access-control, subscription, feedback, and administrator messages
- documentation that describes the current product

Operational email addresses remain unchanged. Copy surrounding those addresses uses the Perk product name.

### Internal Development Identifiers

Rename legacy `perkup` identifiers to `perk`, including:

- browser local-storage and session-storage keys
- IndexedDB names
- service-worker cache names and cache-cleanup prefixes
- PWA update events
- QR token prefixes and QR parsing logic
- promotion claim prefixes
- offline scan queues
- reserved username entries
- Supabase auth client storage keys
- generated document filenames
- code comments that describe the current product

Because the product is still in development, the application will not retain fallback readers for old keys or QR prefixes. Existing development sessions, offline queues, cached scans, and previously generated QR codes may stop working and should be regenerated.

### Static Asset Names

Rename brand asset filenames from `perkup-*` to `perk-*`, including wordmarks and the logo source image. Update every application, email, PDF, SEO, offline-page, and generated-page reference to the new paths. The image contents and visual design do not change.

Historical migration filenames containing `perkup` will be renamed locally because this development project treats the repository migration set as editable. Numeric migration versions and SQL behavior remain unchanged.

## Supabase Changes

The connected project is `fstwqgnonsqcqewiipqq`.

The live public schema currently has no table, view, function, index, or policy whose name contains `perkup`. No schema-object rename is required.

Stored website content contains legacy brand copy in:

- `public.settings` row `homepage`: one legacy mention, currently the configured operational email address
- `public.settings` row `legal-pages`: eighteen legacy product-name mentions

The homepage operational email address remains unchanged. A new migration will replace product-name references in stored legal-page content without altering unrelated text or account addresses.

Affected local Edge Function sources will receive the same source-aware rename. After local verification, only functions whose source changed will be redeployed with their existing JWT-verification configuration preserved.

## Consistency Guard

Add an automated repository scan that fails when legacy `PerkUp` or `perkup` references are introduced outside an explicit allowlist. Every allowlist entry must name one exact operational identity and explain why code changes cannot rename it. The configured `perkup.shop@youthserviceph.org` address is the initial allowlisted identity.

The check will scan application code, static assets, scripts, Supabase functions and migrations, configuration, and current product documentation. Generated build output, dependency directories, this before-and-after design specification, and its implementation plan are excluded.

## Verification

Verification must include:

1. Run the new brand-consistency check and confirm only approved operational identities remain.
2. Run the repository’s existing TypeScript check and automated tests.
3. Run a production build, including SEO and service-worker generation.
4. Search generated output for `PerkUp`, legacy `perkup` identifiers, broken old asset paths, and noncanonical website URLs.
5. Verify renamed static assets resolve in both themes and in the offline page, generated emails, and PDF generation.
6. Apply the stored-content migration to the connected development Supabase project.
7. Redeploy only changed Edge Functions and preserve their current authentication settings.
8. Query the live settings rows and affected function versions to confirm the deployed backend uses Perk copy while retaining valid operational emails.

## Expected Development Impact

The rename intentionally invalidates legacy development-only browser state and QR tokens. Developers and test users may need to clear site data, sign in again, and regenerate QR codes. No production-user migration or compatibility layer is included.

## Out of Scope

- Changing the `perktoday.com` domain
- Creating or renaming email mailboxes
- Changing administrator or auditor account email addresses
- Changing the Supabase project reference
- Redesigning the logo or wordmark
- Refactoring unrelated application behavior
