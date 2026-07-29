import { describe, expect, test } from "vitest";
import { withoutLifetimeStars } from "../../supabase/functions/_shared/loyalty-data.ts";

describe("legacy lifetime-points cleanup", () => {
  test("removes lifetimeStars while preserving the remaining record", () => {
    expect(withoutLifetimeStars({
      lifetimeStars: 12,
      name: "Customer",
      qrVersion: 2,
    })).toEqual({
      name: "Customer",
      qrVersion: 2,
    });
  });

  test("normalizes missing records to an empty object", () => {
    expect(withoutLifetimeStars(null)).toEqual({});
  });
});
