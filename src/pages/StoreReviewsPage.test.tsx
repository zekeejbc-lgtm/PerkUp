import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StoreReviewsPage from "./StoreReviewsPage";

const getDoc = vi.fn();
const getDocs = vi.fn();

vi.mock("@/src/lib/dataCompat", () => ({
  collection: vi.fn((_db, name) => ({ name })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDoc: (...args: unknown[]) => getDoc(...args),
  getDocs: (...args: unknown[]) => getDocs(...args),
  query: vi.fn((collectionRef) => collectionRef),
  where: vi.fn(),
}));

vi.mock("../lib/backend", () => ({ db: {} }));
vi.mock("../components/Seo", () => ({ Seo: () => null }));
vi.mock("../components/PublicPageShell", () => ({ PublicSiteFooter: () => null }));
vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("../components/BrandMark", () => ({ BrandMark: () => <span>Perk</span> }));

const snapshot = (id: string, data: Record<string, unknown>) => ({
  id,
  exists: () => true,
  data: () => data,
});

describe("StoreReviewsPage", () => {
  beforeEach(() => {
    getDoc.mockResolvedValue(snapshot("store-1", { name: "Perk Cafe", status: "active" }));
    getDocs.mockResolvedValue({
      docs: [
        snapshot("older", { customerName: "Older Customer", rating: 3, comment: "Older", createdAt: "2026-07-01T00:00:00.000Z" }),
        snapshot("hidden", { customerName: "Hidden Customer", rating: 1, comment: "Hidden", hidden: true, createdAt: "2026-07-30T00:00:00.000Z" }),
        snapshot("newer", { customerName: "Newer Customer", rating: 5, comment: "Newer", createdAt: "2026-07-29T00:00:00.000Z" }),
      ],
    });
  });

  it("shows every public review newest-first and excludes hidden reviews from its summary", async () => {
    render(
      <MemoryRouter initialEntries={["/store/store-1/reviews"]}>
        <Routes><Route path="/store/:storeId/reviews" element={<StoreReviewsPage />} /></Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Customer Reviews" })).toBeInTheDocument();
    expect(screen.getByText(/4.0 out of 5 · 2 reviews/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden Customer")).not.toBeInTheDocument();
    const grid = screen.getByTestId("all-reviews-grid");
    const names = within(grid).getAllByRole("button", { name: /open full review/i }).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["Open full review from Newer Customer", "Open full review from Older Customer"]);
    expect(screen.getByRole("link", { name: /back to perk cafe/i })).toHaveAttribute("href", "/store/store-1");
  });
});
