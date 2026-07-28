import assert from "node:assert/strict";
import { test } from "vitest";
import { getCustomerGroupMapPinVisual } from "./CustomerGroupMapPinVisual.ts";

test("renders a shared location as one cohesive count pin", () => {
  const visual = getCustomerGroupMapPinVisual(2);

  assert.match(visual.html, /data-customer-map-pin="group"/);
  assert.equal(visual.html.match(/<path\b/g)?.length, 1);
  assert.doesNotMatch(visual.html, /inset:-5px/);
  assert.match(visual.html, />2<\/text>/);
  assert.deepEqual(visual.iconSize, [48, 56]);
  assert.deepEqual(visual.iconAnchor, [24, 55]);
});
