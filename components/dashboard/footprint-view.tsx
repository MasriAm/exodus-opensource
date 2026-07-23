"use client";

import { useMemo, useState } from "react";

import { TagBox } from "@/components/capsule/tag-box";
import { YearSlider } from "@/components/capsule/year-slider";
import { StatePanel } from "@/components/state-panel";
import { formatDate, formatNumber } from "@/lib/format";
import type { FootprintResult } from "@/lib/db/types";

type FootprintViewProps = {
  data: FootprintResult | null;
  loading: boolean;
  error: string | null;
};

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) {
    return "—";
  }
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

export function FootprintView({ data, loading, error }: FootprintViewProps) {
  const years = useMemo(
    () =>
      (data?.interestsByYear ?? []).map((row) => row.year).sort((a, b) => a - b),
    [data],
  );
  const [year, setYear] = useState<number | null>(null);
  const [commentYear, setCommentYear] = useState<number | "all">("all");
  const [commentQuery, setCommentQuery] = useState("");
  const [followKind, setFollowKind] = useState<"all" | "follower" | "following">(
    "all",
  );
  const activeYear = year ?? years[years.length - 1] ?? null;
  const topics =
    data?.interestsByYear.find((row) => row.year === activeYear)?.topics ?? [];
  const commentYears = [...new Set((data?.comments ?? []).map((c) => c.year))].sort(
    (a, b) => b - a,
  );

  const visibleComments = useMemo(() => {
    if (!data) {
      return [];
    }
    const needle = commentQuery.trim().toLocaleLowerCase();
    return data.comments.filter((comment) => {
      if (commentYear !== "all" && comment.year !== commentYear) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        comment.text.toLocaleLowerCase().includes(needle) ||
        (comment.title ?? "").toLocaleLowerCase().includes(needle)
      );
    });
  }, [commentQuery, commentYear, data]);

  const visibleFollows = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.followEvents.filter(
      (row) => followKind === "all" || row.kind === followKind,
    );
  }, [data, followKind]);

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
        description="Comments, interests, follows, and identity cards stay on this device."
      />
    );
  }

  const hasAnything =
    data.comments.length > 0 ||
    data.interestsByYear.length > 0 ||
    data.profileHistory.length > 0 ||
    data.followEvents.length > 0 ||
    data.personalInfo.length > 0 ||
    data.calls.length > 0 ||
    data.systemNotes.length > 0;

  if (!hasAnything) {
    return (
      <StatePanel
        title="No public footprint in this export"
        description="Comments, bios, interests, follows, and other events appear here when the export includes them."
      />
    );
  }

  return (
    <div className="space-y-10">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/80">
        Everything outside the private threads — still local, still yours.
      </p>

      {data.profileHistory.length > 0 ? (
        <section>
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} Identity timeline
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            Username and bio changes from Instagram&apos;s profile history JSON.
          </p>
          <ul className="mt-4 border-y border-ink/20">
            {data.profileHistory.map((row) => (
              <li
                key={`${row.field}-${row.occurredAtMs}-${row.value}`}
                className="border-b border-ink/20 py-3 last:border-b-0"
              >
                <p className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                  {row.field} · {formatDate(row.occurredAtMs)}
                </p>
                <p className="mt-1 font-body text-[15px] font-medium text-ink" dir="auto">
                  {row.value}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.personalInfo.length > 0 ? (
        <section>
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} Personal information
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            Fields Instagram listed under personal information in the export.
          </p>
          <ul className="mt-4 space-y-4 border-y border-ink/20 py-4">
            {data.personalInfo.map((row) => (
              <li key={`${row.occurredAtMs}-${row.path}`}>
                <p className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                  {row.path || "personal_information"} · {formatDate(row.occurredAtMs)}
                </p>
                <dl className="mt-2 space-y-1">
                  {row.fields.map((field) => (
                    <div
                      key={`${field.key}-${field.value}`}
                      className="flex flex-wrap gap-x-3 gap-y-1"
                    >
                      <dt className="font-display text-xs text-teal">{field.key}</dt>
                      <dd className="font-body text-[15px] text-ink" dir="auto">
                        {field.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.followEvents.length > 0 ? (
        <section>
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[17px] font-bold text-ink">
              {">>"} Followers &amp; following
            </h2>
            <select
              className="border-b border-ink/40 bg-transparent font-display text-sm outline-none"
              value={followKind}
              onChange={(event) =>
                setFollowKind(
                  event.target.value as "all" | "follower" | "following",
                )
              }
            >
              <option value="all">
                All ({formatNumber(data.followEvents.length)})
              </option>
              <option value="follower">Followers</option>
              <option value="following">Following</option>
            </select>
          </div>
          <p className="font-body text-[15px] text-ink/75">
            Follow events from Instagram&apos;s connections files in the export.
          </p>
          <ul className="mt-4 max-h-80 overflow-auto border-y border-ink/20">
            {visibleFollows.map((row) => (
              <li
                key={`${row.kind}-${row.username}-${row.occurredAtMs}`}
                className="flex items-baseline justify-between gap-3 border-b border-ink/20 py-2.5 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-display text-xs text-ink" dir="auto">
                    {row.username}
                  </p>
                  <p className="font-display text-[10px] uppercase tracking-[0.08em] text-ink/65">
                    {row.kind}
                  </p>
                </div>
                <span className="shrink-0 font-display text-[11px] text-ink/70">
                  {formatDate(row.occurredAtMs)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.interestsByYear.length > 0 && activeYear !== null ? (
        <section>
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} Interests over time
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            Topics from Instagram&apos;s ads interests file, grouped by year.
          </p>
          <YearSlider
            className="mt-4"
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
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} Public comments
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            Comments you left in public — filter by year or search the text.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                Search comments
              </span>
              <input
                value={commentQuery}
                onChange={(event) => setCommentQuery(event.target.value)}
                dir="auto"
                placeholder="a phrase, a username…"
                className="border-b border-ink/40 bg-transparent py-1.5 font-body text-[15px] outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                Year
              </span>
              <select
                className="border-b border-ink/40 bg-transparent py-1.5 font-display text-sm outline-none"
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
            </label>
          </div>
          <p className="mt-2 font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
            {formatNumber(visibleComments.length)} comments match
          </p>
          {visibleComments.length === 0 ? (
            <p className="mt-4 font-body text-[15px] text-ink/75">
              No comments match this year or search.
            </p>
          ) : (
            <ul className="mt-4 border-y border-ink/20">
              {visibleComments.map((comment) => (
                <li
                  key={`${comment.occurredAtMs}-${comment.text.slice(0, 24)}`}
                  className="border-b border-ink/20 py-4 last:border-b-0"
                >
                  <p
                    className="font-body text-[15px] font-medium leading-7 text-ink"
                    dir="auto"
                  >
                    {comment.text}
                  </p>
                  <p className="mt-2 font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                    {formatDate(comment.occurredAtMs)}
                    {comment.title ? ` · ${comment.title}` : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {data.calls.length > 0 ? (
        <section>
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} Calls
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            Voice and video call events from WhatsApp chat exports.
          </p>
          <ul className="mt-4 border-y border-ink/20">
            {data.calls.map((call) => (
              <li
                key={`${call.occurredAtMs}-${call.conversation}-${call.media}`}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/20 py-3 last:border-b-0"
              >
                <div>
                  <p className="font-display text-xs text-ink" dir="auto">
                    {call.conversation || "Unknown thread"}
                  </p>
                  <p className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                    {call.media} · {formatDuration(call.durationSec)}
                  </p>
                </div>
                <span className="font-display text-[11px] text-ink/70">
                  {formatDate(call.occurredAtMs)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.systemNotes.length > 0 ? (
        <section>
          <h2 className="font-display text-[17px] font-bold text-ink">
            {">>"} System notes
          </h2>
          <p className="mt-1 font-body text-[15px] text-ink/75">
            WhatsApp system lines — joins, leaves, and other thread events.
          </p>
          <ul className="mt-4 border-y border-ink/20">
            {data.systemNotes.map((note) => (
              <li
                key={`${note.occurredAtMs}-${note.text.slice(0, 24)}`}
                className="border-b border-ink/20 py-3 last:border-b-0"
              >
                <p className="font-body text-[15px] text-ink" dir="auto">
                  {note.text}
                </p>
                <p className="mt-1 font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                  <span dir="auto">{note.conversation}</span> ·{" "}
                  {formatDate(note.occurredAtMs)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
