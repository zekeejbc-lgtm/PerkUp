import assert from "node:assert/strict";
import { test } from "vitest";
import { getLandingMapInteractionOptions } from "./landingMapInteractions.ts";

test("uses cooperative touch gestures on coarse-pointer devices", () => {
  assert.deepEqual(getLandingMapInteractionOptions(true), {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: false,
  });
});

test("keeps mouse dragging available on fine-pointer devices", () => {
  assert.deepEqual(getLandingMapInteractionOptions(false), {
    touchZoom: true,
    scrollWheelZoom: false,
    dragging: true,
  });
});
