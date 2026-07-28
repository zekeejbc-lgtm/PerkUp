import assert from "node:assert/strict";
import { test } from "vitest";
import {
  getCustomerMapMarkerPresentation,
  groupCustomerMapLocations,
} from "./customerMapMarkers.ts";

type Location = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  logoUrl?: string;
};

test("groups shops whose stored coordinates resolve to the same map location", () => {
  const locations: Location[] = [
    { id: "one", name: "One", lat: 7.1234561, lng: 125.9876541 },
    { id: "two", name: "Two", lat: 7.1234564, lng: 125.9876544 },
  ];

  const groups = groupCustomerMapLocations(locations);

  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((shop) => shop.id), ["one", "two"]);
  assert.deepEqual(groups[0].position, [7.1234561, 125.9876541]);
});

test("keeps shops at meaningfully different coordinates in separate groups", () => {
  const locations: Location[] = [
    { id: "one", name: "One", lat: 7.123456, lng: 125.987654 },
    { id: "two", name: "Two", lat: 7.123458, lng: 125.987654 },
  ];

  const groups = groupCustomerMapLocations(locations);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.items[0].id), ["one", "two"]);
});

test("uses only the full shop logo presentation when one shop has a logo", () => {
  const [group] = groupCustomerMapLocations<Location>([
    { id: "one", name: "One", lat: 7.1, lng: 125.9, logoUrl: "  https://example.com/logo.png  " },
  ]);

  assert.deepEqual(getCustomerMapMarkerPresentation(group), {
    kind: "logo",
    logoUrl: "https://example.com/logo.png",
  });
});

test("uses the custom store presentation when one shop has no logo", () => {
  const [group] = groupCustomerMapLocations<Location>([
    { id: "one", name: "One", lat: 7.1, lng: 125.9, logoUrl: " " },
  ]);

  assert.deepEqual(getCustomerMapMarkerPresentation(group), { kind: "store" });
});

test("uses a count presentation instead of covering one shop logo for a shared location", () => {
  const [group] = groupCustomerMapLocations<Location>([
    { id: "one", name: "One", lat: 7.1, lng: 125.9, logoUrl: "https://example.com/one.png" },
    { id: "two", name: "Two", lat: 7.1, lng: 125.9, logoUrl: "https://example.com/two.png" },
  ]);

  assert.deepEqual(getCustomerMapMarkerPresentation(group), { kind: "group", count: 2 });
});
