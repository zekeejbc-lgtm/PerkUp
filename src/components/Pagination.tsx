import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
};

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = "items",
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);

  if (totalItems <= pageSize) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);
  const visiblePages = Array.from({ length: totalPages }, (_, index) => index + 1).filter((pageNumber) => (
    pageNumber === 1 ||
    pageNumber === totalPages ||
    Math.abs(pageNumber - currentPage) <= 1
  ));

  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing <span className="font-semibold text-gray-900 dark:text-white">{startItem}-{endItem}</span> of{" "}
        <span className="font-semibold text-gray-900 dark:text-white">{totalItems}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {visiblePages.map((pageNumber, index) => {
          const previousPage = visiblePages[index - 1];
          const hasGap = previousPage !== undefined && pageNumber - previousPage > 1;

          return (
            <span key={pageNumber} className="inline-flex items-center gap-2">
              {hasGap && <span className="px-1 text-sm text-gray-400">...</span>}
              <button
                type="button"
                onClick={() => onPageChange(pageNumber)}
                aria-current={pageNumber === currentPage ? "page" : undefined}
                className={`h-9 min-w-9 rounded-xl px-3 text-sm font-semibold transition-colors ${
                  pageNumber === currentPage
                    ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {pageNumber}
              </button>
            </span>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
