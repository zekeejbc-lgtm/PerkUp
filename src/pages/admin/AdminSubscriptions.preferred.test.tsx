import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const subscriptionPlans = [
  { id: "standard", name: "Standard", price: 99, interval: "month", features: [] },
  { id: "premium", name: "Premium", price: 199, interval: "month", features: [] },
  { id: "enterprise", name: "Enterprise", price: 499, interval: "month", features: [] },
];

vi.mock("@/src/lib/dataCompat", () => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn((_db, ...segments) => segments.join("/")),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ plans: subscriptionPlans }),
  })),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock("../../lib/backend", () => ({ db: {} }));
vi.mock("../../lib/adminBackend", () => ({ invokeAdminBackend: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "admin-user",
      email: "admin@perk.test",
      name: "Admin",
      role: "admin",
    },
  }),
}));

import AdminSubscriptions from "./AdminSubscriptions";

afterEach(() => cleanup());

describe("AdminSubscriptions preferred plan control", () => {
  it("uses a single-choice control and selects the last legacy plan by default", async () => {
    render(<AdminSubscriptions />);

    await waitFor(() => {
      expect(screen.queryByText("Subscription Offers")).not.toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: /edit offers/i }));

    const controls = screen.getAllByRole("radio", { name: /preferred plan/i });
    expect(controls).toHaveLength(3);
    expect(controls.map((control) => control.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
    ]);

    fireEvent.click(controls[0]);

    expect(
      screen
        .getAllByRole("radio", { name: /preferred plan/i })
        .map((control) => control.getAttribute("aria-checked")),
    ).toEqual(["true", "false", "false"]);
  });
});
