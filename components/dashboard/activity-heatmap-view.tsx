"use client";

import { useMemo } from "react";

import { CapsuleCard } from "@/components/capsule/card";
import { StatePanel } from "@/components/state-panel";
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
  onSelectDay: (dayMs: number) => void;
  onOpenConversation: (conversation: string) => void;
};

function intensityClass(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "bg-paper";
  const ratio = count / max;
  if (ratio > 0.75) return "bg-coral";
  if (ratio > 0.45) return "bg-teal";
  if (ratio > 0.2) return "bg-teal/50";
  return "bg-teal/20";
}

export function ActivityHeatmapView({
  heatmap,
  loading,
  error,
  selectedDayMs,
  dayMessages,
  dayLoading,
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

  if (error) {
    return (
      <StatePanel kind="error" title="Calendar unavailable" description={error} />
    );
  }
  if (loading || !heatmap) {
    return (
      <StatePanel
        kind="loading"
        title="Developing the calendar"
        description="Building a year of message volume, one cell per day."
      />
    );
  }

  if (heatmap.days.length === 0) {
    return null;
  }

  const start = Date.UTC(heatmap.year, 0, 1);
  const end = Date.UTC(heatmap.year + 1, 0, 1);
  const cells: Array<{ dayMs: number; count: number }> = [];
  for (let cursor = start; cursor < end; cursor += 86_400_000) {
    cells.push({ dayMs: cursor, count: byDay.get(cursor) ?? 0 });
  }
  const pad = new Date(start).getUTCDay();

  return (
    <div className="space-y-6">
      <CapsuleCard className="p-4">
        <p className="meta-caps mb-4 text-body">{heatmap.year} message calendar</p>
        <div
          className="grid grid-cols-7 gap-1"
          style={{ gridAutoRows: "minmax(0, 1fr)" }}
        >
          {Array.from({ length: pad }).map((_, index) => (
            <div key={`pad-${index}`} />
          ))}
          {cells.map((cell) => (
            <button
              key={cell.dayMs}
              type="button"
              title={`${formatDate(cell.dayMs)} · ${formatNumber(cell.count)}`}
              aria-label={`${formatDate(cell.dayMs)}: ${cell.count} messages`}
              disabled={cell.count === 0}
              onClick={() => onSelectDay(cell.dayMs)}
              className={cn(
                "aspect-square rounded-sm border border-ink/20",
                intensityClass(cell.count, heatmap.maxCount),
                selectedDayMs === cell.dayMs && "ring-2 ring-ink",
                cell.count === 0 && "opacity-40",
              )}
            />
          ))}
        </div>
      </CapsuleCard>

      {selectedDayMs !== null ? (
        <section>
          <h3 className="mb-3 font-display text-lg font-bold text-ink">
            {">>"} {formatDate(selectedDayMs)}
          </h3>
          {dayLoading ? (
            <StatePanel
              kind="loading"
              title="Loading the day"
              description="Fetching messages for the selected date."
            />
          ) : dayMessages.length === 0 ? null : (
            <ul className="space-y-2">
              {dayMessages.map((message) => (
                <li key={message.rowId}>
                  <button
                    type="button"
                    className="w-full border-strong bg-cream p-3 text-start shadow-press"
                    onClick={() => onOpenConversation(message.conversation)}
                  >
                    <p className="font-display text-xs text-teal" dir="auto">
                      {message.conversation} · {message.sender}
                    </p>
                    <p className="mt-1 font-body text-sm text-ink" dir="auto">
                      {message.text}
                    </p>
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
