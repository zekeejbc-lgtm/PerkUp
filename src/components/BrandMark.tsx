type BrandMarkProps = {
  className?: string;
  compact?: boolean;
};

export function BrandMark({ className = "", compact = false }: BrandMarkProps) {
  const sizeClass = compact ? "h-8" : "h-9";
  const imageClassName = `${sizeClass} w-auto object-contain`;

  return (
    <span className={`inline-flex items-center ${className}`}>
      <img
        src="/icons/perk-wordmark-light-transparent.png?v=20260722-theme"
        alt="perk."
        width="70"
        height="32"
        loading="eager"
        decoding="async"
        data-eager="true"
        className={`${imageClassName} dark:hidden`}
      />
      <img
        src="/icons/perk-wordmark-dark-transparent.png?v=20260722-theme"
        alt=""
        aria-hidden="true"
        width="70"
        height="32"
        loading="eager"
        decoding="async"
        data-eager="true"
        className={`${imageClassName} hidden dark:block`}
      />
    </span>
  );
}
