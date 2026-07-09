export const getPromotionRequiredStamps = (promotion: any) =>
  Math.max(Number(promotion?.requiredStamps || 10), 1);

export const getCompletedPromotionCount = (cards: any[], promotion: any) => {
  const promotionId = String(promotion?.id || "");
  if (!promotionId) return 0;

  const requiredStamps = getPromotionRequiredStamps(promotion);
  const completedCustomerIds = new Set<string>();
  let anonymousCompletedCards = 0;

  cards.forEach((card) => {
    const progress = Number(card?.promoProgress?.[promotionId] || 0);
    if (progress < requiredStamps) return;

    const customerId = String(card?.customerId || "").trim();
    if (customerId) completedCustomerIds.add(customerId);
    else anonymousCompletedCards += 1;
  });

  return completedCustomerIds.size + anonymousCompletedCards;
};

export const getRemainingPromotionClaims = (promotion: any) => {
  const maxRedemptions = Number(promotion?.maxRedemptions || 0);
  if (!maxRedemptions) return null;
  return Math.max(maxRedemptions - Number(promotion?.claimedCount || 0), 0);
};

export const getRemainingPromotionClaimsLabel = (promotion: any) => {
  const remaining = getRemainingPromotionClaims(promotion);
  if (remaining === null) return "Unlimited";
  const maxRedemptions = Number(promotion?.maxRedemptions || 0);
  return `${remaining} / ${maxRedemptions} left`;
};
