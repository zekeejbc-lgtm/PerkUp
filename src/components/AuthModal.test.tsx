import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const { toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../lib/backend", () => ({
  AUTH_REDIRECT_MESSAGE_KEY: "auth-redirect-message",
  GOOGLE_SIGNUP_PENDING_KEY: "google-signup-pending",
  signInWithGoogle: vi.fn(),
  auth: { client: { signOut: vi.fn(async () => undefined) } },
  db: {},
}));

vi.mock("@/src/lib/supabaseAuthCompat", () => ({
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

vi.mock("@/src/lib/passwordStrength", () => ({
  getPasswordStrength: () => ({
    label: "Strong",
    percent: 100,
    tone: "bg-green-500",
    checks: [],
  }),
  sanitizePasswordInput: (value: string) => value,
  validateStrongPassword: () => ({ valid: true, requirements: [] }),
}));

vi.mock("@/src/lib/passwordBreach", () => ({
  assertPasswordNotCompromised: vi.fn(async () => undefined),
}));

vi.mock("@/src/lib/username", () => ({
  sanitizeUsernameInput: (value: string) => value,
}));

vi.mock("@/src/lib/emailOtp", () => ({
  requestEmailOtp: vi.fn(async () => ({
    otpToken: "otp-token",
    expiresInSeconds: 600,
  })),
  verifyEmailOtp: vi.fn(),
}));

vi.mock("@/src/lib/secureQr", () => ({
  redeemStoreReferralCode: vi.fn(),
  updateCustomerProfile: vi.fn(),
  validateStoreReferralCode: vi.fn(),
}));

vi.mock("./ToastProvider", () => ({
  useToast: () => toast,
}));

vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    auth: {
      mfa: {
        listFactors: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
      },
      updateUser: vi.fn(),
      verifyOtp: vi.fn(),
    },
  },
}));

vi.mock("@/src/lib/signupAvailability", () => ({
  checkSignupAvailability: vi.fn(async () => ({
    emailAvailable: true,
    usernameAvailable: true,
    phoneAvailable: true,
  })),
}));

vi.mock("@/src/lib/dataCompat", () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock("@/src/lib/trustedDevice", () => ({
  getMfaPromptReason: vi.fn(),
}));

vi.mock("@/src/contexts/RuntimeModeContext", () => ({
  useRuntimeMode: () => ({ config: { mode: "production" } }),
}));

import { AuthModal } from "./AuthModal";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("AuthModal mobile signup layout", () => {
  it("keeps a long OTP email and final actions compact on narrow screens", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <AuthModal isOpen onClose={vi.fn()} initialMode="signup" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Agree" }));

    const content = screen.getByRole("heading", { name: "Create account" })
      .closest(".overflow-y-auto");
    expect(content).toHaveClass("p-5", "sm:p-10");

    const longEmail = "ejbcrisostomo03202500046@usep.edu.ph";
    await user.type(screen.getByPlaceholderText("name@example.com"), longEmail);
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.type(await screen.findByPlaceholderText("Juan Dela Cruz"), "Juan Dela Cruz");
    await user.type(screen.getByPlaceholderText("juan.delacruz"), "juan.delacruz");
    await user.type(screen.getByPlaceholderText("0917 123 4567"), "09171234567");
    const birthday = container.querySelector<HTMLInputElement>('input[type="date"]');
    expect(birthday).not.toBeNull();
    fireEvent.change(birthday!, { target: { value: "1995-05-12" } });
    await user.click(screen.getByRole("button", { name: "Continue" }));

    const password = container.querySelector<HTMLInputElement>('input[type="password"]');
    expect(password).not.toBeNull();
    await user.type(password!, "StrongPassword!123");
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(await screen.findByRole("button", {
      name: "Continue to email verification",
    }));

    const otpNotice = await screen.findByText(/We sent a 6-digit OTP/);
    expect(otpNotice).toHaveClass("break-words", "[overflow-wrap:anywhere]");
    expect(screen.getByRole("button", { name: "Create account" })).toHaveClass("text-sm");
    expect(screen.queryByRole("button", {
      name: "Verify & create account",
    })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toHaveClass("text-sm");

    await waitFor(() => {
      expect(screen.getByText("Step 5 of 5")).toBeInTheDocument();
    });
  });
});
