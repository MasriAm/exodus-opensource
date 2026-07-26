"use client";

import { cn } from "@/lib/utils";

type YearFilmstripProps = {
  years: number[];
  value: number | null;
  onChange: (year: number | null) => void;
  className?: string;
};

/** Concept B borrow: year as a film-strip scrubber above the desk. */
export function YearFilmstrip({
  years,
  value,
  onChange,
  className,
}: YearFilmstripProps) {
  if (years.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-end gap-1 overflow-x-auto border-b-2 border-ink/20 pb-2",
        className,
      )}
      role="listbox"
      aria-label="Filter by year"
    >
      <button
        type="button"
        role="option"
        aria-selected={value === null}
        onClick={() => onChange(null)}
        className={cn(
          "shrink-0 border-2 px-2 py-1 font-display text-xs tracking-[0.08em] transition-colors",
          value === null
            ? "border-ink bg-ink text-cream"
            : "border-transparent text-body hover:border-ink/40 hover:bg-cream",
        )}
      >
        ALL
      </button>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          role="option"
          aria-selected={value === year}
          onClick={() => onChange(year)}
          className={cn(
            "shrink-0 border-2 px-2 py-1 font-display text-xs transition-colors",
            value === year
              ? "border-teal bg-teal-wash text-teal"
              : "border-transparent text-body hover:border-ink/40 hover:bg-cream",
          )}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
