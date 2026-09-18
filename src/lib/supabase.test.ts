import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

type SupabaseTestGlobal = typeof globalThis & {
  __perkPrimarySupabaseClient?: unknown;
  __perkSecondarySupabaseClient?: unknown;
};

const clearClientRegistry = () => {
  const registry = globalThis as SupabaseTestGlobal;
  delete registry.__perkPrimarySupabaseClient;
  delete registry.__perkSecondarySupabaseClient;
};

describe("Supabase client initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearClientRegistry();
    mocks.createClient
      .mockReturnValueOnce({ id: "primary", auth: {} })
      .mockReturnValueOnce({ id: "secondary", auth: {} });
  });

  afterEach(clearClientRegistry);

  it("reuses both clients across hot-module replacements", async () => {
    const firstModule = await import("./supabase");

    vi.resetModules();
    const replacementModule = await import("./supabase");

    expect(mocks.createClient).toHaveBeenCalledTimes(2);
    expect(replacementModule.supabase).toBe(firstModule.supabase);
    expect(replacementModule.secondarySupabase).toBe(firstModule.secondarySupabase);
  });
});
