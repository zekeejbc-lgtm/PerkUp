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
        width="70"
        height="32"
        loading="eager"
        decoding="async"
        data-eager="true"
        className={`${sizeClass} w-auto object-contain dark:invert`}
      />
    </span>
  );
}
