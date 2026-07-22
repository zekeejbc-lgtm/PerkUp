import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { normalizeStoreCategory } from "../lib/storeDirectory";

type CategorySearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  searchIconClassName?: string;
  resultsId?: string;
  ariaLabel?: string;
  suggestionLabel?: string;
  collapsibleFilters?: boolean;
};

export function CategorySearchInput({
  value,
  onChange,
  categories,
  placeholder = "Search stores or categories (separate categories with commas)...",
  className = "",
  wrapperClassName = "",
  searchIconClassName = "h-5 w-5",
  resultsId,
  ariaLabel = "Search stores and categories",
  suggestionLabel = "filter",
  collapsibleFilters = false,
}: CategorySearchInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const suggestionsId = useId();
  const availableCategories = useMemo(
    () => categories.filter((category) => normalizeStoreCategory(category) !== "all"),
    [categories],
  );
  const terms = useMemo(
    () => value.split(",").map((term) => term.trim()).filter(Boolean),
    [value],
  );
  const categoryLookup = useMemo(
    () => new Map(availableCategories.map((category) => [normalizeStoreCategory(category), category])),
    [availableCategories],
  );
  const selectedCategories = useMemo(
    () => new Set(
      terms
        .filter((term) => categoryLookup.has(normalizeStoreCategory(term)))
        .map(normalizeStoreCategory),
    ),
    [categoryLookup, terms],
  );
  const activeTerm = value.split(",").at(-1)?.trim() || "";
  const suggestions = useMemo(() => {
    const normalizedActiveTerm = normalizeStoreCategory(activeTerm);
    return availableCategories
      .filter((category) => {
        const normalizedCategory = normalizeStoreCategory(category);
        return !selectedCategories.has(normalizedCategory) && (!normalizedActiveTerm || normalizedCategory.includes(normalizedActiveTerm));
      })
      .slice(0, 8);
  }, [activeTerm, availableCategories, selectedCategories]);

  const selectCategory = (category: string) => {
    const precedingTerms = value
      .split(",")
      .slice(0, -1)
      .map((term) => term.trim())
      .filter(Boolean);
    onChange([...precedingTerms, category].join(", "));
  };

  const toggleCategory = (category: string) => {
    const normalizedCategory = normalizeStoreCategory(category);
    const isSelected = selectedCategories.has(normalizedCategory);
    const nextTerms = terms.filter((term) => normalizeStoreCategory(term) !== normalizedCategory);
    onChange((isSelected ? nextTerms : [...nextTerms, category]).join(", "));
  };

  const scrollToResults = () => {
    if (!resultsId) return;
    window.requestAnimationFrame(() => {
      document.getElementById(resultsId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (collapsibleFilters) {
    return (
      <div className={wrapperClassName}>
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className={`pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gray-400 ${searchIconClassName}`} />
            <input
              type="text"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setFiltersOpen(false);
                if (event.key === "Enter") {
                  event.preventDefault();
                  scrollToResults();
                }
              }}
              autoComplete="off"
              aria-label={ariaLabel}
              placeholder={placeholder}
              className={className}
            />
            {value.trim() && (
              <button
                type="button"
                onClick={() => onChange("")}
                aria-label="Clear search and filters"
                className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            type="button"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors ${
              filtersOpen || selectedCategories.size > 0
                ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-gray-500"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {selectedCategories.size > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] dark:bg-gray-900/10">
                {selectedCategories.size}
              </span>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {filtersOpen && (
          <div className="mt-2 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Quick filters</p>
              {selectedCategories.size > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(terms.filter((term) => !categoryLookup.has(normalizeStoreCategory(term))).join(", "))}
                  className="text-xs font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  Clear filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2" aria-label={`Available ${suggestionLabel}s`}>
              {availableCategories.map((category) => {
                const selected = selectedCategories.has(normalizeStoreCategory(category));
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleCategory(category)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors ${
                      selected
                        ? "border-gray-900 bg-gray-900 text-white dark:border-white dark:bg-white dark:text-gray-900"
                        : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5" />}
                    {category}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <Search className={`pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-gray-400 ${searchIconClassName}`} />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsFocused(false);
          if (event.key === "Enter") {
            event.preventDefault();
            if (activeTerm && suggestions.length > 0) selectCategory(suggestions[0]);
            setIsFocused(false);
            scrollToResults();
          }
        }}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={isFocused && suggestions.length > 0 ? suggestionsId : undefined}
        aria-expanded={isFocused && suggestions.length > 0}
        placeholder={placeholder}
        className={className}
      />
      {value.trim() && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {isFocused && suggestions.length > 0 && (
        <div
          id={suggestionsId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {suggestions.map((category) => (
            <button
              key={category}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCategory(category)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <span>{category}</span>
              <span className="sr-only">Select {suggestionLabel}</span>
              <Check className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
