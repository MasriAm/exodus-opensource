"use client";

import { useMemo, useState } from "react";

import { PhotoThumb } from "@/components/capsule/photo-thumb";
import { ArchivePanel, StatCard } from "@/components/dashboard/archive-panel";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import { formatDate, formatNumber, pluralize } from "@/lib/format";
import type { PeopleListItem, PersonDetailResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type PeopleViewProps = {
  people: PeopleListItem[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  detail: PersonDetailResult | null;
  detailLoading: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (conversation: string) => void;
  onOpenMessages: (conversation: string) => void;
  readBlob: (zipPath: string) => Promise<Blob>;
};

const PEOPLE_PAGE = 40;

function formatReplyLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  if (ms < 60_000) {
    return `${Math.max(1, Math.round(ms / 1000))}s`;
  }
  if (ms < 3_600_000) {
    return `${Math.round(ms / 60_000)}m`;
  }
  if (ms < 86_400_000) {
    const hours = ms / 3_600_000;
    return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  }
  return `${Math.round(ms / 86_400_000)}d`;
}

function VolumeBar({
  conversation,
  balance,
}: {
  conversation: string;
  balance: Array<{ sender: string; messageCount: number }>;
}) {
  if (balance.length === 0) {
    return null;
  }
  const total = balance.reduce((sum, row) => sum + row.messageCount, 0);
  if (total <= 0) {
    return null;
  }
  const normalized = conversation.trim().toLocaleLowerCase();
  const them =
    balance.find((row) => {
      const s = row.sender.trim().toLocaleLowerCase();
      return s === normalized || normalized.includes(s) || s.includes(normalized);
    }) ?? [...balance].sort((a, b) => b.messageCount - a.messageCount)[0];
  const youCount = balance
    .filter((row) => row.sender !== them.sender)
    .reduce((sum, row) => sum + row.messageCount, 0);
  const themCount = them.messageCount;
  const youPct = Math.round((youCount / total) * 100);
  const themPct = Math.max(0, 100 - youPct);

  return (
    <div>
      <div className="flex h-9 w-full overflow-hidden border-2 border-ink">
        <div
          className="flex items-center justify-center bg-teal px-2 font-display text-[10px] font-bold uppercase tracking-[0.06em] text-cream"
          style={{ width: `${Math.max(youPct, youCount > 0 ? 12 : 0)}%` }}
        >
          {youCount > 0 ? `You ${youPct}%` : null}
        </div>
        <div
          className="flex items-center justify-center bg-taupe px-2 font-display text-[10px] font-bold uppercase tracking-[0.06em] text-ink"
          style={{ width: `${Math.max(themPct, themCount > 0 ? 12 : 0)}%` }}
        >
          {themCount > 0 ? `Them ${themPct}%` : null}
        </div>
      </div>
      <p className="mt-2 font-body text-[13px] text-ink/75">
        <UserText as="span">{them.sender}</UserText> vs everyone else in the thread.
      </p>
    </div>
  );
}

function YearSparkline({
  rows,
}: {
  rows: Array<{ year: number; messageCount: number }>;
}) {
  if (rows.length === 0) {
    return null;
  }
  const max = Math.max(...rows.map((row) => row.messageCount), 1);
  return (
    <div>
      <p className="meta-caps mb-1">Messages per year</p>
      <p className="mb-2 font-body text-[12px] text-ink/70">
        Bar height = volume that year. The number under each bar is the year
        (last two digits). Hover a bar for the exact count.
      </p>
      <div className="flex h-24 items-end gap-1.5 overflow-visible pt-6">
        {rows.map((row) => (
          <div
            key={row.year}
            className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 overflow-visible"
          >
            <span className="pointer-events-none absolute bottom-[calc(100%-0.25rem)] z-20 hidden -translate-y-1 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 font-display text-[10px] font-bold text-cream shadow-panel group-hover:block">
              {formatNumber(row.messageCount)} msgs
            </span>
            <div
              className="relative z-0 w-full max-w-[2rem] bg-[color-mix(in_srgb,var(--teal)_55%,var(--paper))] transition-opacity group-hover:opacity-90"
              style={{
                height: `${Math.max(10, Math.round((row.messageCount / max) * 100))}%`,
              }}
              title={`${row.year}: ${formatNumber(row.messageCount)} messages`}
              aria-label={`${row.year}: ${formatNumber(row.messageCount)} messages`}
            />
            <span className="font-display text-[9px] font-bold text-ink/75">
              ’{String(row.year).slice(-2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SplitMeter({
  label,
  you,
  them,
}: {
  label: string;
  you: number;
  them: number;
}) {
  const total = you + them;
  if (total <= 0) {
    return null;
  }
  const youPct = Math.round((you / total) * 100);
  const themPct = Math.max(0, 100 - youPct);
  return (
    <div>
      <p className="meta-caps mb-2">{label}</p>
      <div className="flex h-7 w-full overflow-hidden border border-ink/40">
        <div
          className="bg-teal"
          style={{ width: `${Math.max(youPct, you > 0 ? 8 : 0)}%` }}
          title={`You ${formatNumber(you)}`}
        />
        <div
          className="bg-taupe"
          style={{ width: `${Math.max(themPct, them > 0 ? 8 : 0)}%` }}
          title={`Them ${formatNumber(them)}`}
        />
      </div>
      <p className="mt-1.5 font-display text-xs font-bold text-ink">
        You {formatNumber(you)} · Them {formatNumber(them)}
      </p>
    </div>
  );
}

function DynamicsPanel({ detail }: { detail: PersonDetailResult }) {
  const d = detail.dynamics;
  const startTotal = d.conversationStarts.you + d.conversationStarts.them;
  const mediaTotal = d.mediaSplit.you + d.mediaSplit.them;
  const youStartPct =
    startTotal > 0 ? Math.round((d.conversationStarts.you / startTotal) * 100) : 0;

  return (
    <ArchivePanel
      title="Volume dynamics"
      subtitle="Who wrote more — and how the thread actually moves."
    >
      <VolumeBar
        conversation={detail.conversation}
        balance={detail.senderBalance}
      />

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="border border-ink/20 bg-paper/40 px-3 py-2.5">
          <dt className="meta-caps">Who starts more</dt>
          <dd className="mt-1 font-display text-sm font-bold text-ink">
            {startTotal === 0
              ? "—"
              : youStartPct >= 50
                ? `You (${youStartPct}%)`
                : `Them (${100 - youStartPct}%)`}
          </dd>
          <dd className="mt-0.5 font-body text-[12px] text-ink/70">
            First message after a 4h gap · you {formatNumber(d.conversationStarts.you)} / them{" "}
            {formatNumber(d.conversationStarts.them)}
          </dd>
        </div>
        <div className="border border-ink/20 bg-paper/40 px-3 py-2.5">
          <dt className="meta-caps">Median reply</dt>
          <dd className="mt-1 font-display text-sm font-bold text-ink">
            You {formatReplyLatency(d.medianReplyMs.you)} · Them{" "}
            {formatReplyLatency(d.medianReplyMs.them)}
          </dd>
        </div>
        <div className="border border-ink/20 bg-paper/40 px-3 py-2.5">
          <dt className="meta-caps">Avg message length</dt>
          <dd className="mt-1 font-display text-sm font-bold text-ink">
            You {formatNumber(Math.round(d.avgMessageLength.you))} · Them{" "}
            {formatNumber(Math.round(d.avgMessageLength.them))} chars
          </dd>
        </div>
        <div className="border border-ink/20 bg-paper/40 px-3 py-2.5">
          <dt className="meta-caps">Day with most messages together</dt>
          <dd className="mt-1 font-display text-sm font-bold text-ink">
            {d.busiestDay
              ? `${formatNumber(d.busiestDay.messageCount)} msgs · ${formatDate(d.busiestDay.dayMs)}`
              : "—"}
          </dd>
        </div>
      </dl>

      {d.yearlyVolume.length > 0 ? (
        <div className="mt-5 border-t border-ink/15 pt-4">
          <YearSparkline rows={d.yearlyVolume} />
        </div>
      ) : null}

      {mediaTotal > 0 ? (
        <div className="mt-5 border-t border-ink/15 pt-4">
          <SplitMeter
            label="Media shared"
            you={d.mediaSplit.you}
            them={d.mediaSplit.them}
          />
        </div>
      ) : null}

      {d.topWords.length > 0 ? (
        <div className="mt-5 border-t border-ink/15 pt-4">
          <p className="meta-caps mb-2">Most-used words</p>
          <div className="flex flex-wrap gap-1.5">
            {d.topWords.slice(0, 10).map((word) => (
              <span
                key={word.word}
                className="border border-ink/25 bg-paper px-2 py-0.5 font-body text-[13px] text-ink"
              >
                <UserText as="span">{word.word}</UserText>
                <span className="ms-1 font-display text-[10px] text-ink/60">
                  {formatNumber(word.count)}
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {detail.longestSilenceDays > 0 ? (
        <p className="mt-5 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
          Longest silence · {formatNumber(detail.longestSilenceDays)} days
        </p>
      ) : null}
    </ArchivePanel>
  );
}

export function PeopleView({
  people,
  loading,
  error,
  selected,
  detail,
  detailLoading,
  hasMore = false,
  onLoadMore,
  onSelect,
  onOpenMessages,
  readBlob,
}: PeopleViewProps) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PEOPLE_PAGE);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) {
      return people;
    }
    return people.filter((person) =>
      person.conversation.toLocaleLowerCase().includes(needle),
    );
  }, [people, query]);

  const visible = filtered.slice(0, limit);

  if (error) {
    return (
      <StatePanel kind="error" title="People index unavailable" description={error} />
    );
  }
  if (loading) {
    return (
      <StatePanel
        kind="loading"
        title="Opening the card catalog"
        description="Reading correspondents from the local archive."
      />
    );
  }
  if (people.length === 0) {
    return (
      <StatePanel
        title="No people match these filters"
        description="Widen the time range or clear a person filter to see the full index."
      />
    );
  }

  return (
    <div className="space-y-5">
      <p className="font-body text-[15px] font-medium leading-7 text-ink/85">
        Everyone you wrote with, ranked by volume. Search the index, then open a
        file for streaks, silence, and shared media.
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <ArchivePanel
          title="Index"
          subtitle={`${pluralize(visible.length, "name")} shown`}
          bodyClassName="!p-0"
        >
          <div className="border-b border-ink/25 px-4 py-3">
            <label className="block">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/70">
                Find a person
              </span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setLimit(PEOPLE_PAGE);
                }}
                dir="auto"
                placeholder="name or handle…"
                className="mt-1 w-full border-b-2 border-ink/30 bg-transparent py-1.5 font-body text-[14px] outline-none"
              />
            </label>
          </div>
          <ul className="max-h-[min(60vh,28rem)] overflow-auto">
            {visible.map((person) => (
              <li key={`${person.platform}:${person.conversation}`}>
                <button
                  type="button"
                  onClick={() => onSelect(person.conversation)}
                  className={cn(
                    "flex h-11 w-full cursor-pointer items-center justify-between gap-3 border-b border-ink/20 px-4 text-start transition-colors last:border-b-0",
                    selected === person.conversation
                      ? "bg-teal-wash"
                      : "hover:bg-paper/80",
                  )}
                >
                  <UserText className="min-w-0 truncate font-body text-sm font-semibold text-ink">
                    {person.conversation}
                  </UserText>
                  <span className="shrink-0 font-display text-xs font-bold text-ink/70">
                    {formatNumber(person.messageCount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {filtered.length > visible.length ? (
            <button
              type="button"
              className="w-full cursor-pointer border-t-2 border-ink/25 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-teal transition-colors hover:bg-paper"
              onClick={() => setLimit((value) => value + PEOPLE_PAGE)}
            >
              Show more · {formatNumber(filtered.length - visible.length)} left
            </button>
          ) : hasMore && onLoadMore ? (
            <button
              type="button"
              className="w-full cursor-pointer border-t-2 border-ink/25 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-teal transition-colors hover:bg-paper"
              onClick={onLoadMore}
            >
              Load more from the archive
            </button>
          ) : null}
        </ArchivePanel>

        <div className="space-y-5">
          {detailLoading || !detail ? (
            <StatePanel
              kind="loading"
              title="Pulling the file"
              description="Computing streaks, silence, and shared media."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <UserText
                    as="p"
                    className="font-body text-2xl font-semibold text-ink"
                  >
                    {detail.conversation}
                  </UserText>
                  <p className="mt-1 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
                    {pluralize(detail.messageCount, "message")}
                    {detail.platform ? ` · ${detail.platform}` : null}
                  </p>
                </div>
                <button
                  type="button"
                  className="cursor-pointer border-2 border-ink bg-teal px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.08em] text-cream shadow-press transition-[transform,box-shadow,background-color] hover:bg-[color-mix(in_srgb,var(--teal)_88%,var(--ink))] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[4px_4px_0_var(--ink)]"
                  onClick={() => onOpenMessages(detail.conversation)}
                >
                  Open conversation
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard
                  label="First message"
                  value={
                    detail.firstMessageAtMs
                      ? formatDate(detail.firstMessageAtMs)
                      : "—"
                  }
                />
                <StatCard
                  label="Last message"
                  value={
                    detail.lastMessageAtMs
                      ? formatDate(detail.lastMessageAtMs)
                      : "—"
                  }
                />
                <StatCard
                  label="Longest streak"
                  value={`${formatNumber(detail.longestStreakDays)} days`}
                  valueClassName="text-teal"
                />
              </div>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                <DynamicsPanel detail={detail} />
                <ArchivePanel
                  title="Shared media"
                  subtitle={pluralize(detail.media.length, "photo", "photos")}
                >
                  {detail.media.length === 0 ? (
                    <p className="font-body text-[15px] text-ink/75">
                      No shared photographs in this file.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {detail.media.slice(0, 9).map((item) => (
                        <PhotoThumb
                          key={item.zipPath}
                          zipPath={item.zipPath}
                          readBlob={readBlob}
                          caption={
                            item.takenAtMs
                              ? formatDate(item.takenAtMs)
                              : item.zipPath.split("/").pop()
                          }
                        />
                      ))}
                    </div>
                  )}
                </ArchivePanel>
              </div>

              {detail.firstMessage?.text ? (
                <ArchivePanel title="First words" subtitle="How the thread opened.">
                  <blockquote className="font-body text-lg font-medium leading-8 text-ink">
                    <UserText as="span">“{detail.firstMessage.text}”</UserText>
                  </blockquote>
                </ArchivePanel>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
