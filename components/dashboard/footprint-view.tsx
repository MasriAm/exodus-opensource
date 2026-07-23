"use client";

import { useMemo, useState } from "react";

import { Mark } from "@/components/capsule/mark";
import { StackedCards } from "@/components/capsule/stacked-cards";
import { TagBox } from "@/components/capsule/tag-box";
import { YearSlider } from "@/components/capsule/year-slider";
import { StatePanel } from "@/components/state-panel";
import { formatDate } from "@/lib/format";
import type { FootprintResult } from "@/lib/db/types";

type FootprintViewProps = {
  data: FootprintResult | null;
  loading: boolean;
  error: string | null;
};

export function FootprintView({ data, loading, error }: FootprintViewProps) {
  const years = useMemo(
    () =>
      (data?.interestsByYear ?? []).map((row) => row.year).sort((a, b) => a - b),
    [data],
  );
  const [year, setYear] = useState<number | null>(null);
  const [commentYear, setCommentYear] = useState<number | "all">("all");
  const activeYear = year ?? years[years.length - 1] ?? null;
  const topics =
    data?.interestsByYear.find((row) => row.year === activeYear)?.topics ?? [];
  const commentYears = [...new Set((data?.comments ?? []).map((c) => c.year))].sort(
    (a, b) => b - a,
  );
  const visibleComments =
    !data || commentYear === "all"
      ? data?.comments ?? []
      : data.comments.filter((c) => c.year === commentYear);

  if (error) {
    return (
      <StatePanel kind="error" title="Footprint unavailable" description={error} />
    );
  }
  if (loading || !data) {
    return (
      <StatePanel
        kind="loading"
        title="Dusting off the footprint"
        description="Comments, interests, and identity cards stay on this device."
      />
    );
  }

  const hasAnything =
    data.comments.length > 0 ||
    data.interestsByYear.length > 0 ||
    data.profileHistory.length > 0;

  if (!hasAnything) {
    return null;
  }

  return (
    <div className="space-y-10">
      {data.profileHistory.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-xl font-bold text-ink">
            {">>"} Identity cards
          </h2>
          <StackedCards>
            <div className="space-y-3 p-4 font-body text-sm text-ink">
              {data.profileHistory.slice(0, 6).map((row) => (
                <div
                  key={`${row.field}-${row.occurredAtMs}`}
                  className="border-b border-ink/20 pb-2"
                >
                  <p className="font-display text-xs uppercase tracking-[0.08em] text-body">
                    {row.field} · {formatDate(row.occurredAtMs)}
                  </p>
                  <p className="mt-1" dir="auto">
                    {row.value}
                  </p>
                </div>
              ))}
            </div>
          </StackedCards>
        </section>
      ) : null}

      {data.interestsByYear.length > 0 && activeYear !== null ? (
        <section>
          <h2 className="mb-2 font-display text-xl font-bold text-ink">
            {">>"} Interests over time
          </h2>
          <YearSlider
            years={years}
            value={activeYear}
            onChange={(next) => setYear(next)}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <TagBox key={topic}>{topic}</TagBox>
            ))}
          </div>
        </section>
      ) : null}

      {data.comments.length > 0 ? (
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="font-display text-xl font-bold text-ink">
              {">>"} Public comments
            </h2>
            <select
              className="border-b-2 border-ink bg-transparent font-display text-sm"
              value={commentYear}
              onChange={(event) => {
                const value = event.target.value;
                setCommentYear(value === "all" ? "all" : Number(value));
              }}
            >
              <option value="all">All years</option>
              {commentYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <ul className="space-y-3">
            {visibleComments.map((comment) => (
              <li
                key={`${comment.occurredAtMs}-${comment.text.slice(0, 24)}`}
                className="border-strong bg-cream p-4 shadow-press"
              >
                <p className="font-body text-ink" dir="auto">
                  {comment.text}
                </p>
                <p className="mt-2 meta-caps text-[10px] text-body">
                  <Mark>{formatDate(comment.occurredAtMs)}</Mark>
                  {comment.title ? ` · ${comment.title}` : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
