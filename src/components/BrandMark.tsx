type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandMark({ className = "", compact = false }: BrandMarkProps) {
  const sizeClass = compact ? "h-8" : "h-9";

  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/icons/perkup-wordmark-light-transparent.png?v=20260625-brand"
        alt="perk."
        className={`${sizeClass} w-auto object-contain dark:hidden`}
      />
      <img
        src="/icons/perkup-wordmark-dark-transparent.png?v=20260625-brand"
        alt="perk."
        className={`hidden ${sizeClass} w-auto object-contain dark:block`}
      />
    </span>
  );
}
