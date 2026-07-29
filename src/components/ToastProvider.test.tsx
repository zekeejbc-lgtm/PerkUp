import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "./ToastProvider";
import { submitErrorReport } from "../lib/errorReports";

vi.mock("../lib/errorReports", () => ({
  createErrorCode: () => "ERR-TEST-CTA",
  submitErrorReport: vi.fn(),
}));

describe("ToastProvider legacy alert bridge", () => {
  beforeEach(() => {
    vi.mocked(submitErrorReport).mockResolvedValue({
      id: "report-id",
      public_id: "ERR-PUBLIC-CTA",
      error_code: "ERR-TEST-CTA",
      created_at: new Date().toISOString(),
    });
  });

  it("turns a failed legacy alert into a reportable custom error toast", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><div>Application</div></ToastProvider>);

    act(() => window.alert("Failed to update store."));

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to update store.");
    expect(screen.getByText("Error code: ERR-TEST-CTA")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send to developer" }));

    expect(submitErrorReport).toHaveBeenCalledWith(expect.objectContaining({
      errorCode: "ERR-TEST-CTA",
      message: "Failed to update store.",
    }));
    expect(await screen.findByRole("button", { name: "Sent to developer" })).toBeDisabled();
  });

  it("turns a successful legacy alert into a non-reportable success toast", () => {
    render(<ToastProvider><div>Application</div></ToastProvider>);

    act(() => window.alert("Reward redeemed successfully."));

    expect(screen.getByRole("status")).toHaveTextContent("Reward redeemed successfully.");
    expect(screen.queryByRole("button", { name: "Send to developer" })).not.toBeInTheDocument();
  });
});
