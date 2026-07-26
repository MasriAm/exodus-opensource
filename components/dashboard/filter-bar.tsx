"use client";

import type { ArchiveFilter } from "@/lib/db/archive-filter";
import { pluralize } from "@/lib/format";
import type { FilterOptionsResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type FilterBarProps = {
  options: FilterOptionsResult | null;
  filter: ArchiveFilter;
  year: number | null;
  years: number[];
  matchCount: number | null;
  /** Singular noun for the match count, e.g. "message" / "person". */
  matchNoun?: string;
  matchPlural?: string;
  onChange: (next: ArchiveFilter) => void;
  onChangeYear: (year: number | null) => void;
  className?: string;
};

function LabeledSelect({
  label,
  displayValue,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  displayValue: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex min-w-0 cursor-pointer items-center gap-2 border-2 border-ink bg-cream px-2.5 py-2 font-display text-xs font-bold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-receipt",
        className,
      )}
    >
      <span className="pointer-events-none shrink-0 text-ink/75">{label}:</span>
      <span className="pointer-events-none min-w-0 flex-1 truncate text-ink">
        {displayValue}
      </span>
      <span className="pointer-events-none shrink-0 text-ink/50" aria-hidden="true">
        ▾
      </span>
      {/* Covers the whole control so any click opens the native menu. */}
      <select
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

export function FilterBar({
  options,
  filter,
  year,
  years,
  matchCount,
  matchNoun = "message",
  matchPlural,
  onChange,
  onChangeYear,
  className,
}: FilterBarProps) {
  const platforms = options?.platforms ?? [];
  const active =
    year !== null || Boolean(filter.platform) || Boolean(filter.conversation);
  const yearLabel = year !== null ? String(year) : "All time";
  const platformLabel = filter.platform ?? "All";
  const personLabel = filter.conversation ?? "Everyone";

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-xs font-bold uppercase tracking-[0.08em] text-ink">
          Filters:
        </span>
        <LabeledSelect
          label="Year"
          displayValue={yearLabel}
          value={year !== null ? String(year) : ""}
          onChange={(value) => onChangeYear(value ? Number(value) : null)}
        >
          <option value="">All time</option>
          {years.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect
          label="Platform"
          displayValue={platformLabel}
          value={filter.platform ?? ""}
          onChange={(value) =>
            onChange({ ...filter, platform: value || null })
          }
        >
          <option value="">All</option>
          {platforms.map((platform) => (
            <option key={platform} value={platform}>
              {platform}
            </option>
          ))}
        </LabeledSelect>
        <LabeledSelect
          label="Person"
          displayValue={personLabel}
          value={filter.conversation ?? ""}
          onChange={(value) =>
            onChange({ ...filter, conversation: value || null })
          }
          className="min-w-[12rem] flex-1"
        >
          <option value="">Everyone</option>
          {(options?.conversations ?? []).map((item) => (
            <option
              key={`${item.platform}:${item.conversation}`}
              value={item.conversation}
            >
              {item.conversation}
            </option>
          ))}
        </LabeledSelect>
        {matchCount !== null ? (
          <p className="ms-auto font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink">
            {pluralize(matchCount, matchNoun, matchPlural)} match
          </p>
        ) : null}
        {active ? (
          <button
            type="button"
            className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-teal hover:underline"
            onClick={() => {
              onChangeYear(null);
              onChange({
                platform: null,
                conversation: null,
                fromMs: null,
                toMs: null,
              });
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}
