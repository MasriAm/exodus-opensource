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

      {/* The screen's single raised element */}
      <section>
        <PressButton type="button" onClick={onSurprise}>
          Surprise me
        </PressButton>
        {surprise ? (
          <figure className="mt-6 border-y border-ink/20 py-4">
            <figcaption className="meta-caps text-[11px] text-body">
              A random memory · <span dir="auto">{surprise.conversation}</span>{" "}
              · {formatDate(surprise.sentAtMs)}
            </figcaption>
            <blockquote
              dir="auto"
              className="mt-2 font-body text-[15px] leading-7 text-ink"
            >
              “{surprise.text}”
            </blockquote>
          </figure>
        ) : null}
      </section>
    </div>
  );
}
