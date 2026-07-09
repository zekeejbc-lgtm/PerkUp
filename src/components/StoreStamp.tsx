import { Check, Coffee, Gift, Heart, Sparkles, Star } from "lucide-react";

export type StoreStampStyle = {
  stampIcon?: string;
  stampColor?: string;
  stampLabel?: string;
};

const ICONS = {
  star: Star,
  coffee: Coffee,
  gift: Gift,
  heart: Heart,
  check: Check,
  sparkle: Sparkles,
};

const isSafeHexColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value);

export const STAMP_ICON_OPTIONS = [
  { value: "star", label: "Star" },
  { value: "coffee", label: "Coffee" },
  { value: "gift", label: "Gift" },
  { value: "heart", label: "Heart" },
  { value: "check", label: "Check" },
  { value: "sparkle", label: "Sparkle" },
];

export const STAMP_COLOR_OPTIONS = [
  "#1b1b1b",
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#d97706",
];

export function normalizeStampStyle(style?: StoreStampStyle | null): Required<StoreStampStyle> {
  const icon = String(style?.stampIcon || "star").toLowerCase();
  const color = String(style?.stampColor || "#1b1b1b");
  const label = String(style?.stampLabel || "Stamp").trim().slice(0, 24) || "Stamp";

  return {
    stampIcon: icon in ICONS ? icon : "star",
    stampColor: isSafeHexColor(color) ? color : "#1b1b1b",
    stampLabel: label,
  };
}

export function StoreStamp({
  style,
  filled = true,
  size = "md",
}: {
  style?: StoreStampStyle | null;
  filled?: boolean;
  size?: "sm" | "md";
}) {
  const normalized = normalizeStampStyle(style);
  const Icon = ICONS[normalized.stampIcon as keyof typeof ICONS];
  const dimensions = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div
      className={`${dimensions} flex items-center justify-center rounded-full border transition-colors`}
      style={{
        backgroundColor: filled ? normalized.stampColor : "transparent",
        borderColor: filled ? normalized.stampColor : "rgba(156, 163, 175, 0.45)",
      }}
      title={normalized.stampLabel}
      aria-label={filled ? normalized.stampLabel : `Empty ${normalized.stampLabel}`}
    >
      {filled ? (
        <Icon className={`${iconSize} text-white`} strokeWidth={2.5} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
      )}
    </div>
  );
}
