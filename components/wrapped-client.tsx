"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { WrappedDeck, type WrappedDeckData } from "@/components/wrapped-deck";
import type { IngestApi } from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";

type WrappedClientProps = {
  api: IngestApi;
};

export function WrappedClient({ api }: WrappedClientProps) {
  const [data, setData] = useState<WrappedDeckData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const readMediaBlob = useCallback(
    (zipPath: string) => api.readMediaBlob(zipPath),
    [api],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void api
      .query("wrappedStats")
      .then((result) => {
        if (!active) {
          return;
        }
        setData({
          fallbackUsername: result.fallbackUsername,
          totalMessages: result.totalMessages,
          totalMedia: result.totalMedia,
          activeFromMs: result.activeFromMs,
          activeToMs: result.activeToMs,
          topContacts: result.topContacts.map((contact) => ({
            conversation: contact.conversation,
            count: contact.messageCount,
          })),
          messagesByHour: result.messagesByHour.map((hour) => ({
            hour: hour.hour,
            count: hour.messageCount,
          })),
          peakHour: result.peakHour,
          threeAmEraMessages: result.threeAmEraMessages,
          busiestDay: result.busiestDay,
          topWords: result.topWords,
          firstMessage: result.firstMessage
            ? {
                text: result.firstMessage.text,
                sentAtMs: result.firstMessage.sentAtMs,
                conversation: result.firstMessage.conversation,
              }
            : null,
          longestStreakDays: result.longestStreak?.days ?? 0,
          longestMutualFollows: result.longestMutualFollows.slice(0, 3),
          longestConversation: result.longestConversation
            ? {
                conversation: result.longestConversation.conversation,
                count: result.longestConversation.messageCount,
              }
            : null,
          mostTypedWord: result.mostTypedWord,
          longestCall: result.longestCall,
          cringeComments: result.cringeComments,
          interestsByYear: result.interestsByYear,
          profileHistory: result.profileHistory,
          oldestImages: result.oldestImages,
        });
      })
      .catch((queryError: unknown) => {
        console.error("Could not calculate Wrapped statistics.", queryError);
        if (active) {
          setError(
            friendlyError(
              queryError,
              "The local archive statistics could not be calculated.",
            ),
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [api]);

  const stableRead = useMemo(() => readMediaBlob, [readMediaBlob]);

  return (
    <WrappedDeck
      data={data}
      loading={loading}
      error={error}
      readMediaBlob={stableRead}
    />
  );
}
