import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./ToastProvider";
import { submitErrorReport } from "../lib/errorReports";

vi.mock("../lib/errorReports", () => ({
  createErrorCode: () => "ERR-TEST-CTA",
  submitErrorReport: vi.fn(),
}));

function ToastHarness() {
  const toast = useToast();
  return <>
    <button onClick={() => toast.error("Failed to update store.")}>Show error</button>
    <button onClick={() => toast.success("Reward redeemed successfully.")}>Show success</button>
  </>;
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.mocked(submitErrorReport).mockResolvedValue({
      id: "report-id",
      public_id: "ERR-PUBLIC-CTA",
      error_code: "ERR-TEST-CTA",
      created_at: new Date().toISOString(),
    });
  });

  it("shows a reportable custom error toast", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Show error" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to update store.");
    expect(screen.getByText("Error code: ERR-TEST-CTA")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send to developer" }));

    expect(submitErrorReport).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "ERR-TEST-CTA",
      message: "Failed to update store.",
    }));
    expect(await screen.findByRole("button", { name: "Sent to developer" })).toBeDisabled();
  });

  it("shows a non-reportable success toast", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><ToastHarness /></ToastProvider>);
    await user.click(screen.getByRole("button", { name: "Show success" }));

    expect(screen.getByRole("status")).toHaveTextContent("Reward redeemed successfully.");
    expect(screen.queryByRole("button", { name: "Send to developer" })).not.toBeInTheDocument();
  });
});
