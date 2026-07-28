# Acknowledgement Receipt Copy Design

## Goal

Paid subscription documents must be titled `ACKNOWLEDGEMENT RECEIPT` and state `Official Receipt will be provided upon request.`

## Scope

- Update the paid-document title in the in-app jsPDF renderer.
- Update the paid-document title in the Google Apps Script email attachment renderer.
- Add the official-receipt notice to the receipt footer in both renderers.
- Keep invoice wording, receipt filenames, download controls, email subjects, and other application copy unchanged.
- Keep the compact receipt-number metadata label unchanged as `RECEIPT #`.

## Approach

Three options were considered:

1. Update only the in-app renderer. This would leave emailed documents inconsistent.
2. Update every receipt reference throughout the application. This would exceed the requested document-label scope.
3. Update the two paid-document renderers only. This keeps downloaded and emailed documents consistent without renaming unrelated controls or workflows.

Option 3 is selected.

## Rendering Rules

For receipt documents:

- The main heading is `ACKNOWLEDGEMENT RECEIPT`.
- The footer identifies the document as a system-generated acknowledgement receipt.
- The footer includes the exact sentence `Official Receipt will be provided upon request.`

For invoice documents, existing headings and disclaimers remain unchanged.

## Verification

The change is human-facing copy rather than program logic, so it does not justify a source-text assertion test. Verification consists of TypeScript compilation, a production build, and review of the focused diff to confirm both renderers use the exact approved wording without altering invoice behavior or receipt filenames.
