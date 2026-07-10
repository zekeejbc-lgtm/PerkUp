export type PasswordStrength = {
  label: "Weak" | "Fair" | "Good" | "Strong";
  score: number;
  percent: number;
  tone: string;
  checks: {
    label: string;
    met: boolean;
  }[];
};

export function sanitizePasswordInput(value: string): string {
  return value.replace(/\s/g, "");
}

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Upper and lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
    { label: "Symbol", met: /[^A-Za-z0-9\s]/.test(password) },
    { label: "No spaces", met: !/\s/.test(password) },
    { label: "12+ characters", met: password.length >= 12 },
  ];

  const score = checks.filter((check) => check.met).length;
  const percent = Math.max(12, (score / checks.length) * 100);

  if (score >= checks.length) {
    return { label: "Strong", score, percent, tone: "bg-green-600", checks };
  }

  if (score >= checks.length - 1) {
    return { label: "Good", score, percent, tone: "bg-[#1b1b1b]", checks };
  }

  if (score >= checks.length - 2) {
    return { label: "Fair", score, percent, tone: "bg-amber-500", checks };
  }

  return { label: "Weak", score, percent, tone: "bg-red-500", checks };
}

const PASSWORD_SYMBOLS = "!@#$%^&*_-+=?";

export function generateStrongPassword(length = 16): string {
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";
  const groups = [lowercase, uppercase, numbers, PASSWORD_SYMBOLS];
  const all = groups.join("");
  const randomIndex = (maximum: number) => {
    const rejectionLimit = 256 - (256 % maximum);
    const byte = new Uint8Array(1);
    do crypto.getRandomValues(byte); while (byte[0] >= rejectionLimit);
    return byte[0] % maximum;
  };
  const characters = groups.map((group) => group[randomIndex(group.length)]);
  while (characters.length < Math.max(12, length)) {
    characters.push(all[randomIndex(all.length)]);
  }
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

export function validateStrongPassword(
  password: string,
  identity: { name?: string; email?: string; username?: string; phone?: string; birthday?: string } = {},
) {
  const normalizedPassword = password.toLowerCase();
  const personalTerms = new Set([
    ...(identity.name || "").toLowerCase().split(/[^a-z0-9]+/),
    (identity.email || "").toLowerCase().split("@")[0],
    (identity.name || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    (identity.username || "").toLowerCase().replace(/[^a-z0-9]/g, ""),
    (identity.phone || "").replace(/\D/g, ""),
    ...getBirthdayPasswordTerms(identity.birthday),
  ].map((term) => term.replace(/[^a-z0-9]/g, "")).filter((term) => term.length >= 4));
  const requirements = [
    { label: "12+ characters", met: password.length >= 12 },
    { label: "Upper and lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "At least one number", met: /\d/.test(password) },
    { label: "At least one symbol", met: /[^A-Za-z0-9\s]/.test(password) },
    { label: "No spaces", met: !/\s/.test(password) },
    {
      label: "Does not contain personal information",
      met: [...personalTerms].every((term) => !normalizedPassword.replace(/[^a-z0-9]/g, "").includes(term)),
    },
  ];
  return {
    valid: Boolean(password) && requirements.every((requirement) => requirement.met),
    requirements,
    strength: getPasswordStrength(password),
  };
}

const MONTH_NAMES = [
  ["january", "jan"], ["february", "feb"], ["march", "mar"], ["april", "apr"],
  ["may", "may"], ["june", "jun"], ["july", "jul"], ["august", "aug"],
  ["september", "sep"], ["october", "oct"], ["november", "nov"], ["december", "dec"],
];

function getBirthdayPasswordTerms(birthday?: string): string[] {
  const match = String(birthday || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const [, year, month, day] = match;
  const shortDay = String(Number(day));
  const shortMonth = String(Number(month));
  const [monthName, shortMonthName] = MONTH_NAMES[Number(month) - 1] || [];
  return [
    `${year}${month}${day}`, `${month}${day}${year}`, `${day}${month}${year}`,
    `${year}${shortMonth}${shortDay}`, `${shortMonth}${shortDay}${year}`, `${shortDay}${shortMonth}${year}`,
    `${monthName}${shortDay}${year}`, `${shortMonthName}${shortDay}${year}`,
    `${monthName}${day}${year}`, `${shortMonthName}${day}${year}`,
  ].filter(Boolean);
}
