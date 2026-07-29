import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminRuntimeControl from "./AdminRuntimeControl";

const mocks = vi.hoisted(() => ({
  invokeAdminBackend: vi.fn(),
  refreshRuntimeMode: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../lib/adminBackend", () => ({
  invokeAdminBackend: mocks.invokeAdminBackend,
}));

vi.mock("../../components/ToastProvider", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error }),
}));

vi.mock("../../contexts/RuntimeModeContext", () => ({
  useRuntimeMode: () => ({
    config: {
      id: "global",
      mode: "development",
      modeBeforeMaintenance: "production",
      maintenanceTitle: "Scheduled maintenance",
      maintenanceReason: "Maintenance",
      maintenanceDetails: "",
      maintenanceStartedAt: null,
      subscriptionUpgradesEnabled: false,
      subscriptionUpgradesChangedAt: null,
      modeChangedAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T00:00:00.000Z",
    },
    refreshRuntimeMode: mocks.refreshRuntimeMode,
  }),
  RuntimeMode: {},
}));

describe("AdminRuntimeControl subscription upgrades", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.invokeAdminBackend.mockResolvedValue({});
    mocks.refreshRuntimeMode.mockResolvedValue({});
  });

  it("shows the fail-closed state and requires password plus exact enable phrase", async () => {
    const user = userEvent.setup();
    render(<AdminRuntimeControl />);

    expect(screen.getByText("Subscription Upgrades")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enable subscription upgrades" }));

    const submit = screen.getByRole("button", { name: "Enable upgrades" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Your Auditor password"), "auditor-password");
    await user.type(
      screen.getByLabelText(/Type ENABLE SUBSCRIPTION UPGRADES/i),
      "ENABLE SUBSCRIPTION UPGRADES",
    );
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(mocks.invokeAdminBackend).toHaveBeenCalledWith({
      action: "set_subscription_upgrades_enabled",
      enabled: true,
      password: "auditor-password",
      confirmation: "ENABLE SUBSCRIPTION UPGRADES",
    }));
    expect(mocks.refreshRuntimeMode).toHaveBeenCalledTimes(1);
    expect(mocks.success).toHaveBeenCalledWith("Subscription upgrades are enabled.");
  });
});
