"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { WrappedDeck, type WrappedDeckData } from "@/components/wrapped-deck";
import { usePlatformTheme } from "@/components/use-platform-theme";
import type { IngestApi } from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";
import {
  resolvePlatformTheme,
  type PlatformThemeId,
} from "@/lib/platform-theme";
import { buildReport } from "@/lib/drama/verdicts";
import type { DramaMessage, DramaReport } from "@/lib/drama/types";

type WrappedClientProps = {
  api: IngestApi;
};

/** Cap on rows pulled out of DuckDB for the drama slides. */
const CORPUS_LIMIT = 60_000;

export function WrappedClient({ api }: WrappedClientProps) {
  const [data, setData] = useState<WrappedDeckData | null>(null);
  const [drama, setDrama] = useState<DramaReport | null>(null);
  const [theme, setTheme] = useState<PlatformThemeId>("archive");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const readMediaBlob = useCallback(
    (zipPath: string) => api.readMediaBlob(zipPath),
    [api],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    const load = async () => {
      const result = await api.query("wrappedStats");
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

      // The skin and the drama slides are both extras: a failure in either
      // must not cost somebody their Wrapped, so they are loaded after the
      // deck data is already committed and their errors stay local.
      try {
        const options = await api.query("filterOptions");
        if (active) {
          setTheme(resolvePlatformTheme(options.platforms));
        }
      } catch (themeError: unknown) {
        console.error("Could not resolve the capsule theme.", themeError);
      }

      try {
        const corpus = await api.query("dramaCorpus", { limit: CORPUS_LIMIT });
        if (!active) {
          return;
        }
        const selfKeys = new Set(
          [corpus.selfSender, corpus.ownerName]
            .filter((value): value is string => Boolean(value))
            .map((value) => value.trim().toLocaleLowerCase()),
        );
        const messages: DramaMessage[] = corpus.messages.map((row) => ({
          id: row.rowId,
          platform: row.platform,
          conversation: row.conversation,
          sender: row.sender,
          sentAtMs: row.sentAtMs,
          text: row.text,
          isSelf: selfKeys.has(row.sender.trim().toLocaleLowerCase()),
        }));
        setDrama(
          buildReport(messages, {
            ownerLabel: corpus.ownerName ?? corpus.selfSender ?? "you",
            totalMessages: corpus.totalMessages,
            nowMs: Date.now(),
          }),
        );
      } catch (dramaError: unknown) {
        console.error("Could not read the archive for the drama slides.", dramaError);
      }
    };

    void load()
      .catch((queryError: unknown) => {
        console.error("Could not calculate Wrapped statistics.", queryError);
        if (active) {
          setError(
            friendlyError(
              queryError,
              "The local archive statistics could not be calculated.",
            ),
          );
          // Nothing about this archive ever reaches us, so the only person who
          // can see why it failed is the person looking at the screen.
          setErrorDetail(
            queryError instanceof Error ? queryError.message : String(queryError),
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

  usePlatformTheme(theme);

  const stableRead = useMemo(() => readMediaBlob, [readMediaBlob]);

  return (
    <WrappedDeck
      data={data}
      drama={drama}
      theme={theme}
      loading={loading}
      error={error}
      errorDetail={errorDetail}
      readMediaBlob={stableRead}
    />
  );
}
