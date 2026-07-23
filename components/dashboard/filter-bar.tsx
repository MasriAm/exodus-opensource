"use client";

import type { ArchiveFilter } from "@/lib/db/archive-filter";
import type { FilterOptionsResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type FilterBarProps = {
  options: FilterOptionsResult | null;
  filter: ArchiveFilter;
  onChange: (next: ArchiveFilter) => void;
  className?: string;
};

export function FilterBar({
  options,
  filter,
  onChange,
  className,
}: FilterBarProps) {
  const platforms = options?.platforms ?? [];

  return (
    <div
      className={cn(
        "flex flex-wrap items-end gap-3 border-strong bg-cream p-3 shadow-press",
        className,
      )}
    >
      <label className="flex min-w-[9rem] flex-1 flex-col gap-1">
        <span className="meta-caps text-[10px] text-body">Platform</span>
        <select
          className="border-b-2 border-ink bg-transparent font-display text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
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

      <label className="flex min-w-[12rem] flex-[2] flex-col gap-1">
        <span className="meta-caps text-[10px] text-body">Person / thread</span>
        <select
          className="border-b-2 border-ink bg-transparent font-display text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-teal"
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
            <option key={`${item.platform}:${item.conversation}`} value={item.conversation}>
              {item.conversation}
            </option>
          ))}
        </select>
      </label>

      {(filter.platform || filter.conversation || filter.fromMs || filter.toMs) && (
        <button
          type="button"
          className="font-display text-xs tracking-[0.08em] text-teal underline underline-offset-4"
          onClick={() =>
            onChange({
              platform: null,
              conversation: null,
              fromMs: null,
              toMs: null,
            })
          }
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
