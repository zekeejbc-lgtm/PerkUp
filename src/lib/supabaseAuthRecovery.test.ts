import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "perk-invalid-refresh-token-test";

describe("Supabase stale session recovery", () => {
  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it("clears a rejected refresh token without logging an uncaught auth error", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token: "expired-access-token",
      refresh_token: "missing-refresh-token",
      expires_at: 1,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        aud: "authenticated",
        role: "authenticated",
        email: "session@example.com",
        app_metadata: {},
        user_metadata: {},
        identities: [],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    }));

    const authFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "refresh_token_not_found",
      msg: "Invalid Refresh Token: Refresh Token Not Found",
    }), {
      status: 400,
      headers: { "content-type": "application/json" },
    }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const client = createClient("https://example.supabase.co", "test-publishable-key", {
      auth: {
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: { fetch: authFetch },
    });

    const { data } = await client.auth.getSession();

    expect(data.session).toBeNull();
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
  });
});
