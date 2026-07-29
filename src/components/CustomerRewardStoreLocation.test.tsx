import React from "react";
import { render, screen } from "@testing-library/react";
import { test, vi } from "vitest";

vi.mock("./MapBaseLayers", () => ({ MapBaseLayers: () => null }));
vi.mock("./CustomerStoreMapPin", () => ({ createCustomerStoreMapPin: () => ({}) }));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="store-map">{children}</div>,
  Marker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CustomerRewardStoreLocation } from "./CustomerRewardStoreLocation";

test("shows an address navigation action when map coordinates are unavailable", () => {
  render(<CustomerRewardStoreLocation store={{ name: "Coffee House", address: "Tagum City" }} />);

  screen.getByRole("heading", { name: "Store location" });
  screen.getByText("Tagum City");
  screen.getByRole("button", { name: "Navigate" });
  screen.getByText("Map coordinates are unavailable for this store.");
  assertNoStoreMap();
});

test("shows the existing map treatment for valid store coordinates", () => {
  render(
    <CustomerRewardStoreLocation
      store={{ id: "store-1", name: "Coffee House", address: "Tagum City", lat: 7.44, lng: 125.8 }}
    />,
  );

  screen.getByTestId("store-map");
  screen.getByRole("button", { name: "Navigate" });
  screen.getAllByText("Coffee House");
});

function assertNoStoreMap() {
  if (screen.queryByTestId("store-map")) throw new Error("The map must not render without valid coordinates.");
}
