# Shared-Location Map Pin Design

## Goal

Replace the malformed overlapping shared-location marker with a polished, legible count pin.

## Root Cause

The current group marker deliberately adds a second white circle behind the black count circle. Its negative offset, oval dimensions, and negative stacking order expose a large white crescent, making the marker look misaligned and partially broken.

## Design

Shared-location groups will use a single SVG teardrop marker. The black body and pointer will be one continuous path, surrounded by a crisp white stroke and a restrained shadow. The store count will remain centered in bold white type and scale down for counts with more digits.

Single-store logo and generic store markers will retain their existing presentation. Marker anchoring and popup placement will remain aligned with the geographical point.

## Scope

- Change only the shared-location visual produced by `CustomerStoreMapPin`.
- Preserve grouping, count calculation, click behavior, popups, and map interaction.
- Add no dependencies.

## Verification

- Add a regression test against the generated Leaflet icon markup to prove the group pin renders one SVG body and no offset stacked circle.
- Run all existing Node tests, the TypeScript check, and the production build.

