import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscriptionPlans } = vi.hoisted(() => ({
  subscriptionPlans: [
    { id: "standard", name: "Standard", price: 99, interval: "month", features: [] },
    { id: "premium", name: "Premium", price: 199, interval: "month", features: [] },
    { id: "enterprise", name: "Enterprise", price: 499, interval: "month", features: [] },
  ],
}));

vi.mock("../lib/dataCompat", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(async () => ({
    exists: () => true,
    data: () => ({ plans: subscriptionPlans }),
  })),
}));
vi.mock("../lib/backend", () => ({ db: {} }));
vi.mock("../contexts/CurrencyContext", () => ({
  useCurrency: () => ({ formatCurrency: (value: number) => `PHP ${value}` }),
}));
vi.mock("../components/PublicPageShell", () => ({
  PublicPageShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("react-router-dom", () => ({
  Link: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a {...props}>{children}</a>
  ),
  useLocation: () => ({ pathname: "/pricing" }),
}));

import { PricingPage } from "./MarketingPage";

afterEach(() => cleanup());

describe("PricingPage preferred plan", () => {
  it("labels the last legacy plan as preferred", async () => {
    render(<PricingPage />);

    await waitFor(() => {
      expect(screen.queryByText("Enterprise")).not.toBeNull();
    });

    const enterpriseCard = screen.getByText("Enterprise").closest("section");
    expect(enterpriseCard?.textContent).toContain("Preferred");
    expect(screen.getAllByText("Preferred")).toHaveLength(1);
  });
});
