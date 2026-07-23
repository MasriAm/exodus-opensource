"use client";

import { PhotoThumb } from "@/components/capsule/photo-thumb";
import { StatePanel } from "@/components/state-panel";
import { formatDate, formatNumber } from "@/lib/format";
import type { PeopleListItem, PersonDetailResult } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type PeopleViewProps = {
  people: PeopleListItem[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  detail: PersonDetailResult | null;
  detailLoading: boolean;
  onSelect: (conversation: string) => void;
  onOpenMessages: (conversation: string) => void;
  readBlob: (zipPath: string) => Promise<Blob>;
};

export function PeopleView({
  people,
  loading,
  error,
  selected,
  detail,
  detailLoading,
  onSelect,
  onOpenMessages,
  readBlob,
}: PeopleViewProps) {
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
    <div className="space-y-6">
      <p className="font-body text-[15px] leading-7 text-body">
        Everyone you wrote with, ranked by volume. Pick a name to see the shape
        of the thread — first words, streaks, and shared photos.
      </p>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <ul className="border-y border-ink/20">
          {people.map((person) => (
            <li key={`${person.platform}:${person.conversation}`}>
              <button
                type="button"
                onClick={() => onSelect(person.conversation)}
                className={cn(
                  "flex h-12 w-full items-center justify-between gap-3 border-b border-ink/20 text-start transition-colors duration-150 last:border-b-0",
                  selected === person.conversation
                    ? "bg-teal-wash"
                    : "hover:bg-cream",
                )}
              >
                <span
                  dir="auto"
                  className="min-w-0 truncate font-display text-xs text-ink"
                >
                  {person.conversation}
                </span>
                <span className="shrink-0 font-display text-xs text-body">
                  {formatNumber(person.messageCount)}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div>
          {detailLoading || !detail ? (
            <StatePanel
              kind="loading"
              title="Pulling the file"
              description="Computing streaks, silence, and shared media."
            />
          ) : (
            <div className="space-y-8">
              <div>
                <h2
                  className="font-display text-[17px] font-bold text-ink"
                  dir="auto"
                >
                  {detail.conversation}
                </h2>
                <p className="mt-2 font-body text-[15px] text-body">
                  {detail.platform ? `${detail.platform} · ` : null}
                  {formatNumber(detail.messageCount)} messages ·{" "}
                  {formatNumber(detail.participantCount)} senders
                </p>
                <button
                  type="button"
                  className="mt-3 font-display text-[11px] uppercase tracking-[0.08em] text-teal hover:underline"
                  onClick={() => onOpenMessages(detail.conversation)}
                >
                  Open conversation →
                </button>
              </div>

              <dl className="border-y border-ink/20">
                {(
                  [
                    detail.firstMessageAtMs
                      ? {
                          label: "First message",
                          value: formatDate(detail.firstMessageAtMs),
                        }
                      : null,
                    detail.lastMessageAtMs
                      ? {
                          label: "Last message",
                          value: formatDate(detail.lastMessageAtMs),
                        }
                      : null,
                    {
                      label: "Longest streak",
                      value: `${formatNumber(detail.longestStreakDays)} days`,
                    },
                    detail.longestSilenceDays > 0
                      ? {
                          label: "Longest silence",
                          value: `${formatNumber(detail.longestSilenceDays)} days`,
                        }
                      : null,
                  ] as const
                )
                  .filter(
                    (row): row is { label: string; value: string } => row !== null,
                  )
                  .map((row) => (
                    <div
                      key={row.label}
                      className="flex items-baseline justify-between gap-4 border-b border-ink/20 py-3 last:border-b-0"
                    >
                      <dt className="font-display text-[11px] uppercase tracking-[0.08em] text-ink/70">
                        {row.label}
                      </dt>
                      <dd className="text-end font-body text-[15px] font-medium text-ink">
                        {row.value}
                      </dd>
                    </div>
                  ))}
              </dl>

              {detail.senderBalance.length > 0 ? (
                <section>
                  <h3 className="font-display text-[17px] font-bold text-ink">
                    {">>"} Who wrote
                  </h3>
                  <p className="mt-1 font-body text-[15px] text-body">
                    Message count by sender in this thread.
                  </p>
                  <ul className="mt-4 border-y border-ink/20">
                    {detail.senderBalance.map((row) => (
                      <li
                        key={row.sender}
                        className="flex h-12 items-center justify-between gap-3 border-b border-ink/20 last:border-b-0"
                      >
                        <span dir="auto" className="truncate font-display text-xs text-ink">
                          {row.sender}
                        </span>
                        <span className="font-display text-xs text-body">
                          {formatNumber(row.messageCount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail.monthlyVolume.length > 0 ? (
                <section>
                  <h3 className="font-display text-[17px] font-bold text-ink">
                    {">>"} Volume by month
                  </h3>
                  <p className="mt-1 font-body text-[15px] text-body">
                    How dense the months were — ink bars, not a chart library.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {detail.monthlyVolume.map((row) => {
                      const max = Math.max(
                        ...detail.monthlyVolume.map((entry) => entry.messageCount),
                        1,
                      );
                      const width = Math.max(
                        4,
                        Math.round((row.messageCount / max) * 100),
                      );
                      return (
                        <li key={row.monthStartMs} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3">
                          <span className="font-display text-[11px] uppercase tracking-[0.06em] text-body">
                            {formatDate(row.monthStartMs)}
                          </span>
                          <div className="h-2 bg-ink/10">
                            <div
                              className="h-full bg-heat-3"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <span className="w-10 text-end font-display text-xs text-ink">
                            {formatNumber(row.messageCount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {detail.firstMessage ? (
                <section className="border-y border-ink/20 py-4">
                  <h3 className="font-display text-[17px] font-bold text-ink">
                    {">>"} First words
                  </h3>
                  <p className="mt-3 font-body text-[15px] leading-7 text-ink" dir="auto">
                    “{detail.firstMessage.text}”
                  </p>
                </section>
              ) : null}

              {detail.media.length > 0 ? (
                <section>
                  <h3 className="font-display text-[17px] font-bold text-ink">
                    {">>"} Shared photographs
                  </h3>
                  <p className="mt-1 font-body text-[15px] text-body">
                    Media that traveled in this conversation.
                  </p>
                  <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {detail.media.map((item) => (
                      <PhotoThumb
                        key={item.rowId}
                        zipPath={item.zipPath}
                        readBlob={readBlob}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
