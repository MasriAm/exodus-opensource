"use client";

import { useMemo } from "react";

import { StatePanel } from "@/components/state-panel";
import {
  assertSuperlativeOrder,
  computeActivityFacts,
} from "@/lib/activity-facts";
import { formatDate, formatNumber } from "@/lib/format";
import type { MessageHeatmapResult, MessageItem } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type ActivityHeatmapViewProps = {
  heatmap: MessageHeatmapResult | null;
  loading: boolean;
  error: string | null;
  selectedDayMs: number | null;
  dayMessages: MessageItem[];
  dayLoading: boolean;
  years: number[];
  year: number | null;
  onChangeYear: (year: number | null) => void;
  onSelectDay: (dayMs: number) => void;
  onOpenConversation: (conversation: string) => void;
};

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function heatClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "bg-heat-0";
  const ratio = count / max;
  if (ratio > 0.8) return "bg-heat-4 text-cream";
  if (ratio > 0.55) return "bg-heat-3 text-cream";
  if (ratio > 0.3) return "bg-heat-2";
  if (ratio > 0.1) return "bg-heat-1";
  return "bg-heat-1/70";
}

function utcDayStart(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function ActivityHeatmapView({
  heatmap,
  loading,
  error,
  selectedDayMs,
  dayMessages,
  dayLoading,
  years,
  year: selectedYear,
  onChangeYear,
  onSelectDay,
  onOpenConversation,
}: ActivityHeatmapViewProps) {
  const byDay = useMemo(() => {
    const map = new Map<number, number>();
    for (const day of heatmap?.days ?? []) {
      map.set(day.dayMs, day.messageCount);
    }
    return map;
  }, [heatmap]);

  const facts = useMemo(() => {
    const next = computeActivityFacts(heatmap?.days ?? []);
    if (next) {
      assertSuperlativeOrder(next);
    }
    return next;
  }, [heatmap]);

  if (error) {
    return (
      <StatePanel kind="error" title="Calendar unavailable" description={error} />
    );
  }
  if (loading || !heatmap) {
    return (
      <StatePanel
        kind="loading"
        title="Laying out the year"
        description="Building one cell per day from the messages already on this device."
      />
    );
  }

  if (heatmap.days.length === 0 && years.length === 0) {
    return (
      <StatePanel
        title="No dated messages yet"
        description="Once messages with timestamps land in this session, the calendar fills in."
      />
    );
  }

  const year = heatmap.year;
  const jan1 = Date.UTC(year, 0, 1);
  const dec31 = Date.UTC(year, 11, 31);
  const startPad = new Date(jan1).getUTCDay(); // Sunday=0
  const totalDays =
    Math.round((dec31 - jan1) / 86_400_000) + 1;
  const weeks = Math.ceil((startPad + totalDays) / 7);

  const cells: Array<{ dayMs: number; count: number } | null>[] = Array.from(
    { length: 7 },
    () => Array.from({ length: weeks }, () => null),
  );

  for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
    const dayMs = jan1 + dayIndex * 86_400_000;
    const cellIndex = startPad + dayIndex;
    const week = Math.floor(cellIndex / 7);
    const weekday = cellIndex % 7;
    cells[weekday][week] = {
      dayMs,
      count: byDay.get(dayMs) ?? 0,
    };
  }

  const monthLabels: Array<{ week: number; label: string }> = [];
  let lastMonth = -1;
  for (let week = 0; week < weeks; week += 1) {
    const sample =
      cells[0][week] ??
      cells[1][week] ??
      cells[2][week] ??
      cells[3][week] ??
      cells[4][week] ??
      cells[5][week] ??
      cells[6][week];
    if (!sample) continue;
    const month = new Date(sample.dayMs).getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ week, label: MONTH_SHORT[month] });
      lastMonth = month;
    }
  }

  const todayMs = utcDayStart(Date.now());

  return (
    <div className="space-y-10">
      <div>
        <p className="font-body text-[15px] leading-7 text-body">
          A ledger of how often you wrote, day by day. Darker cells mean more
          messages — click any active day to read it.
        </p>

        {years.length > 1 ? (
          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Calendar year">
            {years.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === (selectedYear ?? year)}
                onClick={() => onChangeYear(entry)}
                className={cn(
                  "border border-ink/20 px-2.5 py-1 font-display text-xs tracking-[0.06em] transition-colors duration-150",
                  entry === (selectedYear ?? year)
                    ? "border-teal bg-teal-wash text-ink"
                    : "text-body hover:bg-cream",
                )}
              >
                {entry}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {facts ? (
        <dl className="border-y border-ink/20">
          {(
            [
              [
                "Busiest day",
                `${formatDate(facts.busiestDay.dayMs)} · ${formatNumber(facts.busiestDay.messageCount)} messages`,
              ],
              [
                "Quietest day",
                `${formatDate(facts.quietestDay.dayMs)} · ${formatNumber(facts.quietestDay.messageCount)} messages`,
              ],
              [
                "Most active month",
                `${MONTH_SHORT[facts.busiestMonth.monthIndex]} · ${formatNumber(facts.busiestMonth.messageCount)} messages`,
              ],
              [
                "Quietest month",
                `${MONTH_SHORT[facts.quietestMonth.monthIndex]} · ${formatNumber(facts.quietestMonth.messageCount)} messages`,
              ],
              ["Active days", formatNumber(facts.activeDays)],
              [
                "Longest streak",
                `${formatNumber(facts.longestStreakDays)} days`,
              ],
              ["Messages this year", formatNumber(facts.totalMessages)],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 border-b border-ink/20 py-3 last:border-b-0"
            >
              <dt className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                {label}
              </dt>
              <dd className="text-end font-body text-[15px] font-medium text-ink">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="overflow-x-auto overscroll-x-contain pb-2 [-webkit-overflow-scrolling:touch]">
        <p className="mb-2 font-display text-[10px] uppercase tracking-[0.08em] text-ink/70 sm:hidden">
          Swipe sideways to read the full year
        </p>
        <div className="inline-block min-w-max">
          <div
            className="mb-1 grid gap-[2px] sm:gap-[3px]"
            style={{
              gridTemplateColumns: `1.25rem repeat(${weeks}, minmax(0.55rem, 0.75rem))`,
            }}
          >
            <span />
            {Array.from({ length: weeks }).map((_, week) => {
              const label = monthLabels.find((entry) => entry.week === week);
              return (
                <span
                  key={`m-${week}`}
                  className="font-display text-[8px] tracking-[0.04em] text-ink/75 sm:text-[9px]"
                >
                  {label?.label ?? ""}
                </span>
              );
            })}
          </div>

          <div className="flex gap-[2px] sm:gap-[3px]">
            <div className="flex w-5 flex-col gap-[2px] pt-0 sm:gap-[3px]">
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="flex h-2.5 items-center font-display text-[8px] text-ink/75 sm:h-3 sm:text-[9px]"
                >
                  {index % 2 === 1 ? label : ""}
                </span>
              ))}
            </div>
            <div
              className="grid gap-[2px] sm:gap-[3px]"
              style={{
                gridTemplateColumns: `repeat(${weeks}, minmax(0.55rem, 0.75rem))`,
                gridTemplateRows: "repeat(7, minmax(0.55rem, 0.75rem))",
                gridAutoFlow: "column",
              }}
            >
              {cells.flatMap((row, weekday) =>
                row.map((cell, week) => {
                  if (!cell) {
                    return (
                      <span
                        key={`empty-${weekday}-${week}`}
                        className="size-2.5 rounded-[1px] bg-transparent sm:size-3"
                      />
                    );
                  }
                  const selected = selectedDayMs === cell.dayMs;
                  const isToday = cell.dayMs === todayMs;
                  return (
                    <button
                      key={cell.dayMs}
                      type="button"
                      title={`${formatDate(cell.dayMs)} · ${formatNumber(cell.count)} messages`}
                      aria-label={`${formatDate(cell.dayMs)}: ${cell.count} messages`}
                      disabled={cell.count === 0}
                      onClick={() => onSelectDay(cell.dayMs)}
                      className={cn(
                        "size-2.5 min-h-2.5 min-w-2.5 rounded-[1px] transition-colors duration-150 sm:size-3 sm:min-h-3 sm:min-w-3",
                        heatClass(cell.count, heatmap.maxCount),
                        cell.count === 0 && "opacity-50",
                        (selected || isToday) &&
                          "outline outline-1 outline-offset-1 outline-teal",
                      )}
                    />
                  );
                }),
              )}
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 font-display text-[10px] uppercase tracking-[0.08em] text-body">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((step) => (
              <span
                key={step}
                className={cn(
                  "size-3 rounded-[1px]",
                  step === 0
                    ? "bg-heat-0 border border-ink/20"
                    : step === 1
                      ? "bg-heat-1"
                      : step === 2
                        ? "bg-heat-2"
                        : step === 3
                          ? "bg-heat-3"
                          : "bg-heat-4",
                )}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      {selectedDayMs !== null ? (
        <section>
          <h3 className="font-display text-[17px] font-bold text-ink">
            {">>"} {formatDate(selectedDayMs)}
          </h3>
          <p className="mt-1 font-body text-[15px] text-body">
            Messages from this exact day, newest threads first in the archive.
          </p>
          {dayLoading ? (
            <StatePanel
              kind="loading"
              title="Opening the day"
              description="Fetching messages for the selected date."
              className="mt-4"
            />
          ) : dayMessages.length === 0 ? (
            <p className="mt-4 font-body text-[15px] text-body">
              No messages landed on this day.
            </p>
          ) : (
            <ul className="mt-4">
              {dayMessages.map((message) => (
                <li key={message.rowId} className="border-b border-ink/20">
                  <button
                    type="button"
                    onClick={() => onOpenConversation(message.conversation)}
                    className="flex h-12 w-full items-center gap-4 text-start transition-colors duration-150 hover:bg-teal-wash"
                  >
                    <span
                      dir="auto"
                      className="w-28 shrink-0 truncate font-display text-xs text-teal sm:w-40"
                    >
                      {message.conversation}
                    </span>
                    <span
                      dir="auto"
                      className="min-w-0 flex-1 truncate font-body text-[15px] text-ink"
                    >
                      {message.text ?? "Media attachment"}
                    </span>
                    <span className="meta-caps hidden shrink-0 text-[11px] text-body sm:block">
                      {message.sender}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
