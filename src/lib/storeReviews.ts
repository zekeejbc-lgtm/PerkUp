export interface StoreReview {
  id: string;
  publicId?: string;
  customerName?: string;
  customerAvatarUrl?: string;
  customerInitials?: string;
  anonymous?: boolean;
  rating?: number;
  comment?: string;
  imageUrls?: string[];
  ownerReply?: string;
  createdAt?: string;
  ownerRepliedAt?: string;
  ownerReplyUpdatedAt?: string;
  hidden?: boolean;
  hiddenAt?: string;
  hiddenBy?: string;
}

export const toReviewDate = (value?: unknown): Date | null => {
  if (!value) return null;
  if (typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof (value as { seconds?: unknown }).seconds === "number") {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  if (value instanceof Date) return value;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getReviewDate = (value?: unknown) =>
  toReviewDate(value)?.toLocaleDateString() || "";

export const getInitials = (name?: string) => {
  const parts = String(name || "Customer").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "C";
};

export const getPublicReviewer = (review: StoreReview) => {
  if (review.anonymous) {
    return { name: "Anonymous Customer", avatarUrl: "", initials: "" };
  }
  const name = review.customerName || "Customer";
  return {
    name,
    avatarUrl: review.customerAvatarUrl || "",
    initials: review.customerInitials || getInitials(name),
  };
};

export const getPublicReviews = (reviews: StoreReview[]) =>
  reviews.filter((review) => review.hidden !== true);

export const getAverageRating = (reviews: StoreReview[]) => {
  if (!reviews.length) return 0;
  return reviews.reduce((total, review) => total + Number(review.rating || 0), 0) / reviews.length;
};
