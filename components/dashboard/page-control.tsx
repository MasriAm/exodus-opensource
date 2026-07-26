"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import { cn } from "@/lib/utils";

type PageControlProps = {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
  disabled?: boolean;
};

/**
 * Mockup pagination: << PREV   PAGE [ n ] OF N   NEXT >>
 * Page input jumps on Enter; garbage / out-of-range ignored.
 */
export function PageControl({
  page,
  totalPages,
  onChange,
  className,
  disabled = false,
}: PageControlProps) {
  const inputId = useId();
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);
  const [draft, setDraft] = useState(String(safePage));

  useEffect(() => {
    setDraft(String(safePage));
  }, [safePage]);

  const commit = (raw: string) => {
    const parsed = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(safePage));
      return;
    }
    const next = Math.min(Math.max(1, parsed), safeTotal);
    setDraft(String(next));
    if (next !== safePage) {
      onChange(next);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    commit(draft);
  };

  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        "flex flex-wrap items-center justify-center gap-3 border-t-2 border-ink/25 px-3 py-3",
        className,
      )}
    >
      <button
        type="button"
        disabled={disabled || safePage <= 1}
        onClick={() => onChange(safePage - 1)}
        className="min-h-10 border-2 border-ink bg-cream px-3 font-display text-xs font-bold uppercase tracking-[0.08em] text-ink shadow-panel transition-[background-color,opacity,box-shadow] hover:bg-receipt disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-40 disabled:shadow-none"
      >
        {"<<"} Prev
      </button>
      <label
        htmlFor={inputId}
        className="flex items-center gap-2 font-display text-xs font-bold uppercase tracking-[0.08em] text-ink"
      >
        Page
        <input
          id={inputId}
          inputMode="numeric"
          disabled={disabled}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => commit(draft)}
          aria-label={`Page number, of ${safeTotal}`}
          className="w-14 border-b-2 border-teal bg-transparent px-1 py-0.5 text-center font-display text-sm font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
        />
        of {safeTotal}
      </label>
      <button
        type="button"
        disabled={disabled || safePage >= safeTotal}
        onClick={() => onChange(safePage + 1)}
        className="min-h-10 border-2 border-ink bg-cream px-3 font-display text-xs font-bold uppercase tracking-[0.08em] text-ink shadow-panel transition-[background-color,opacity,box-shadow] hover:bg-receipt disabled:cursor-not-allowed disabled:bg-paper disabled:opacity-40 disabled:shadow-none"
      >
        Next {">>"}
      </button>
    </form>
  );
}
