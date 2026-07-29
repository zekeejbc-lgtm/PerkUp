import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAudit from "./AdminAudit";

const mocks = vi.hoisted(() => ({
  role: { current: "admin" },
  invokeAdminBackend: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../lib/adminBackend", () => ({
  invokeAdminBackend: mocks.invokeAdminBackend,
}));

vi.mock("../../components/ToastProvider", () => ({
  useToast: () => ({ error: mocks.error }),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", role: mocks.role.current } }),
}));

vi.mock("../../contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatCurrency: (amount: number) => `PHP ${amount.toFixed(2)}` }),
}));

const backendResponse = (body: Record<string, unknown>) => {
  if (body.action === "get_activity_log_overview") {
    return Promise.resolve({
      total: 18,
      last24Hours: 4,
      shopChanges: 9,
      privilegedChanges: 3,
      issues: 1,
      generatedAt: "2026-07-29T08:00:00.000Z",
    });
  }
  if (body.action === "list_log_stores") {
    return Promise.resolve({ stores: [{ id: "shop-1", publicId: "STR-ABC12345", name: "North Shop" }] });
  }
  if (body.action === "list_activity_logs") {
    return Promise.resolve({
      total: 1,
      records: [{
        id: "event-1",
        action: "update_stores",
        entity_type: "stores",
        entity_id: "shop-1",
        actor_role: "admin",
        outcome: "success",
        source: "database",
        store_name: "North Shop",
        store_public_id: "STR-ABC12345",
        created_at: "2026-07-29T07:00:00.000Z",
        metadata: { changedFields: ["data"], dataChangedFields: ["businessName"] },
      }],
    });
  }
  return Promise.resolve({ records: [], total: 0 });
};

describe("AdminAudit logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.current = "admin";
    mocks.invokeAdminBackend.mockImplementation(backendResponse);
  });

  it("gives administrators the redacted, read-only activity view", async () => {
    render(<AdminAudit />);

    expect(await screen.findByRole("heading", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByText("Administrator view · read only")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /export visible/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /money & transactions/i })).not.toBeInTheDocument();
    expect(await screen.findByText("Update Stores")).toBeInTheDocument();
    expect(screen.getByText(/Sensitive metadata, financial audit views/i)).toBeInTheDocument();

    await waitFor(() => expect(mocks.invokeAdminBackend).toHaveBeenCalledWith(expect.objectContaining({
      action: "list_activity_logs",
      outcome: "all",
      source: "all",
      actorRole: "all",
      entityType: "all",
      storeId: "all",
    })));
  });

  it("gives auditors full audit sections and export access", async () => {
    mocks.role.current = "auditor";
    render(<AdminAudit />);

    expect(await screen.findByText("Full auditor access")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export visible/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /money & transactions/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /system health/i })).toBeInTheDocument();
  });
});
