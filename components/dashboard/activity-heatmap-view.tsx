"use client";

import { useMemo } from "react";

import { ArchivePanel, StatCard } from "@/components/dashboard/archive-panel";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import {
  assertSuperlativeOrder,
  computeActivityFacts,
} from "@/lib/activity-facts";
import { localCalendarDayAsUtcKey } from "@/lib/calendar-day";
import { formatDayKey, pluralize } from "@/lib/format";
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
  if (count <= 0 || max <= 0) {
    return "bg-heat-0 border border-ink/20";
  }
  const ratio = count / max;
  if (ratio > 0.8) return "bg-heat-4";
  if (ratio > 0.55) return "bg-heat-3";
  if (ratio > 0.3) return "bg-heat-2";
  return "bg-heat-1";
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

  const todayMs = localCalendarDayAsUtcKey(Date.now());

  return (
    <div className="space-y-5">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/85">
        A ledger of how often you wrote, day by day. Deeper verdigris means more
        messages — click any active day to read it.
      </p>

      {years.length > 1 ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Calendar year">
          {years.map((entry) => (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={entry === (selectedYear ?? year)}
              onClick={() => onChangeYear(entry)}
              className={cn(
                "border-2 border-ink px-2.5 py-1 font-display text-xs font-bold tracking-[0.06em] transition-colors",
                entry === (selectedYear ?? year)
                  ? "border-teal bg-teal-wash text-teal"
                  : "bg-cream text-ink/75 hover:bg-receipt",
              )}
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}

      {facts ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Most messages in a day"
            value={`${formatDayKey(facts.busiestDay.dayMs)} (${pluralize(facts.busiestDay.messageCount, "msg")})`}
          />
          <StatCard
            label="Fewest messages in a month"
            value={`${MONTH_SHORT[facts.quietestMonth.monthIndex]} (${pluralize(facts.quietestMonth.messageCount, "msg")})`}
          />
          <StatCard
            label={`Total (${year})`}
            value={pluralize(facts.totalMessages, "msg")}
          />
        </div>
      ) : null}

      <ArchivePanel
        title={`Communication heatmap (${year})`}
        subtitle="Teal intensity tracks daily volume. Coral outline marks today or your selection — never intensity."
      >
        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
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
                {Array.from({ length: weeks }, (_, week) =>
                  Array.from({ length: 7 }, (_, weekday) => {
                    const cell = cells[weekday][week];
                    if (!cell) {
                      return (
                        <span
                          key={`empty-${weekday}-${week}`}
                          className="size-2.5 bg-transparent sm:size-3"
                        />
                      );
                    }
                    const selected = selectedDayMs === cell.dayMs;
                    const isToday = cell.dayMs === todayMs;
                    return (
                      <button
                        key={cell.dayMs}
                        type="button"
                        title={`${formatDayKey(cell.dayMs)} · ${pluralize(cell.count, "message")}`}
                        aria-label={`${formatDayKey(cell.dayMs)}: ${cell.count} messages`}
                        disabled={cell.count === 0}
                        onClick={() => onSelectDay(cell.dayMs)}
                        className={cn(
                          "size-2.5 min-h-2.5 min-w-2.5 transition-[transform,outline-color] duration-150 enabled:hover:scale-125 enabled:hover:outline enabled:hover:outline-2 enabled:hover:outline-offset-1 enabled:hover:outline-ink/50 disabled:opacity-40 sm:size-3 sm:min-h-3 sm:min-w-3",
                          heatClass(cell.count, heatmap.maxCount),
                          (selected || isToday) &&
                            "outline outline-2 outline-offset-1 outline-coral",
                        )}
                      />
                    );
                  }),
                )}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/70">
              <span>Less</span>
              {[0, 1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={cn(
                    "size-3",
                    step === 0
                      ? "border border-ink/20 bg-heat-0"
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
      </ArchivePanel>

      {selectedDayMs !== null ? (
        <ArchivePanel
          title={formatDayKey(selectedDayMs)}
          subtitle="Messages from this exact day."
        >
          {dayLoading ? (
            <StatePanel
              kind="loading"
              title="Opening the day"
              description="Fetching messages for the selected date."
            />
          ) : dayMessages.length === 0 ? (
            <p className="font-body text-[15px] text-ink/75">
              No messages landed on this day.
            </p>
          ) : (
            <ul>
              {dayMessages.map((message) => (
                <li key={message.rowId} className="border-b border-ink/20">
                  <button
                    type="button"
                    onClick={() => onOpenConversation(message.conversation)}
                    className="interactive-row flex h-12 w-full items-center gap-4 text-start"
                  >
                    <UserText className="w-28 shrink-0 truncate font-body text-xs font-semibold text-teal sm:w-40">
                      {message.conversation}
                    </UserText>
                    <UserText className="min-w-0 flex-1 truncate font-body text-[15px] text-ink">
                      {message.text ?? "Media attachment"}
                    </UserText>
                    <UserText className="hidden shrink-0 font-body text-[12px] text-ink/65 sm:block">
                      {message.sender}
                    </UserText>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ArchivePanel>
      ) : null}
    </div>
  );
}
