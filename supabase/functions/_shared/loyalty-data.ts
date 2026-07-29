export function withoutLifetimeStars(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const sanitized = { ...(data as Record<string, unknown>) };
  delete sanitized.lifetimeStars;
  return sanitized;
}
