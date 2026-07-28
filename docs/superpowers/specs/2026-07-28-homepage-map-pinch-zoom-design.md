# Homepage Map Pinch-Zoom Design

## Goal

Allow touch users to zoom the homepage store map with a two-finger pinch while preserving normal one-finger page scrolling.

## Design

The homepage map will explicitly pass `touchZoom: true` to Leaflet through `MapContainer`. Mouse-wheel zoom remains disabled. On coarse-pointer devices such as phones and tablets, one-finger map dragging will be disabled so Leaflet exposes browser page panning while retaining its two-finger touch-zoom handler. Fine-pointer devices retain mouse dragging.

The interaction options will live in a small typed module consumed by `LandingStoreMap`. A focused Node test will verify the application-level Leaflet options for both coarse- and fine-pointer devices.

## Scope

- Change only the homepage store map.
- Do not change the customer dashboard, store detail maps, location pickers, or desktop wheel behavior.
- Add no dependencies.

## Verification

- Run the focused interaction-options test.
- Run the TypeScript check.
- Run the production build.
