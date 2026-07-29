import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminSubscriptions from "./AdminSubscriptions";

const mocks = vi.hoisted(() => ({
  role: { current: "admin" },
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  invokeAdminBackend: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      id: "admin-user",
      email: "admin@perk.test",
      name: "Admin",
      role: mocks.role.current,
    },
  }),
}));

vi.mock("../../lib/backend", () => ({ db: {} }));

vi.mock("@/src/lib/dataCompat", () => ({
  collection: vi.fn((_db, path) => ({ path })),
  deleteField: vi.fn(() => ({ __delete: true })),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  getDoc: mocks.getDoc,
  getDocs: mocks.getDocs,
  setDoc: mocks.setDoc,
  serverTimestamp: vi.fn(() => "server-time"),
  updateDoc: mocks.updateDoc,
}));

vi.mock("../../lib/adminBackend", () => ({
  invokeAdminBackend: mocks.invokeAdminBackend,
}));

const catalog = [
  {
    id: "enterprise",
    name: "Enterprise",
    price: 2999,
    interval: "month",
    tierRank: 30,
    features: ["Enterprise"],
    dependencies: { customerLimit: 0, staffLimit: 0, branchLimit: 0, galleryPhotoLimit: 10 },
  },
  {
    id: "testing",
    name: "Testing Plan",
    price: 1,
    interval: "month",
    tierRank: 0,
    features: ["Testing"],
    dependencies: { customerLimit: 10, staffLimit: 1, branchLimit: 1, galleryPhotoLimit: 3 },
  },
  {
    id: "standard",
    name: "Standard",
    price: 999,
    interval: "month",
    tierRank: 10,
    features: ["Standard"],
    dependencies: { customerLimit: 1000, staffLimit: 2, branchLimit: 1, galleryPhotoLimit: 3 },
  },
];

describe("AdminSubscriptions tier hierarchy", () => {
  beforeEach(() => {
    mocks.role.current = "admin";
    mocks.getDoc.mockReset().mockResolvedValue({
      exists: () => true,
      data: () => ({ plans: catalog }),
    });
    mocks.getDocs.mockReset().mockResolvedValue({
      docs: [
        {
          id: "store-1",
          data: () => ({
            isPrimaryBranch: true,
            subscriptionLevel: "Testing Plan",
            owedAmount: 1,
          }),
        },
        {
          id: "branch-1",
          data: () => ({
            isPrimaryBranch: false,
            subscriptionLevel: "Testing Plan",
          }),
        },
      ],
    });
    mocks.setDoc.mockReset().mockResolvedValue(undefined);
    mocks.updateDoc.mockReset().mockResolvedValue(undefined);
    mocks.invokeAdminBackend.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("shows administrators the declared hierarchy and movement controls", async () => {
    const user = userEvent.setup();
    render(<AdminSubscriptions />);

    expect(await screen.findByText("Tier hierarchy")).toBeInTheDocument();
    expect(screen.getByText("Lowest tier")).toBeInTheDocument();
    expect(screen.getByText("Highest tier")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Offers" }));

    expect(screen.getByRole("button", { name: "Move Testing Plan higher" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Standard lower" })).toBeInTheDocument();
  });

  it("lets an auditor edit and save subscription offers", async () => {
    mocks.role.current = "auditor";
    const user = userEvent.setup();
    render(<AdminSubscriptions />);

    await user.click(await screen.findByRole("button", { name: "Edit Offers" }));
    expect(screen.getByRole("button", { name: "Move Testing Plan higher" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await user.click(await screen.findByRole("button", { name: "Save hierarchy" }));

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
    expect(screen.queryByText(/auditor access is read-only/i)).not.toBeInTheDocument();
  });

  it("lets an auditor initialize a missing subscription catalog", async () => {
    mocks.role.current = "auditor";
    mocks.getDoc.mockResolvedValue({
      exists: () => false,
      data: () => ({}),
    });

    render(<AdminSubscriptions />);

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
    expect(await screen.findByRole("button", { name: "Edit Offers" })).toBeInTheDocument();
  });

  it("keeps non-administrative roles read-only", async () => {
    mocks.role.current = "customer";
    render(<AdminSubscriptions />);

    expect(await screen.findByText(/read-only hierarchy review/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Offers" })).not.toBeInTheDocument();
  });

  it("requires impact confirmation before persisting explicit ranks", async () => {
    const user = userEvent.setup();
    render(<AdminSubscriptions />);

    await user.click(await screen.findByRole("button", { name: "Edit Offers" }));
    await user.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Confirm subscription hierarchy");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1 existing primary subscription");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "Testing Plan (tier 0) → Standard (tier 10) → Enterprise (tier 30)",
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save hierarchy" }));

    await waitFor(() => expect(mocks.setDoc).toHaveBeenCalled());
    const settingsWrite = mocks.setDoc.mock.calls.find((call) => call[0]?.path === "settings");
    expect(settingsWrite?.[1].plans.map((plan: { id: string; tierRank: number }) => ({
      id: plan.id,
      tierRank: plan.tierRank,
    }))).toEqual([
      { id: "testing", tierRank: 0 },
      { id: "standard", tierRank: 10 },
      { id: "enterprise", tierRank: 30 },
    ]);
  });
});
