const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range/";

const sha1Hex = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

export async function assertPasswordNotCompromised(password: string): Promise<void> {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const response = await fetch(`${PWNED_PASSWORDS_RANGE_URL}${prefix}`, {
    headers: { "Add-Padding": "true" },
  });
  if (!response.ok) {
    throw new Error("Password safety could not be verified. Please try again.");
  }
  const compromised = (await response.text()).split(/\r?\n/).some((line) =>
    line.slice(0, 35).toUpperCase() === suffix
  );
  if (compromised) {
    throw new Error("This password appears in known data breaches. Choose a different password.");
  }
}
