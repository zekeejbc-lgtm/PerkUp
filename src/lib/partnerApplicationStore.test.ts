import assert from "node:assert/strict";
import { test } from "vitest";
import { getPartnerApplicationStoreDefaults } from "./partnerApplicationStore.ts";

test("carries the application category into the approved store defaults", () => {
  assert.deepEqual(
    getPartnerApplicationStoreDefaults({
      businessName: "My Coffee Shop",
      category: "Coffee",
      description: "Neighborhood coffee and pastries.",
      address: "Tagum City",
      coordinates: [7.4478, 125.8078],
      logoUrl: "https://example.com/logo.png",
      businessWebsiteUrl: "https://example.com",
      businessFacebookUrl: "https://facebook.com/example",
    }),
    {
      name: "My Coffee Shop",
      businessName: "My Coffee Shop",
      category: "Coffee",
      description: "Neighborhood coffee and pastries.",
      location: "Tagum City",
      address: "Tagum City",
      lat: 7.4478,
      lng: 125.8078,
      logoUrl: "https://example.com/logo.png",
      website: "https://example.com",
      businessFacebookUrl: "https://facebook.com/example",
    },
  );
});

test("uses admin setup overrides for legacy applications", () => {
  const result = getPartnerApplicationStoreDefaults(
    {
      businessName: "Legacy Shop",
      description: "Imported application",
      address: "Old address",
    },
    {
      name: "Legacy Shop Main",
      category: "Retail",
      address: "New address",
      coordinates: [7.5, 125.8],
      logoUrl: "https://example.com/new-logo.png",
    },
  );

  assert.equal(result.name, "Legacy Shop Main");
  assert.equal(result.businessName, "Legacy Shop Main");
  assert.equal(result.category, "Retail");
  assert.equal(result.address, "New address");
  assert.equal(result.location, "New address");
  assert.equal(result.lat, 7.5);
  assert.equal(result.lng, 125.8);
  assert.equal(result.logoUrl, "https://example.com/new-logo.png");
});
