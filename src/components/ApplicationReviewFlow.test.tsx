// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ApplicationReviewFlow } from "./ApplicationReviewFlow";

describe("ApplicationReviewFlow", () => {
  it("shows the three stages and same-day decision expectation in order", () => {
    render(<ApplicationReviewFlow />);

    const flow = screen.getByRole("list", { name: "Application review process" });
    const stages = within(flow).getAllByRole("listitem");

    expect(stages).toHaveLength(3);
    expect(stages[0].textContent).toContain("Submitted");
    expect(stages[0].textContent).toContain("Completed");
    expect(stages[1].textContent).toContain("Under Review");
    expect(stages[1].textContent).toContain("Current");
    expect(stages[1].getAttribute("aria-current")).toBe("step");
    expect(stages[2].textContent).toContain("Decision");
    expect(stages[2].textContent).toContain("Upcoming");
    expect(
      screen.getByText("Your submission will be reviewed and decided within the day."),
    ).toBeTruthy();
  });

  it.each(["approved", "rejected"])(
    "does not show the pending flow for a %s application",
    (status) => {
      render(<ApplicationReviewFlow status={status} />);

      expect(
        screen.queryByRole("list", { name: "Application review process" }),
      ).toBeNull();
    },
  );

  it("normalizes the pending status before showing the flow", () => {
    render(<ApplicationReviewFlow status=" Pending " />);

    expect(
      screen.getByRole("list", { name: "Application review process" }),
    ).toBeTruthy();
  });
});
