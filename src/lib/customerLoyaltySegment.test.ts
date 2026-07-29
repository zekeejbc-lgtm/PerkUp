import { describe, expect, test } from "vitest";
import {
  getCustomerLoyaltyLabel,
  getCustomerLoyaltySegment,
} from "./customerLoyaltySegment";

describe("customer loyalty segment", () => {
  test.each([
    [0, "new"],
    [5, "new"],
    [6, "regular"],
    [20, "regular"],
    [21, "loyal"],
  ])("maps %i current store points to %s", (points, expected) => {
    expect(getCustomerLoyaltySegment(points)).toBe(expected);
  });

  test("uses customer-facing labels", () => {
    expect(getCustomerLoyaltyLabel(0)).toBe("New Customer");
    expect(getCustomerLoyaltyLabel(6)).toBe("Regular Customer");
    expect(getCustomerLoyaltyLabel(21)).toBe("Loyal Regular");
  });
});
