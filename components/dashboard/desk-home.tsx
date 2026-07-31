"use client";

import { useRef } from "react";
import { Search } from "lucide-react";

import { PhotoThumb } from "@/components/capsule/photo-thumb";
import { PressButton } from "@/components/capsule/press-button";
import { ArchivePanel, StatCard } from "@/components/dashboard/archive-panel";
import { UserText } from "@/components/user-text";
import { formatDate, formatNumber, pluralize } from "@/lib/format";
import type { DeskHomeResult, MessageItem } from "@/lib/db/types";

type DeskHomeProps = {
  data: DeskHomeResult;
  readBlob: (zipPath: string) => Promise<Blob>;
  onOpenPeople: () => void;
  onOpenSearch: (query?: string) => void;
  onOpenPerson: (conversation: string) => void;
  onOpenMessage: (conversation: string, message: MessageItem) => void;
  onOpenActivity: () => void;
  onOpenMedia: () => void;
  onSurprise: () => void;
  surprise: MessageItem | null;
  surpriseLoading?: boolean;
  surpriseEmpty?: boolean;
};

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
      className="font-display text-[11px] font-bold uppercase tracking-[0.08em] text-teal transition-colors hover:text-ink hover:underline hover:underline-offset-4"
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
  onOpenMessage,
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
      : "—";

  const monthName = new Date(
    Date.UTC(2000, data.onThisDayMonth - 1, 1),
  ).toLocaleString("en", { month: "long", timeZone: "UTC" });

  const featured = data.onThisDayMessages[0] ?? null;
  const contactSheet = data.sampleMedia.slice(0, 5);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Messages" value={formatNumber(data.messages)} />
        <StatCard
          label="Photographs"
          value={formatNumber(data.media)}
        />
        <StatCard
          label="Threads"
          value={formatNumber(data.conversations)}
        />
        <StatCard label="Years spanned" value={yearsLabel} />
      </div>

      <label className="archive-panel flex items-center gap-3 px-4 py-3 sm:px-5">
        <Search aria-hidden="true" className="size-4 shrink-0 text-ink/60" />
        <input
          ref={searchRef}
          dir="auto"
          placeholder="Search the archive…"
          className="min-w-0 flex-1 bg-transparent font-body text-[15px] font-medium text-ink outline-none placeholder:text-ink/50"
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {featured ? (
          <ArchivePanel
            title={`On this day (${new Date().getFullYear()})`}
            subtitle={`${monthName} ${data.onThisDayDay} · ${pluralize(data.onThisDayMessageCount, "message")} across the years`}
            action={<GhostLink onClick={onOpenActivity}>See all →</GhostLink>}
          >
            <button
              type="button"
              className="group text-start focus:outline-none"
              onClick={() => onOpenMessage(featured.conversation, featured)}
            >
              <blockquote
                dir="auto"
                className="font-body text-xl font-medium leading-8 text-ink sm:text-2xl transition-colors group-hover:text-teal"
              >
                “{featured.text ?? "Media attachment"}”
              </blockquote>
            </button>
            <p className="mt-4 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
              Sent to:{" "}
              <button
                type="button"
                dir="auto"
                className="text-teal transition-colors hover:text-ink hover:underline"
                onClick={() => onOpenMessage(featured.conversation, featured)}
              >
                @{featured.conversation}
              </button>
              {" · "}
              {formatDate(featured.sentAtMs)}
            </p>
            {data.onThisDayMessages.length > 1 ? (
              <ul className="mt-5 space-y-0 border-t border-ink/20 pt-3">
                {data.onThisDayMessages.slice(1).map((message) => (
                  <li key={message.rowId}>
                    <button
                      type="button"
                      onClick={() => onOpenMessage(message.conversation, message)}
                      className="interactive-row flex w-full items-baseline justify-between gap-3 border-b border-ink/15 py-2.5 text-start last:border-b-0"
                    >
                      <span
                        dir="auto"
                        className="min-w-0 truncate font-body text-[15px] text-ink"
                      >
                        {message.text ?? "Media attachment"}
                      </span>
                      <UserText className="shrink-0 font-body text-[10px] font-medium text-ink/65">
                        {message.conversation}
                      </UserText>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </ArchivePanel>
        ) : (
          <ArchivePanel
            title="On this day"
            subtitle="Nothing landed on this calendar date in the years you wrote."
          >
            <p className="font-body text-[15px] text-ink/75">
              Open the calendar to wander other days.
            </p>
          </ArchivePanel>
        )}

        <ArchivePanel
          title="The cringe"
          subtitle="A random memory from the archive — press again for another."
        >
          <div id="surprise-memory" className="space-y-4">
            {surpriseEmpty && !surprise && !surpriseLoading ? (
              <p
                className="font-body text-[15px] font-medium text-ink/75"
                role="status"
              >
                No memory matched — try again.
              </p>
            ) : null}
            {surprise ? (
              <figure>
                <button
                  type="button"
                  className="group text-start focus:outline-none"
                  onClick={() => onOpenMessage(surprise.conversation, surprise)}
                >
                  <blockquote
                    dir="auto"
                    className="font-body text-xl font-medium leading-8 text-ink transition-colors group-hover:text-teal"
                  >
                    “{surprise.text ?? "Media attachment"}”
                  </blockquote>
                </button>
                <figcaption className="mt-3 font-display text-[11px] font-bold uppercase tracking-[0.08em] text-ink/70">
                  <button
                    type="button"
                    dir="auto"
                    className="text-teal transition-colors hover:text-ink hover:underline"
                    onClick={() => onOpenMessage(surprise.conversation, surprise)}
                  >
                    @{surprise.conversation}
                  </button>
                  {" · "}
                  {formatDate(surprise.sentAtMs)}
                </figcaption>
                {surprise.mediaRef ? (
                  <div className="mt-3 max-w-[10rem]">
                    <PhotoThumb
                      zipPath={surprise.mediaRef}
                      readBlob={readBlob}
                    />
                  </div>
                ) : null}
              </figure>
            ) : null}
            <PressButton
              type="button"
              onClick={onSurprise}
              disabled={surpriseLoading}
              className="w-full sm:w-auto"
            >
              {surpriseLoading
                ? "Finding a memory…"
                : "Show me a random memory"}
            </PressButton>
          </div>
        </ArchivePanel>
      </div>

      {contactSheet.length > 0 ? (
        <ArchivePanel
          title="Archived media (recent)"
          subtitle="A quick strip of photographs from the archive — open Media for the full set."
          action={<GhostLink onClick={onOpenMedia}>View all →</GhostLink>}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            {contactSheet.map((item) => (
              <button
                key={item.rowId}
                type="button"
                onClick={onOpenMedia}
                className="text-start transition-transform hover:-translate-y-0.5"
              >
                <PhotoThumb zipPath={item.zipPath} readBlob={readBlob} />
                {item.takenAtMs !== null ? (
                  <p className="mt-1.5 font-display text-[10px] font-bold uppercase tracking-[0.06em] text-ink/70">
                    {formatDate(item.takenAtMs)}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        </ArchivePanel>
      ) : null}

      {data.topPeople.length > 0 ? (
        <ArchivePanel
          title="Frequent correspondents"
          subtitle="The people you wrote to most — click a name to open their file."
          action={<GhostLink onClick={onOpenPeople}>Full index →</GhostLink>}
        >
          <ul>
            {data.topPeople.map((person) => (
              <li key={`${person.platform}:${person.conversation}`}>
                <button
                  type="button"
                  onClick={() => onOpenPerson(person.conversation)}
                  className="interactive-row flex h-12 w-full items-center justify-between gap-4 border-b border-ink/20 text-start last:border-b-0"
                >
                  <span
                    dir="auto"
                    className="min-w-0 truncate font-body text-[15px] font-medium text-ink"
                  >
                    {person.conversation}
                  </span>
                  <span className="shrink-0 font-display text-xs font-bold text-ink/70">
                    {formatNumber(person.messageCount)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ArchivePanel>
      ) : null}
    </div>
  );
}
