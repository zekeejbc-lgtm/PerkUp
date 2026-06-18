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
    return { label: "Good", score, percent, tone: "bg-blue-600", checks };
  }

  if (score >= 3) {
    return { label: "Fair", score, percent, tone: "bg-amber-500", checks };
  }

  return { label: "Weak", score, percent, tone: "bg-red-500", checks };
}
