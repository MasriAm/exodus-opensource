"use client";

import { useMemo, useState } from "react";

import { TagBox } from "@/components/capsule/tag-box";
import { ArchivePanel } from "@/components/dashboard/archive-panel";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import { formatDate, formatNumber } from "@/lib/format";
import {
  followingWithoutFollowBack,
  normalizeFollowUsername,
  uniqueFollowEvents,
} from "@/lib/follow-facts";
import type { FootprintResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type FootprintViewProps = {
  data: FootprintResult | null;
  loading: boolean;
  error: string | null;
};

type FollowFilter = "follower" | "following" | "not_back";

const LIST_PAGE = 25;

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

function ShowMoreButton({
  remaining,
  onClick,
}: {
  remaining: number;
  onClick: () => void;
}) {
  if (remaining <= 0) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 w-full border border-ink/30 bg-receipt py-2.5 font-display text-xs font-bold tracking-[0.04em] text-ink transition-colors hover:border-ink hover:bg-cream"
    >
      Show {formatNumber(Math.min(LIST_PAGE, remaining))} more ·{" "}
      {formatNumber(remaining)} left
    </button>
  );
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
  const [followKind, setFollowKind] = useState<FollowFilter>("follower");
  const [followQuery, setFollowQuery] = useState("");
  const [followLimit, setFollowLimit] = useState(LIST_PAGE);
  const [commentLimit, setCommentLimit] = useState(LIST_PAGE);
  const activeYear = year ?? years[years.length - 1] ?? null;
  const topics =
    data?.interestsByYear.find((row) => row.year === activeYear)?.topics ?? [];
  const commentYears = [...new Set((data?.comments ?? []).map((c) => c.year))].sort(
    (a, b) => b - a,
  );

  const notFollowingBack = useMemo(
    () => followingWithoutFollowBack(data?.followEvents ?? []),
    [data],
  );
  const uniqueFollowers = useMemo(
    () => uniqueFollowEvents(data?.followEvents ?? [], "follower"),
    [data],
  );
  const uniqueFollowing = useMemo(
    () => uniqueFollowEvents(data?.followEvents ?? [], "following"),
    [data],
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
    const base =
      followKind === "not_back"
        ? notFollowingBack
        : followKind === "following"
          ? uniqueFollowing
          : uniqueFollowers;
    const needle = normalizeFollowUsername(followQuery);
    if (!needle) {
      return base;
    }
    return base.filter((row) =>
      normalizeFollowUsername(row.username).includes(needle),
    );
  }, [
    data,
    followKind,
    followQuery,
    notFollowingBack,
    uniqueFollowers,
    uniqueFollowing,
  ]);

  const shownFollows = visibleFollows.slice(0, followLimit);
  const shownComments = visibleComments.slice(0, commentLimit);

  const profileSnapshots = useMemo(() => {
    if (!data?.profileHistory || data.profileHistory.length === 0) return [];

    const sorted = [...data.profileHistory].sort(
      (a, b) => a.occurredAtMs - b.occurredAtMs,
    );

    // Group by exact timestamp to detect simultaneous changes
    const grouped = new Map<number, typeof sorted>();
    for (const change of sorted) {
      if (!grouped.has(change.occurredAtMs)) grouped.set(change.occurredAtMs, []);
      grouped.get(change.occurredAtMs)!.push(change);
    }
    const uniqueTimestamps = Array.from(grouped.keys()).sort((a, b) => a - b);

    // Fallback username if there are no username changes
    const fallbackUsername =
      data.personalInfo
        .flatMap((p) => p.fields)
        .find((f) => f.key.toLowerCase().includes("username"))?.value ??
      "Unknown";

    const snaps: Array<{
      username: string;
      bio: string;
      startDateMs: number;
      endDateMs: number | null;
      changed: "username" | "bio" | "both" | "initial";
    }> = [];

    let currentUsername =
      sorted.find((r) => r.field === "username")?.value ?? fallbackUsername;
    let currentBio = sorted.find((r) => r.field === "bio")?.value ?? "—";

    for (const ts of uniqueTimestamps) {
      const changes = grouped.get(ts)!;
      let userChanged = false;
      let bioChanged = false;

      for (const change of changes) {
        if (change.field === "username") {
          currentUsername = change.value;
          userChanged = true;
        }
        if (change.field === "bio") {
          currentBio = change.value;
          bioChanged = true;
        }
      }

      let changedLabel: "username" | "bio" | "both" | "initial" = "initial";
      if (userChanged && bioChanged) changedLabel = "both";
      else if (userChanged) changedLabel = "username";
      else if (bioChanged) changedLabel = "bio";

      const last = snaps[snaps.length - 1];
      if (last) {
        last.endDateMs = ts;
      }
      snaps.push({
        username: currentUsername,
        bio: currentBio,
        startDateMs: ts,
        endDateMs: null,
        changed: changedLabel,
      });
    }

    return snaps.reverse();
  }, [data?.profileHistory, data?.personalInfo]);

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
    <div className="space-y-5">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/85">
        Everything outside the private threads — still local, still yours. Each
        block below is a separate part of the export.
      </p>

      {data.profileHistory.length > 0 || data.followEvents.length > 0 ? (
        <div className="grid items-stretch gap-5 lg:grid-cols-2">
          {data.profileHistory.length > 0 ? (
            <ArchivePanel
              className="h-150"
              title="Profile iterations"
              subtitle="A timeline of your distinct profile states. Identical updates are grouped together."
              bodyClassName="flex flex-col min-h-0"
            >
              <ul className="flex-1 space-y-4 overflow-y-auto pr-4 min-h-0">
                {profileSnapshots.map((snap) => {
                  const startYear = new Date(snap.startDateMs).getUTCFullYear();
                  const endYear = snap.endDateMs ? new Date(snap.endDateMs).getUTCFullYear() : "Present";
                  const dateLabel = startYear === endYear ? startYear.toString() : `${startYear} - ${endYear}`;

                  return (
                    <li
                      key={`${snap.startDateMs}-${snap.username}-${snap.bio}`}
                      className="border-b border-ink/20 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="inline-flex border border-ink/40 bg-paper px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/80">
                          {dateLabel}
                        </span>
                        {snap.changed !== "initial" ? (
                          <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-teal">
                            {snap.changed === "both" ? "Username & Bio changed" : `${snap.changed} changed`}
                          </span>
                        ) : null}
                        <span className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/60">
                          {formatDate(snap.startDateMs)}
                        </span>
                      </div>
                      <p className="mt-2 font-body text-[13px] text-ink/70">
                        @{snap.username}
                      </p>
                      <UserText className="mt-0.5 block font-body text-[14px] leading-relaxed text-ink">
                        {snap.bio}
                      </UserText>
                    </li>
                  );
                })}
              </ul>
            </ArchivePanel>
          ) : null}
          {data.followEvents.length > 0 ? (
            <ArchivePanel
              className="h-150"
              title="Followers & following"
              subtitle="Follow back = accounts you follow that do not follow you back."
              action={
                <select
                  className="border border-ink/30 bg-cream px-2 py-1.5 font-display text-sm outline-none"
                  value={followKind}
                  onChange={(event) => {
                    setFollowKind(event.target.value as FollowFilter);
                    setFollowLimit(LIST_PAGE);
                  }}
                >
                  <option value="follower">
                    Followers ({formatNumber(uniqueFollowers.length)})
                  </option>
                  <option value="following">
                    Following ({formatNumber(uniqueFollowing.length)})
                  </option>
                  <option value="not_back">
                    Follow back ({formatNumber(notFollowingBack.length)})
                  </option>
                </select>
              }
              bodyClassName="flex flex-col min-h-0"
            >
              <label className="mb-3 block">
                <span className="meta-caps text-[11px] text-ink/75">
                  Search usernames
                </span>
                <input
                  value={followQuery}
                  onChange={(event) => {
                    setFollowQuery(event.target.value);
                    setFollowLimit(LIST_PAGE);
                  }}
                  dir="auto"
                  placeholder="@someone…"
                  className="mt-1 w-full border-b border-ink/40 bg-transparent py-1.5 font-body text-[15px] outline-none"
                />
              </label>
              <p className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
                Showing {formatNumber(shownFollows.length)} of{" "}
                {formatNumber(visibleFollows.length)}
              </p>
              {shownFollows.length === 0 ? (
                <p className="font-body text-[15px] font-medium text-ink/75">
                  Nobody matches this filter.
                </p>
              ) : (
                <ul className="flex-1 divide-y divide-ink/20 overflow-y-auto border border-ink/20 bg-receipt pr-4 min-h-0">
                  {shownFollows.map((row) => (
                    <li
                      key={`${row.kind}-${row.username}-${row.occurredAtMs}`}
                      className="flex items-baseline justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p
                          className="truncate font-display text-xs font-bold text-ink"
                          dir="auto"
                        >
                          @{normalizeFollowUsername(row.username) || row.username}
                        </p>
                        <p className="font-display text-[10px] uppercase tracking-[0.08em] text-ink/65">
                          {followKind === "not_back"
                            ? "you follow · they don't"
                            : followKind === "follower"
                              ? "follower"
                              : "following"}
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-[11px] text-ink/70">
                        {formatDate(row.occurredAtMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <ShowMoreButton
                remaining={visibleFollows.length - shownFollows.length}
                onClick={() => setFollowLimit((value) => value + LIST_PAGE)}
              />
            </ArchivePanel>
          ) : null}
        </div>
      ) : null}

      {data.personalInfo.some((row) => row.fields.length > 0) ? (
        <ArchivePanel
          title="Personal information"
          subtitle="Readable fields from Instagram's personal information export."
        >
          <ul className="space-y-3">
            {data.personalInfo
              .filter((row) => row.fields.length > 0)
              .map((row) => (
                <li
                  key={`${row.occurredAtMs}-${row.path}`}
                  className="border border-ink/20 bg-receipt px-3 py-3"
                >
                  <p className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/75">
                    {formatDate(row.occurredAtMs)}
                  </p>
                  <dl className="mt-2 space-y-1">
                    {row.fields.map((field) => (
                      <div
                        key={`${field.key}-${field.value}`}
                        className="flex flex-wrap gap-x-3 gap-y-1"
                      >
                        <dt className="font-display text-xs font-bold text-teal">
                          {field.key}
                        </dt>
                        <dd
                          className="font-body text-[15px] font-medium text-ink"
                          dir="auto"
                        >
                          {field.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
          </ul>
        </ArchivePanel>
      ) : null}

      {data.interestsByYear.length > 0 && activeYear !== null ? (
        <ArchivePanel
          title="The algorithm (interests)"
          subtitle="See what the machine thought you cared about."
        >
          <div className="flex max-h-100 flex-wrap content-start gap-2 overflow-y-auto rounded-xs border border-dotted border-ink/40 p-3 pr-4">
            {topics.map((topic) => (
              <TagBox key={topic}>{`> ${topic}`}</TagBox>
            ))}
          </div>
          <div
            className="mt-4 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Interest year"
          >
            {years.map((entry) => (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={entry === activeYear}
                onClick={() => setYear(entry)}
                className={cn(
                  "border-2 border-ink px-2.5 py-1 font-display text-xs font-bold transition-colors",
                  entry === activeYear
                    ? "border-teal bg-teal-wash text-teal"
                    : "bg-cream text-ink/75 hover:bg-receipt",
                )}
              >
                {entry}
              </button>
            ))}
          </div>
        </ArchivePanel>
      ) : null}

      {data.comments.length > 0 ? (
        <ArchivePanel
          title="Public comments"
          subtitle="Comments you left in public — filter by year or search the text."
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="meta-caps text-[11px] text-ink/75">
                Search comments
              </span>
              <input
                value={commentQuery}
                onChange={(event) => {
                  setCommentQuery(event.target.value);
                  setCommentLimit(LIST_PAGE);
                }}
                dir="auto"
                placeholder="a phrase, a username…"
                className="border-b border-ink/40 bg-transparent py-1.5 font-body text-[15px] outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="meta-caps text-[11px] text-ink/75">Year</span>
              <select
                className="border border-ink/30 bg-cream px-2 py-1.5 font-display text-sm outline-none"
                value={commentYear}
                onChange={(event) => {
                  const value = event.target.value;
                  setCommentYear(value === "all" ? "all" : Number(value));
                  setCommentLimit(LIST_PAGE);
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
          <p className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
            Showing {formatNumber(shownComments.length)} of{" "}
            {formatNumber(visibleComments.length)}
          </p>
          {shownComments.length === 0 ? (
            <p className="mt-3 font-body text-[15px] font-medium text-ink/75">
              No comments match this year or search.
            </p>
          ) : (
            <ul className="mt-3 max-h-100 divide-y divide-ink/20 overflow-y-auto border border-ink/20 bg-receipt pr-4">
              {shownComments.map((comment) => (
                <li
                  key={`${comment.occurredAtMs}-${comment.text.slice(0, 24)}`}
                  className="px-3 py-3"
                >
                  <p
                    className="font-body text-[15px] font-medium leading-7 text-ink"
                    dir="auto"
                  >
                    {comment.text}
                  </p>
                  <p className="mt-2 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
                    {formatDate(comment.occurredAtMs)}
                    {comment.title ? ` · ${comment.title}` : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <ShowMoreButton
            remaining={visibleComments.length - shownComments.length}
            onClick={() => setCommentLimit((value) => value + LIST_PAGE)}
          />
        </ArchivePanel>
      ) : null}

      {data.calls.length > 0 ? (
        <ArchivePanel
          title="Calls"
          subtitle="Voice and video call events from WhatsApp chat exports."
        >
          <ul className="divide-y divide-ink/20 border border-ink/20 bg-receipt">
            {data.calls.map((call) => (
              <li
                key={`${call.occurredAtMs}-${call.conversation}-${call.media}`}
                className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-3"
              >
                <div>
                  <p className="font-display text-xs font-bold text-ink" dir="auto">
                    {call.conversation}
                  </p>
                  <p className="meta-caps mt-1 text-[10px] text-ink/70">
                    {call.media} · {formatDuration(call.durationSec)}
                  </p>
                </div>
                <span className="font-display text-[11px] text-ink/70">
                  {formatDate(call.occurredAtMs)}
                </span>
              </li>
            ))}
          </ul>
        </ArchivePanel>
      ) : null}

      {data.systemNotes.length > 0 ? (
        <ArchivePanel
          title="System notes"
          subtitle="WhatsApp system lines from the chat export (group changes, encryption notices, and similar)."
        >
          <ul className="divide-y divide-ink/20 border border-ink/20 bg-receipt">
            {data.systemNotes.map((note) => (
              <li
                key={`${note.occurredAtMs}-${note.text.slice(0, 24)}`}
                className="px-3 py-3"
              >
                <p className="font-body text-[15px] font-medium text-ink" dir="auto">
                  {note.text}
                </p>
                <p className="mt-1 font-display text-[11px] text-ink/70">
                  {note.conversation} · {formatDate(note.occurredAtMs)}
                </p>
              </li>
            ))}
          </ul>
        </ArchivePanel>
      ) : null}
    </div>
  );
}
