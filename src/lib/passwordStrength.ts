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

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = [
    { label: "8+ characters", met: password.length >= 8 },
    { label: "Upper and lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Number", met: /\d/.test(password) },
    { label: "Symbol", met: /[^A-Za-z0-9]/.test(password) },
    { label: "12+ characters", met: password.length >= 12 },
  ];

  const score = checks.filter((check) => check.met).length;
  const percent = Math.max(12, (score / checks.length) * 100);

  if (score >= 5) {
    return { label: "Strong", score, percent, tone: "bg-green-600", checks };
  }

  if (score >= 4) {
    return { label: "Good", score, percent, tone: "bg-[#1b1b1b]", checks };
  }

  if (score >= 3) {
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
  identity: { name?: string; email?: string } = {},
) {
  const normalizedPassword = password.toLowerCase();
  const personalTerms = [
    ...(identity.name || "").toLowerCase().split(/[^a-z0-9]+/),
    (identity.email || "").toLowerCase().split("@")[0],
  ].filter((term) => term.length >= 3);
  const requirements = [
    { label: "12+ characters", met: password.length >= 12 },
    { label: "Upper and lowercase", met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "At least one number", met: /\d/.test(password) },
    { label: "At least one symbol", met: /[^A-Za-z0-9]/.test(password) },
    {
      label: "Does not contain name or email",
      met: personalTerms.every((term) => !normalizedPassword.includes(term)),
    },
  ];
  return {
    valid: Boolean(password) && requirements.every((requirement) => requirement.met),
    requirements,
    strength: getPasswordStrength(password),
  };
}
