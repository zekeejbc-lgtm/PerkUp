# Receipt Heading Size Design

## Goal

Reduce the visual size of the long `ACKNOWLEDGEMENT RECEIPT` heading in generated billing PDFs without changing the invoice heading or any other document content.

## Design

The shared PDF renderer will select the header font size from the document kind:

- receipt: 16pt
- invoice: 26pt

The title text, right alignment, document number, spacing, and all remaining receipt and invoice styles remain unchanged.

## Verification

Add a focused source-level regression test that confirms the renderer uses the smaller receipt-specific title size while retaining the existing invoice size. Run the focused test, TypeScript checks, and production build.
