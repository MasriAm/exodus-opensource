"use client";

import { useEffect, useMemo, useState } from "react";

import { friendlyError } from "@/lib/errors";
import type { IngestApi } from "@/lib/db/types";
import { buildReport } from "@/lib/drama/verdicts";
import { buildTemplateMessages, TEMPLATE_OWNER } from "@/lib/drama/template-data";
import type { DramaMessage, DramaReport } from "@/lib/drama/types";

/** Cap on rows pulled out of DuckDB; the report says so when it bites. */
const CORPUS_LIMIT = 60_000;

export interface DramaReportState {
  report: DramaReport | null;
  loading: boolean;
  error: string | null;
  /** Conversation and sender names, for share-safe redaction. */
  names: string[];
  truncated: boolean;
  snapCount: number;
}

/** The fictional corpus, built once — nothing about it depends on the worker. */
export function useTemplateReport(): DramaReport {
  return useMemo(
    () =>
      buildReport(buildTemplateMessages(), {
        isDemo: true,
        ownerLabel: TEMPLATE_OWNER,
      }),
    [],
  );
}

/**
 * Read the live archive and run the same engine over it.
 *
 * "Which sender is you" is inferred the way the rest of the app does it — the
 * sender appearing in the most conversations — with the parser-recorded owner
 * name as a second signal, since an export usually knows its own owner.
 */
export function useArchiveReport(api: IngestApi | null): DramaReportState {
  const [state, setState] = useState<DramaReportState>({
    report: null,
    loading: true,
    error: null,
    names: [],
    truncated: false,
    snapCount: 0,
  });

  useEffect(() => {
    if (!api) {
      return;
    }

    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    void api
      .query("dramaCorpus", { limit: CORPUS_LIMIT })
      .then((corpus) => {
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

        const names = Array.from(
          new Set([
            ...corpus.messages.map((row) => row.conversation),
            ...corpus.messages.map((row) => row.sender),
          ]),
        );

        setState({
          report: buildReport(messages, {
            isDemo: false,
            ownerLabel: corpus.ownerName ?? corpus.selfSender ?? "you",
            totalMessages: corpus.totalMessages,
            // Real archives are historical; measure silence against today so
            // "quiet for two years" keeps being true after the export was made.
            nowMs: Date.now(),
          }),
          loading: false,
          error: null,
          names,
          truncated: corpus.truncated,
          snapCount: corpus.snapCount,
        });
      })
      .catch((queryError: unknown) => {
        console.error("Could not build the Receipts report.", queryError);
        if (!active) {
          return;
        }
        setState({
          report: null,
          loading: false,
          error: friendlyError(
            queryError,
            "Your messages could not be read for this report.",
          ),
          names: [],
          truncated: false,
          snapCount: 0,
        });
      });

    return () => {
      active = false;
    };
  }, [api]);

  return state;
}
