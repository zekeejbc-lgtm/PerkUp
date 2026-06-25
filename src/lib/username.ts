export const USERNAME_PATTERN = /^[a-z][a-z0-9._]{2,22}[a-z0-9]$/;
export const RESERVED_USERNAMES = new Set(["admin", "administrator", "api", "help", "perkup", "staff", "store", "support"]);

export const normalizeUsername = (value: string) => value.trim().toLowerCase();

export const getUsernameValidationMessage = (value: string) => {
  const username = normalizeUsername(value);
  if (!username) return "Username is required for QR and staff manual lookup.";
  if (username.length < 4) return "Use at least 4 characters.";
  if (username.length > 24) return "Use 24 characters or fewer.";
  if (!USERNAME_PATTERN.test(username)) return "Start with a letter; use letters, numbers, dots, or underscores.";
  if (username.includes("..") || username.includes("__") || username.includes("._") || username.includes("_.")) {
    return "Do not repeat or mix separators.";
  }
  if (RESERVED_USERNAMES.has(username)) return "This username is reserved.";
  return "";
};
