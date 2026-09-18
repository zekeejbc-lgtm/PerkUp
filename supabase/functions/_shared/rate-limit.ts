const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");

export const sha256 = async (value: string) =>
  hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));

export const getClientAddress = (request: Request) =>
  request.headers.get("cf-connecting-ip")?.trim()
  || request.headers.get("x-real-ip")?.trim()
  || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  || "unknown";

export const consumeRateLimit = async (
  admin: any,
  input: { key: string; purpose: string; limit: number; windowSeconds: number; salt: string },
) => {
  const keyHash = await sha256(`${input.purpose}:${input.key}:${input.salt}`);
  const { data, error } = await admin.rpc("consume_request_rate_limit", {
    p_key_hash: keyHash,
    p_purpose: input.purpose,
    p_limit: input.limit,
    p_window_seconds: input.windowSeconds,
  });
  if (error) throw error;
  return { allowed: data === true, keyHash };
};

export const randomToken = (byteLength = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};
