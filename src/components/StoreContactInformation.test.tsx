import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StoreContactInformation } from "./StoreContactInformation";

describe("StoreContactInformation", () => {
  it("shows only the supplied branch contact details and social links", () => {
    const { rerender } = render(
      <StoreContactInformation
        contact="09170000000"
        website="https://branch-a.example"
        socialLinks={[{ url: "instagram.com/branch-a" }]}
      />,
    );

    expect(screen.getByRole("link", { name: /instagram/i })).toHaveAttribute(
      "href",
      "https://instagram.com/branch-a",
    );

    rerender(
      <StoreContactInformation
        socialLinks={[{ url: "tiktok.com/@branch-b" }]}
      />,
    );

    expect(screen.queryByText("09170000000")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /instagram/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /tiktok/i })).toHaveAttribute(
      "href",
      "https://tiktok.com/@branch-b",
    );
  });

  it("shows the empty state when legacy social links are malformed", () => {
    render(
      <StoreContactInformation
        socialLinks={[{ url: "javascript:alert(1)" }]}
      />,
    );

    expect(screen.getByText("No contact information provided.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
