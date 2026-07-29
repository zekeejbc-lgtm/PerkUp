export type CustomerLoyaltySegment = "new" | "regular" | "loyal";

export function getCustomerLoyaltySegment(points: number): CustomerLoyaltySegment {
  const balance = Number.isFinite(points) ? points : 0;
  if (balance > 20) return "loyal";
  if (balance > 5) return "regular";
  return "new";
}

export function getCustomerLoyaltyLabel(points: number) {
  const segment = getCustomerLoyaltySegment(points);
  if (segment === "loyal") return "Loyal Regular";
  if (segment === "regular") return "Regular Customer";
  return "New Customer";
}
