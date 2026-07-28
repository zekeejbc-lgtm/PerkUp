import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscriptionPlans } = vi.hoisted(() => ({
  subscriptionPlans: [
    { id: "standard", name: "Standard", price: 99, interval: "month", features: [] },
    { id: "premium", name: "Premium", price: 199, interval: "month", features: [] },
    { id: "enterprise", name: "Enterprise", price: 499, interval: "month", features: [] },
  ],
}));

vi.mock("@/src/lib/dataCompat", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ plans: subscriptionPlans }),
  })),
}));
vi.mock("../lib/backend", () => ({ db: {} }));
vi.mock("../lib/partnerApplication", () => ({
  checkPartnerApplicationAvailability: vi.fn(async () => ({
    emailAvailable: true,
    phoneAvailable: true,
  })),
  submitPartnerApplication: vi.fn(),
}));
vi.mock("./MapBaseLayers", () => ({ MapBaseLayers: () => null }));
vi.mock("./ImageCropEditor", () => ({ ImageCropEditor: () => null }));
vi.mock("../contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => `PHP ${value}` }),
}));
vi.mock("./CategoryInput", () => ({
  CategoryInput: ({
    onChange,
    ...props
  }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
    onChange: (value: string) => void;
  }) => <input {...props} onChange={(event) => onChange(event.target.value)} />,
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

afterEach(() => cleanup());

describe("PartnerApplicationModal preferred plan", () => {
  it("preselects and labels the last legacy plan", async () => {
    render(<PartnerApplicationModal isOpen onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. My Coffee Shop"), {
      target: { value: "Test Shop" },
    });
    fireEvent.change(screen.getByPlaceholderText("Coffee, Bakery, Retail..."), {
      target: { value: "Coffee" },
    });
    fireEvent.change(screen.getByPlaceholderText("John Doe"), {
      target: { value: "Test Owner" },
    });
    fireEvent.change(screen.getByPlaceholderText("hello@example.com"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("912 345 6789"), {
      target: { value: "9123456789" },
    });
    fireEvent.change(screen.getByPlaceholderText("We run a small bakery..."), {
      target: { value: "A neighborhood coffee shop." },
    });
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Tagum City" },
    });
    fireEvent.click(screen.getByRole("button", { name: /next step/i }));

    await waitFor(() => {
      expect(screen.queryByText("Enterprise")).not.toBeNull();
    });

    const enterpriseCard = screen.getByRole("button", { name: /Enterprise/i });
    expect(enterpriseCard.getAttribute("aria-pressed")).toBe("true");
    expect(enterpriseCard.textContent).toContain("Preferred");
  });
});
