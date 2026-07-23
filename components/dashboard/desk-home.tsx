"use client";

import { useRef } from "react";
import { Search } from "lucide-react";

import { PhotoThumb } from "@/components/capsule/photo-thumb";
import { PressButton } from "@/components/capsule/press-button";
import { formatDate, formatNumber } from "@/lib/format";
import type { DeskHomeResult, MessageItem } from "@/lib/db/types";

type DeskHomeProps = {
  data: DeskHomeResult;
  readBlob: (zipPath: string) => Promise<Blob>;
  onOpenPeople: () => void;
  onOpenSearch: (query?: string) => void;
  onOpenPerson: (conversation: string) => void;
  onOpenActivity: () => void;
  onOpenMedia: () => void;
  onSurprise: () => void;
  surprise: MessageItem | null;
  surpriseLoading?: boolean;
  surpriseEmpty?: boolean;
};

function SectionHeader({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="font-display text-[17px] font-bold text-ink">
        {">>"} {children}
      </h2>
      {action}
    </div>
  );
}

function GhostLink({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display text-xs tracking-[0.02em] text-body hover:text-teal hover:underline hover:underline-offset-4"
    >
      {children}
    </button>
  );
}

export function DeskHome({
  data,
  readBlob,
  onOpenPeople,
  onOpenSearch,
  onOpenPerson,
  onOpenActivity,
  onOpenMedia,
  onSurprise,
  surprise,
  surpriseLoading = false,
  surpriseEmpty = false,
}: DeskHomeProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  const fromYear =
    data.activeFromMs !== null
      ? new Date(data.activeFromMs).getUTCFullYear()
      : null;
  const toYear =
    data.activeToMs !== null ? new Date(data.activeToMs).getUTCFullYear() : null;
  const yearsLabel =
    fromYear !== null && toYear !== null
      ? fromYear === toYear
        ? String(fromYear)
        : `${fromYear}–${toYear}`
      : null;

  const monthName = new Date(
    Date.UTC(2000, data.onThisDayMonth - 1, 1),
  ).toLocaleString("en", { month: "long", timeZone: "UTC" });

  const stats: Array<{ value: string; label: string }> = [
    { value: formatNumber(data.messages), label: "messages" },
    ...(data.media > 0
      ? [{ value: formatNumber(data.media), label: "photographs" }]
      : []),
    { value: formatNumber(data.conversations), label: "threads" },
    ...(yearsLabel ? [{ value: yearsLabel, label: "years" }] : []),
  ];

  return (
    <div className="space-y-12">
      {/* Stat strip — one quiet line, hairline separators, no boxes */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-ink/20 pb-4">
        {stats.map((stat, index) => (
          <p key={stat.label} className="flex items-baseline gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="me-4 text-ink/20">
                ·
              </span>
            ) : null}
            <span className="font-display text-[17px] font-bold text-ink">
              {stat.value}
            </span>
            <span className="meta-caps text-[11px] text-body">{stat.label}</span>
          </p>
        ))}
      </div>

      {/* The one search */}
      <label className="flex items-center gap-3 border-b border-ink/20 pb-3">
        <Search aria-hidden="true" className="size-4 shrink-0 text-body" />
        <input
          ref={searchRef}
          dir="auto"
          placeholder="Search the archive — Ctrl+K"
          className="min-w-0 flex-1 bg-transparent font-display text-[15px] text-ink outline-none placeholder:text-body/70"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const value = event.currentTarget.value.trim();
              if (value) {
                onOpenSearch(value);
              }
            }
          }}
        />
      </label>

      {/* On this day — compact rows */}
      {data.onThisDayMessages.length > 0 ? (
        <section>
          <SectionHeader
            action={<GhostLink onClick={onOpenActivity}>See all →</GhostLink>}
          >
            On this day
          </SectionHeader>
          <p className="mt-1 meta-caps text-[11px] text-body">
            {monthName} {data.onThisDayDay} ·{" "}
            {formatNumber(data.onThisDayMessageCount)} messages across the years
          </p>
          <div className="mt-4">
            {data.onThisDayMessages.map((message) => (
              <button
                key={message.rowId}
                type="button"
                onClick={() => onOpenPerson(message.conversation)}
                className="flex h-12 w-full items-center gap-4 border-b border-ink/20 text-start transition-colors duration-150 hover:bg-teal-wash"
              >
                <span
                  dir="auto"
                  className="w-32 shrink-0 truncate font-display text-xs text-teal sm:w-40"
                >
                  {message.conversation}
                </span>
                <span
                  dir="auto"
                  className="min-w-0 flex-1 truncate font-body text-[15px] text-ink"
                >
                  {message.text}
                </span>
                <span className="meta-caps hidden shrink-0 text-[11px] text-body sm:inline">
                  {formatDate(message.sentAtMs)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Contact sheet — plain framed thumbnails, no filters at this size */}
      {data.sampleMedia.length > 0 ? (
        <section>
          <SectionHeader
            action={<GhostLink onClick={onOpenMedia}>Open media →</GhostLink>}
          >
            Contact sheet
          </SectionHeader>
          <p className="mt-1 font-body text-[15px] text-body">
            A quick strip of photographs from the archive — open Media for the
            full set.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {data.sampleMedia.map((item) => (
              <PhotoThumb
                key={item.rowId}
                zipPath={item.zipPath}
                readBlob={readBlob}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Frequent correspondents — ledger rows */}
      {data.topPeople.length > 0 ? (
        <section>
          <SectionHeader
            action={<GhostLink onClick={onOpenPeople}>Full index →</GhostLink>}
          >
            Frequent correspondents
          </SectionHeader>
          <p className="mt-1 font-body text-[15px] text-body">
            The people you wrote to most — click a name to open their file.
          </p>
          <div className="mt-4">
            {data.topPeople.map((person) => (
              <button
                key={`${person.platform}:${person.conversation}`}
                type="button"
                onClick={() => onOpenPerson(person.conversation)}
                className="flex h-12 w-full items-center justify-between gap-4 border-b border-ink/20 text-start transition-colors duration-150 hover:bg-teal-wash"
              >
                <span dir="auto" className="min-w-0 truncate font-display text-xs text-ink">
                  {person.conversation}
                </span>
                <span className="font-display text-xs text-body">
                  {formatNumber(person.messageCount)}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* Orientation + the screen's single raised element */}
      <section className="space-y-4" id="surprise-memory">
        <p className="font-body text-[15px] font-medium text-ink/85">
          Pull one random message or photo onto the desk — press again for
          another.
        </p>
        <PressButton
          type="button"
          onClick={onSurprise}
          disabled={surpriseLoading}
        >
          {surpriseLoading
            ? "Finding a memory…"
            : "Show me a random memory"}
        </PressButton>
        {surpriseEmpty && !surprise && !surpriseLoading ? (
          <p className="font-body text-[15px] font-medium text-ink/75" role="status">
            No memory matched the current filters — try again or clear filters.
          </p>
        ) : null}
        {surprise ? (
          <figure className="border border-ink/25 bg-cream/60 px-4 py-4">
            <figcaption className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/75">
              Random memory ·{" "}
              <button
                type="button"
                dir="auto"
                className="text-teal hover:underline"
                onClick={() => onOpenPerson(surprise.conversation)}
              >
                {surprise.conversation}
              </button>{" "}
              · {formatDate(surprise.sentAtMs)} · {surprise.sender}
            </figcaption>
            {surprise.text ? (
              <blockquote
                dir="auto"
                className="mt-3 font-body text-[16px] font-medium leading-7 text-ink"
              >
                “{surprise.text}”
              </blockquote>
            ) : null}
            {surprise.mediaRef ? (
              <div className="mt-3 max-w-[12rem]">
                <PhotoThumb
                  zipPath={surprise.mediaRef}
                  readBlob={readBlob}
                />
              </div>
            ) : null}
            <button
              type="button"
              className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-teal hover:underline"
              onClick={onSurprise}
              disabled={surpriseLoading}
            >
              Another memory
            </button>
          </figure>
        ) : null}
      </section>
    </div>
  );
}
