import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { normalizeStoreCategory } from "../lib/storeDirectory";

type CategoryInputProps = {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  required?: boolean;
  className?: string;
  placeholder?: string;
};

const getActiveCategory = (value: string) => value.split(",").at(-1)?.trim() || "";

export function CategoryInput({
  value,
  onChange,
  suggestions,
  required,
  className = "",
  placeholder = "Coffee, Bakery, Retail...",
}: CategoryInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const activeCategory = getActiveCategory(value);
  const selectedCategories = useMemo(
    () => new Set(value.split(",").map(normalizeStoreCategory).filter(Boolean)),
    [value],
  );
  const matches = useMemo(() => {
    const query = normalizeStoreCategory(activeCategory);
    return suggestions
      .filter((category) => {
        const normalized = normalizeStoreCategory(category);
        return normalized && !selectedCategories.has(normalized) && (!query || normalized.includes(query));
      })
      .slice(0, 8);
  }, [activeCategory, selectedCategories, suggestions]);

  const selectCategory = (category: string) => {
    const existing = value.split(",").slice(0, -1).map((item) => item.trim()).filter(Boolean);
    onChange([...existing, category].join(", "));
  };

  return (
    <div className="relative">
      <input
        type="text"
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setIsFocused(false);
          if (event.key === "Enter" && matches.length > 0 && activeCategory) {
            event.preventDefault();
            selectCategory(matches[0]);
          }
        }}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={isFocused && matches.length > 0}
        placeholder={placeholder}
        className={className}
      />
      {isFocused && matches.length > 0 && (
        <div
          role="listbox"
          className="absolute z-30 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          {matches.map((category) => (
            <button
              key={category}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectCategory(category)}
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {category}
              <Check className="h-4 w-4 text-gray-400" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
