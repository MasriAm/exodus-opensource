"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CapsuleCard } from "@/components/capsule/card";
import { Mark } from "@/components/capsule/mark";
import { PressButton } from "@/components/capsule/press-button";
import { Receipt } from "@/components/capsule/receipt";
import { StatePanel } from "@/components/state-panel";
import { VintagePhoto } from "@/components/capsule/vintage-photo";
import { formatDate, formatNumber } from "@/lib/format";
import type {
  PeopleListItem,
  PersonDetailResult,
} from "@/lib/db/types";

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

function MediaThumb({
  zipPath,
  readBlob,
}: {
  zipPath: string;
  readBlob: (zipPath: string) => Promise<Blob>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let created: string | null = null;
    void readBlob(zipPath)
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        created = next;
        setUrl(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [zipPath, readBlob]);
  return (
    <VintagePhoto compact className="w-full">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="target-photo aspect-square w-full object-cover" />
      ) : (
        <div className="aspect-square bg-paper" />
      )}
    </VintagePhoto>
  );
}

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
    return <StatePanel kind="error" title="People index unavailable" description={error} />;
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
    return null;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="space-y-2">
        {people.map((person) => (
          <button
            key={`${person.platform}:${person.conversation}`}
            type="button"
            onClick={() => onSelect(person.conversation)}
            className={`w-full border-strong p-3 text-start shadow-press transition ${
              selected === person.conversation
                ? "bg-ink text-cream"
                : "bg-cream text-ink hover:-translate-y-0.5"
            }`}
          >
            <p className="font-display text-sm" dir="auto">
              {person.conversation}
            </p>
            <p
              className={`mt-1 font-body text-xs ${
                selected === person.conversation ? "text-cream/80" : "text-body"
              }`}
            >
              {formatNumber(person.messageCount)} messages
            </p>
          </button>
        ))}
      </div>

      <div>
        {detailLoading || !detail ? (
          <StatePanel
            kind="loading"
            title="Pulling the file"
            description="Computing streaks, silence, and shared media."
          />
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink" dir="auto">
                {detail.conversation}
              </h2>
              <p className="mt-2 font-body text-body">
                {detail.platform ? <Mark variant="dark">{detail.platform}</Mark> : null}{" "}
                {formatNumber(detail.messageCount)} messages ·{" "}
                {formatNumber(detail.participantCount)} senders
              </p>
              <PressButton
                className="mt-4"
                type="button"
                onClick={() => onOpenMessages(detail.conversation)}
              >
                Open conversation
              </PressButton>
            </div>

            <Receipt
              title="Correspondence"
              rows={[
                ...(detail.firstMessageAtMs
                  ? [
                      {
                        label: "First message",
                        value: formatDate(detail.firstMessageAtMs),
                      },
                    ]
                  : []),
                ...(detail.lastMessageAtMs
                  ? [
                      {
                        label: "Last message",
                        value: formatDate(detail.lastMessageAtMs),
                      },
                    ]
                  : []),
                {
                  label: "Longest streak",
                  value: `${formatNumber(detail.longestStreakDays)} days`,
                },
                ...(detail.longestSilenceDays > 0
                  ? [
                      {
                        label: "Longest silence",
                        value: `${formatNumber(detail.longestSilenceDays)} days`,
                      },
                    ]
                  : []),
              ]}
            />

            {detail.senderBalance.length > 0 ? (
              <CapsuleCard className="p-4">
                <p className="meta-caps mb-3 text-body">Who messaged whom</p>
                <ul className="space-y-2">
                  {detail.senderBalance.map((row) => (
                    <li
                      key={row.sender}
                      className="flex justify-between gap-3 border-b border-ink/15 pb-2 font-body text-sm"
                    >
                      <span dir="auto">{row.sender}</span>
                      <span>{formatNumber(row.messageCount)}</span>
                    </li>
                  ))}
                </ul>
              </CapsuleCard>
            ) : null}

            {detail.monthlyVolume.length > 0 ? (
              <CapsuleCard className="p-4">
                <p className="meta-caps mb-3 text-body">Volume over time</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={detail.monthlyVolume.map((row) => ({
                        label: formatDate(row.monthStartMs),
                        count: row.messageCount,
                      }))}
                    >
                      <XAxis dataKey="label" hide />
                      <YAxis hide />
                      <Tooltip />
                      <Bar dataKey="count" fill="var(--teal)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CapsuleCard>
            ) : null}

            {detail.firstMessage ? (
              <CapsuleCard className="p-4">
                <p className="meta-caps text-body">First words</p>
                <p className="mt-2 font-body text-ink" dir="auto">
                  {detail.firstMessage.text}
                </p>
              </CapsuleCard>
            ) : null}

            {detail.media.length > 0 ? (
              <div>
                <p className="meta-caps mb-3 text-body">Shared media</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {detail.media.map((item) => (
                    <MediaThumb
                      key={item.rowId}
                      zipPath={item.zipPath}
                      readBlob={readBlob}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
