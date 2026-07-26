import { useEffect, useId, useMemo, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { Link } from "react-router-dom";

type MobileNavigationIcon = React.ComponentType<{ className?: string }>;

export type MobileDashboardNavigationItem = {
  id: string;
  label: string;
  shortLabel?: string;
  icon: MobileNavigationIcon;
  active: boolean;
  to?: string;
  onSelect?: () => void;
};

type MobileDashboardNavigationProps = {
  items: MobileDashboardNavigationItem[];
  accessLabel: string;
  primaryItemIds?: string[];
};

export function MobileDashboardNavigation({
  items,
  accessLabel,
  primaryItemIds,
}: MobileDashboardNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const generatedId = useId().replaceAll(":", "");
  const menuId = `mobile-dashboard-menu-${generatedId}`;
  const titleId = `${menuId}-title`;

  const primaryItems = useMemo(() => {
    if (!primaryItemIds?.length) return items.slice(0, 4);
    const selected = primaryItemIds
      .map((id) => items.find((item) => item.id === id))
      .filter((item): item is MobileDashboardNavigationItem => Boolean(item));
    return selected.length ? selected.slice(0, 4) : items.slice(0, 4);
  }, [items, primaryItemIds]);

  const hasMore = items.length > primaryItems.length;
  const isMoreActive = hasMore && !primaryItems.some((item) => item.active);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const destination = (
    item: MobileDashboardNavigationItem,
    className: string,
    children: React.ReactNode,
  ) => {
    const handleSelect = () => {
      setIsOpen(false);
      item.onSelect?.();
    };

    if (item.to) {
      return (
        <Link to={item.to} onClick={handleSelect} className={className}>
          {children}
        </Link>
      );
    }

    return (
      <button type="button" onClick={handleSelect} className={className}>
        {children}
      </button>
    );
  };

  if (!items.length) return null;

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 grid items-center gap-1 border-t border-gray-200 bg-white/90 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-10px_40px_-20px_rgba(0,0,0,0.1)] backdrop-blur-xl dark:border-gray-800 dark:bg-[#1b1b1b]/90 md:hidden"
        style={{ gridTemplateColumns: `repeat(${primaryItems.length + (hasMore ? 1 : 0)}, minmax(0, 1fr))` }}
        aria-label="Dashboard navigation"
      >
        {primaryItems.map((item) => (
          <div key={item.id} className="min-w-0">
            {destination(
              item,
              `flex w-full min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-all ${
                item.active
                  ? "bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              }`,
              <>
                <item.icon className={`mb-0.5 h-5 w-5 ${item.active ? "fill-[#1b1b1b]/20" : ""}`} />
                <span className="w-full truncate text-center text-[10px] font-bold tracking-tight">
                  {item.shortLabel || item.label}
                </span>
              </>,
            )}
          </div>
        ))}
        {hasMore && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            aria-expanded={isOpen}
            aria-controls={menuId}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-1.5 transition-all ${
              isMoreActive || isOpen
                ? "bg-gray-100 text-[#1b1b1b] dark:bg-white/10 dark:text-white"
                : "text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            }`}
          >
            <MoreHorizontal className="mb-0.5 h-5 w-5" />
            <span className="w-full truncate text-center text-[10px] font-bold tracking-tight">More</span>
          </button>
        )}
      </nav>

      {hasMore && isOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            onClick={() => setIsOpen(false)}
            aria-label="Close dashboard menu"
          />
          <section
            id={menuId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-gray-200 bg-white px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl dark:border-gray-800 dark:bg-[#1b1b1b]"
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-300 dark:bg-gray-700" />
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-500">{accessLabel}</p>
                <h2 id={titleId} className="text-lg font-bold text-gray-900 dark:text-white">All dashboard sections</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close dashboard menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <div key={item.id} className="min-w-0">
                  {destination(
                    item,
                    `flex h-full w-full min-w-0 items-center gap-3 rounded-2xl p-3 text-left text-sm font-semibold transition-colors ${
                      item.active
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                        : "bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                    }`,
                    <>
                      <item.icon className="h-5 w-5 shrink-0" />
                      <span className="min-w-0 leading-tight">{item.label}</span>
                    </>,
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
