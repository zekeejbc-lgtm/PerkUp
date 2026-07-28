import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/src/lib/dataCompat", () => ({
  doc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({
    exists: () => false,
    data: () => ({}),
  }),
}));

vi.mock("../lib/backend", () => ({ db: {} }));
vi.mock("../lib/partnerApplication", () => ({
  submitPartnerApplication: vi.fn(),
}));
vi.mock("./MapBaseLayers", () => ({ MapBaseLayers: () => null }));
vi.mock("./ImageCropEditor", () => ({ ImageCropEditor: () => null }));
vi.mock("../contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => String(value) }),
}));
vi.mock("./CategoryInput", () => ({
  CategoryInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
vi.mock("../lib/storeDirectory", () => ({ FEATURED_STORE_CATEGORIES: [] }));
vi.mock("leaflet", () => ({
  default: {
    Icon: {
      Default: {
        prototype: {},
        mergeOptions: vi.fn(),
      },
    },
  },
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Marker: () => null,
  useMap: () => ({ flyTo: vi.fn(), getZoom: () => 13 }),
  useMapEvents: vi.fn(),
}));

import { PartnerApplicationModal } from "./PartnerApplicationModal";

describe("PartnerApplicationModal location search", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("does not call the geocoder while the applicant types", async () => {
    vi.useFakeTimers();
    render(<PartnerApplicationModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tagum" } });
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  test("calls the geocoder once when the applicant presses Enter", async () => {
    vi.useFakeTimers();
    render(<PartnerApplicationModal isOpen onClose={vi.fn()} />);
    const addressInput = screen.getByRole("combobox");

    fireEvent.change(addressInput, { target: { value: "Tagum" } });
    fireEvent.keyDown(addressInput, { key: "Enter", code: "Enter" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "https://nominatim.openstreetmap.org/search?q=Tagum&format=jsonv2&addressdetails=1&limit=5",
      expect.objectContaining({
        headers: { Accept: "application/json" },
      }),
    );
  });

  test("calls the geocoder once when the applicant clicks Search", async () => {
    render(<PartnerApplicationModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Tagum" } });
    fireEvent.click(screen.getByRole("button", { name: "Search address" }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("cancels an in-flight lookup when the applicant edits the address", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    render(<PartnerApplicationModal isOpen onClose={vi.fn()} />);
    const addressInput = screen.getByRole("combobox");

    fireEvent.change(addressInput, { target: { value: "Tagum" } });
    fireEvent.click(screen.getByRole("button", { name: "Search address" }));
    await act(async () => {
      await Promise.resolve();
    });

    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    fireEvent.change(addressInput, { target: { value: "Tagu" } });

    expect(request?.signal?.aborted).toBe(true);
  });
});
