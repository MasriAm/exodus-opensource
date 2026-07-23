"use client";

import type { ArchiveFilter } from "@/lib/db/archive-filter";
import { formatNumber } from "@/lib/format";
import type { FilterOptionsResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type FilterBarProps = {
  options: FilterOptionsResult | null;
  filter: ArchiveFilter;
  year: number | null;
  years: number[];
  matchCount: number | null;
  matchLabel?: string;
  onChange: (next: ArchiveFilter) => void;
  onChangeYear: (year: number | null) => void;
  className?: string;
};

type Chip = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function FilterBar({
  options,
  filter,
  year,
  years,
  matchCount,
  matchLabel = "messages match",
  onChange,
  onChangeYear,
  className,
}: FilterBarProps) {
  const platforms = options?.platforms ?? [];
  const chips: Chip[] = [];

  if (year !== null) {
    chips.push({
      key: "year",
      label: String(year),
      onRemove: () => onChangeYear(null),
    });
  }
  if (filter.platform) {
    chips.push({
      key: "platform",
      label: filter.platform,
      onRemove: () => onChange({ ...filter, platform: null }),
    });
  }
  if (filter.conversation) {
    chips.push({
      key: "conversation",
      label: filter.conversation,
      onRemove: () => onChange({ ...filter, conversation: null }),
    });
  }

  const active = chips.length > 0;

  return (
    <div
      className={cn(
        "space-y-3 border border-ink/20 bg-cream/60 px-3 py-3 sm:px-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="flex min-w-[7rem] flex-col gap-1">
          <span className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
            Time
          </span>
          <select
            className="border-b border-ink/40 bg-transparent py-1 font-display text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
            value={year ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              onChangeYear(value ? Number(value) : null);
            }}
            aria-label="Filter by year"
          >
            <option value="">All time</option>
            {years.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[8rem] flex-col gap-1">
          <span className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
            Platform
          </span>
          <select
            className="border-b border-ink/40 bg-transparent py-1 font-display text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
            value={filter.platform ?? ""}
            onChange={(event) =>
              onChange({
                ...filter,
                platform: event.target.value || null,
              })
            }
          >
            <option value="">All platforms</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
          <span className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
            People
          </span>
          <select
            className="border-b border-ink/40 bg-transparent py-1 font-display text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
            value={filter.conversation ?? ""}
            onChange={(event) =>
              onChange({
                ...filter,
                conversation: event.target.value || null,
              })
            }
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
          </select>
        </label>

        {matchCount !== null ? (
          <p className="ms-auto font-display text-[11px] uppercase tracking-[0.08em] text-body">
            <span className="font-bold text-ink">{formatNumber(matchCount)}</span>{" "}
            {matchLabel}
          </p>
        ) : null}
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink/20 pt-3">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex max-w-full items-center gap-2 border border-ink/20 bg-paper px-2 py-1 font-display text-[11px] tracking-[0.04em] text-ink transition-colors duration-150 hover:bg-teal-wash"
              title={`Remove ${chip.label}`}
            >
              <span dir="auto" className="truncate">
                {chip.label}
              </span>
              <span aria-hidden="true" className="text-body">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            className="ms-auto font-display text-[11px] uppercase tracking-[0.08em] text-teal hover:underline"
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
        </div>
      ) : null}
    </div>
  );
}
