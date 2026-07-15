import { Shuffle, type LucideIcon } from "lucide-react";

export interface ViewModeOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

export function ViewModeButton<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "Change view mode",
  className = "",
}: {
  value: T;
  options: readonly ViewModeOption<T>[];
  onChange: (value: NoInfer<T>) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const activeOption = options[activeIndex];

  if (!activeOption || options.length === 0) return null;

  const cycleView = () => {
    const nextOption = options[(activeIndex + 1) % options.length];
    onChange(nextOption.value);
  };

  return (
    <button
      type="button"
      onClick={cycleView}
      aria-label={`${ariaLabel}. Current view: ${activeOption.label}`}
      title={`${ariaLabel} (currently ${activeOption.label})`}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1b1b1b] dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-white/10 dark:focus:ring-white ${className}`}
    >
      <Shuffle className="h-4 w-4" aria-hidden="true" />
      <span>{activeOption.label}</span>
    </button>
  );
}
