import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("./supabase", () => ({
  supabase: {
    auth: { refreshSession: mocks.refreshSession },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
  },
}));

import { clearDataCache, db, doc, getDoc } from "./dataCompat";

describe("dataCompat read cache", () => {
  beforeEach(() => {
    clearDataCache();
    mocks.maybeSingle.mockReset();
    mocks.refreshSession.mockReset();
  });

  it("deduplicates simultaneous reads for the same document", async () => {
    let resolveRead: ((value: unknown) => void) | undefined;
    mocks.maybeSingle.mockReturnValue(new Promise((resolve) => {
      resolveRead = resolve;
    }));

    const reference = doc(db, "stores", "store-1");
    const first = getDoc(reference);
    const second = getDoc(reference);
    resolveRead?.({ data: { id: "store-1", data: { name: "Perk Cafe" } }, error: null });

    const [firstSnapshot, secondSnapshot] = await Promise.all([first, second]);
    expect(firstSnapshot.data()).toEqual({ name: "Perk Cafe" });
    expect(secondSnapshot.data()).toEqual({ name: "Perk Cafe" });
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("caches a missing document instead of repeatedly requesting it", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const reference = doc(db, "stores", "missing-store");

    expect((await getDoc(reference)).exists()).toBe(false);
    expect((await getDoc(reference)).exists()).toBe(false);
    expect(mocks.maybeSingle).toHaveBeenCalledTimes(1);
  });

  it("can invalidate one collection without clearing unrelated entries", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: "store-1", data: { name: "Perk Cafe" } }, error: null });
    const reference = doc(db, "stores", "store-1");

    await getDoc(reference);
    clearDataCache("stores");
    await getDoc(reference);

    expect(mocks.maybeSingle).toHaveBeenCalledTimes(2);
  });
});
