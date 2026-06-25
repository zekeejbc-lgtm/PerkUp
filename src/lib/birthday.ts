const BIRTHDAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export type BirthdayStatus = {
  hasBirthday: boolean;
  isToday: boolean;
  label: string;
};

const parseBirthday = (birthday?: string | null) => {
  const match = String(birthday || "").match(BIRTHDAY_PATTERN);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
};

export const getBirthdayStatus = (birthday?: string | null, now = new Date()): BirthdayStatus => {
  const parsed = parseBirthday(birthday);
  if (!parsed) {
    return {
      hasBirthday: false,
      isToday: false,
      label: "Birthday not set",
    };
  }

  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const displayDate = new Date(now.getFullYear(), parsed.month - 1, parsed.day);

  return {
    hasBirthday: true,
    isToday: parsed.month === todayMonth && parsed.day === todayDay,
    label: displayDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  };
};
