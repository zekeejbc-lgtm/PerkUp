import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAudit from "./AdminAudit";

const mocks = vi.hoisted(() => ({
  role: { current: "admin" },
  invokeAdminBackend: vi.fn(),
  toast: { error: vi.fn() },
  downloadAuditReportPdf: vi.fn(),
}));

vi.mock("../../lib/adminBackend", () => ({
  invokeAdminBackend: mocks.invokeAdminBackend,
}));

vi.mock("../../lib/auditReportPdf", () => ({
  downloadAuditReportPdf: mocks.downloadAuditReportPdf,
}));

vi.mock("../../components/ToastProvider", () => ({
  useToast: () => mocks.toast,
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
  if (body.action === "get_audit_overview") {
    return Promise.resolve({
      financial: {
        grossCentavos: 250000,
        feeCentavos: 7500,
        netCentavos: 242500,
        paidTransactions: 4,
        issuedInvoices: 6,
        outstandingInvoices: 2,
        failedInvoices: 0,
      },
      receipts: { total: 4, sent: 4, failed: 0 },
      generatedAt: "2026-07-29T08:00:00.000Z",
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
    expect(screen.queryByRole("button", { name: /download pdf/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /money & transactions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Sensitive metadata, financial views/i)).toBeInTheDocument();

    await waitFor(() => expect(mocks.invokeAdminBackend).toHaveBeenCalledWith(expect.objectContaining({
      action: "list_activity_logs",
      outcome: "all",
      source: "all",
      actorRole: "all",
      entityType: "all",
      storeId: "all",
    })));
    await waitFor(() => expect(screen.queryByText("No matching log records")).not.toBeInTheDocument());
    expect(await screen.findByText("Update Stores", {}, { timeout: 3_000 })).toBeInTheDocument();
  });

  it("opens auditors on the money view and exports a PDF even without records", async () => {
    mocks.role.current = "auditor";
    mocks.invokeAdminBackend.mockImplementation((body: Record<string, unknown>) => {
      if (body.action === "list_audit_records" && body.pageSize === 100) {
        return Promise.resolve({
          total: 101,
          records: body.page === 1
            ? [{ id: "invoice-1", status: "paid", amount_centavos: 10000, created_at: "2026-08-01T16:10:00.000Z" }]
            : [{ id: "invoice-101", status: "paid", amount_centavos: 20000, created_at: "2026-08-01T16:20:00.000Z" }],
        });
      }
      return backendResponse(body);
    });
    render(<AdminAudit />);

    expect(await screen.findByText("Full auditor access")).toBeInTheDocument();
    expect(screen.getByText("Gross revenue")).toBeInTheDocument();
    expect(screen.getByText("PHP 2500.00")).toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: /download pdf/i });
    expect(exportButton).toBeEnabled();
    expect(screen.getByRole("button", { name: /money & transactions/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /system health/i })).not.toBeInTheDocument();
    const filterButton = screen.getByRole("button", { name: /search & filters/i });
    expect(filterButton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(filterButton);
    expect(filterButton).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("audit-log-filters")?.firstElementChild).toHaveClass("overflow-visible");

    fireEvent.click(exportButton);
    await waitFor(() => expect(mocks.invokeAdminBackend).toHaveBeenCalledWith(expect.objectContaining({
      action: "list_audit_records",
      page: 2,
      pageSize: 100,
    })));
    await waitFor(() => expect(mocks.downloadAuditReportPdf).toHaveBeenCalledWith(expect.objectContaining({
      title: "Money & Transactions",
      rows: expect.arrayContaining([
        expect.arrayContaining([expect.stringContaining("PHP 100.00")]),
        expect.arrayContaining([expect.stringContaining("PHP 200.00")]),
      ]),
    })));
  });
});
