# Partner Application Category Wiring

## Problem

Stores created through the public partner-application approval flow are shown as
`Uncategorized` in the admin Partner Registry. The registry already reads the
store's `category` field correctly. The application flow does not collect,
persist, review, or forward that field when creating the approved store.

## Design

Add one required `category` string to the existing application data flow:

1. The Partner Application modal asks for a business category alongside the
   business name. It uses the existing category input and featured category
   suggestions while still allowing a custom value.
2. `submitPartnerApplication` includes `category` in its typed request.
3. The `partner-application` Edge Function trims and validates the category,
   requires it with the other required fields, and stores it in the application
   record.
4. Admin application search and application details include the category.
5. Opening Process Setup copies the application category into the setup state.
   The setup modal keeps it editable so an admin can correct it before approval.
6. The approval request passes the resulting category to `create_store`, along
   with the application description and other existing store defaults.
7. The created store persists `category`, so the existing Partner Registry,
   store directory, and customer-facing category views display it without
   fallback text.

## Compatibility

Older pending applications may not have a category. When an admin processes one,
the setup form starts empty and requires the admin to choose or enter a category
before creating the store. Existing stores are not modified automatically.

## Validation and Error Handling

- The browser requires a non-empty category.
- The public Edge Function trims the value, limits it to 120 characters, and
  rejects a submission when it is empty.
- The admin setup form also requires a category, covering legacy applications.
- Custom categories remain supported; comma-separated categories follow the
  existing store-category convention.

## Testing

- Add a focused unit test for the application-to-store default mapping. It must
  fail if category, description, location, coordinates, logo, or business links
  are dropped.
- Run the focused regression test before and after implementation.
- Run the TypeScript check and production build after the fix.

## Scope

This change fixes newly submitted and newly approved applications. It does not
guess categories for existing stores because inference from names or
descriptions could assign incorrect business categories.
