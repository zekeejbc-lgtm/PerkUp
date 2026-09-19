import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoreOwnerCustomerTransactions from "./StoreOwnerCustomerTransactions";

const { query } = vi.hoisted(() => ({ query: {
  select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(),
} }));
vi.mock("../../lib/supabase", () => ({ supabase: { from: () => query } }));
const customer = { customerId: "customer-1", name: "Alex" };
const row = (id: string, date: string, reference: string) => ({
  id, created_at: date, data: { points: 1, posReferenceNumber: reference, isSimulatedDemoScan: true },
});

beforeEach(() => {
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.range.mockReset().mockResolvedValue({ data: [], error: null });
});

describe("customer transaction history", () => {
  it("opens recorded transaction details and restores focus when dismissed", async () => {
    query.range.mockResolvedValueOnce({ data: [{
      id: "scan-details", public_id: "TKT-123", created_at: "2026-09-19T09:45:41Z",
      data: { points: 1, staffId: "staff-123", staffName: "Jamie Rivera", customerId: "customer-1",
        storeId: "store-1", storeName: "Matcha Bar", promotionId: "promo-1", promotionTitle: "Matcha reward",
        issuedAt: "2026-09-19T09:45:41Z", status: "issued", posReferenceNumber: "POS-123",
        isSimulatedDemoScan: true, scannerLocation: { lat: 7.4478, lng: 125.8078 } },
    }], error: null });
    render(<StoreOwnerCustomerTransactions storeId="store-1" customer={customer} onBack={() => {}} />);
    const trigger = await screen.findByRole("button", { name: /Earned stamp: Matcha reward/ });
    trigger.focus();
    fireEvent.click(trigger);
    const panel = within(screen.getByRole("dialog", { name: "Transaction details" }));
    for (const value of ["Jamie Rivera", "staff-123", "TKT-123", "Matcha Bar", "POS-123", "issued", "7.447800, 125.807800", "Demo simulation"]) {
      expect(panel.getByText(value)).toBeInTheDocument();
    }
    expect(panel.getByText("Scanned at").nextElementSibling?.textContent).toBe(new Date("2026-09-19T09:45:41Z").toLocaleString(undefined, { dateStyle: "full", timeStyle: "long" }));
    expect(panel.getByRole("button", { name: "Close transaction details" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close transaction details" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("labels missing scanner information honestly for older records", async () => {
    query.range.mockResolvedValueOnce({ data: [row("legacy", "2026-09-19T12:00:00Z", "OLD")], error: null });
    render(<StoreOwnerCustomerTransactions storeId="store-1" customer={customer} onBack={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: /Earned points/ }));
    const panel = within(screen.getByRole("dialog"));
    expect(panel.getByText("Scanned by").nextElementSibling).toHaveTextContent("Not recorded");
    expect(panel.getByText("Scanner ID").nextElementSibling).toHaveTextContent("Not recorded");
  });

  it("loads beyond the first batch, scopes to the customer and store, and searches older records", async () => {
    query.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, index) => row(`scan-${index}`, "2026-09-19T12:00:00Z", `POS-${index}`)), error: null })
      .mockResolvedValueOnce({ data: [row("old-scan", "2026-01-01T12:00:00Z", "OLDER-REF")], error: null });
    const onBack = vi.fn();
    render(<StoreOwnerCustomerTransactions storeId="store-1" customer={customer} onBack={onBack} />);
    expect(await screen.findByText("501 transactions")).toBeInTheDocument();
    expect(query.eq).toHaveBeenCalledWith("data->>storeId", "store-1");
    expect(query.eq).toHaveBeenCalledWith("data->>customerId", "customer-1");
    expect(query.range).toHaveBeenCalledWith(500, 999);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "older-ref" } });
    expect(screen.getByText("POS ref: OLDER-REF")).toBeInTheDocument();
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to customer" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("combines search with inclusive local date filters and clears empty results", async () => {
    const first = new Date(2026, 8, 19, 0, 0).toISOString();
    const last = new Date(2026, 8, 19, 23, 59, 59).toISOString();
    const next = new Date(2026, 8, 20, 0, 0).toISOString();
    query.range.mockResolvedValueOnce({ data: [row("first", first, "MATCH-1"), row("last", last, "MATCH-2"), row("next", next, "MATCH-3")], error: null });
    render(<StoreOwnerCustomerTransactions storeId="store-1" customer={customer} onBack={() => {}} />);
    await screen.findByText("3 transactions");
    fireEvent.change(screen.getByRole("combobox", { name: "Time filter" }), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-19" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-19" } });
    expect(screen.getByText("2 transactions")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "match-2" } });
    expect(screen.getByText("1 transaction")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getByText("No transactions match your filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("3 transactions")).toBeInTheDocument();
  });

  it("does not present a failed load as empty history and supports retry", async () => {
    query.range.mockResolvedValueOnce({ data: null, error: new Error("Unavailable") });
    render(<StoreOwnerCustomerTransactions storeId="store-1" customer={customer} onBack={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("No transactions yet.")).toBeInTheDocument());
  });
});
