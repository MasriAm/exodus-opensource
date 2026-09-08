"use client";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

import { useArchiveSession } from "@/components/archive-session";
import type { IngestProgress, IngestSummary } from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";

const STAGE_PERCENT: Record<IngestProgress["stage"], number> = {
  initializing: 4,
  opening: 12,
  detecting: 20,
  parsing: 45,
  loading: 75,
  finalizing: 94,
};

export interface QueuedExport {
  file: File;
  platform: string;
}

export interface ArchiveImport {
  ready: boolean;
  busy: boolean;
  progress: IngestProgress | null;
  percent: number;
  error: string | null;
  queue: QueuedExport[];
  addFile: (file: File) => void;
  removeAt: (index: number) => void;
  start: () => void;
  setError: (message: string | null) => void;
}

/**
 * Drop-to-import for the Receipts route.
 *
 * Deliberately its own copy of the flow rather than a refactor of the home
 * page: this branch is meant to be evaluated without putting the shipped
 * dropzone at risk. Both paths call the same worker API underneath.
 */
export function useArchiveImport(destination: string): ArchiveImport {
  const router = useRouter();
  const { api, markIngesting, markLive, markReady } = useArchiveSession();

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedExport[]>([]);

  const addFile = useCallback(
    (file: File) => {
      if (!api) {
        setError("The private worker is still starting. Try again in a moment.");
        return;
      }
      if (!/\.zip$/i.test(file.name)) {
        setError("That needs to be the .zip file the app emailed you.");
        return;
      }

      setBusy(true);
      setError(null);
      void api
        .detectArchive(file)
        .then((platform) => {
          if (platform) {
            setQueue((current) => [...current, { file, platform }]);
          } else {
            setError(
              "We could not tell which app that export came from. Check it is the unzipped download, not a screenshot folder.",
            );
          }
        })
        .catch((detectError: unknown) => {
          console.error("Could not identify the archive.", detectError);
          setError("That archive could not be opened. Try downloading it again.");
        })
        .finally(() => setBusy(false));
    },
    [api],
  );

  const removeAt = useCallback((index: number) => {
    setQueue((current) => current.filter((_, position) => position !== index));
  }, []);

  const start = useCallback(() => {
    if (!api || queue.length === 0) {
      return;
    }

    const pending = queue;
    setQueue([]);
    setBusy(true);
    setError(null);

    const initial: IngestProgress = {
      stage: "initializing",
      label: "Starting the private worker…",
      done: 0,
      total: null,
      rows: { messages: 0, media: 0, events: 0 },
    };
    setProgress(initial);
    setPercent(2);
    markIngesting(initial);

    const run = async () => {
      const totals = { messages: 0, media: 0, events: 0 };
      let last: IngestSummary | null = null;

      try {
        for (let index = 0; index < pending.length; index += 1) {
          const offset = (index / pending.length) * 100;
          const scale = 1 / pending.length;

          const summary = await api.ingest(
            pending[index].file,
            (next) => {
              setProgress({
                ...next,
                label: `[${index + 1}/${pending.length}] ${next.label}`,
              });
              markIngesting(next);
              const floor = STAGE_PERCENT[next.stage];
              const measured =
                next.total !== null && next.total > 0
                  ? Math.round((next.done / next.total) * 100)
                  : floor;
              const blended = Math.max(floor, measured);
              setPercent((previous) =>
                Math.min(98, Math.max(previous, offset + blended * scale, 2)),
              );
            },
            { append: index > 0 },
          );

          totals.messages += summary.counts.messages;
          totals.media += summary.counts.media;
          totals.events += summary.counts.events;
          last = summary;
        }

        if (!last) {
          throw new Error("No exports were processed");
        }
        last.counts = totals;
        setPercent(100);

        flushSync(() => {
          markLive(last!);
        });
        router.push(destination);
      } catch (ingestError: unknown) {
        console.error("Could not import the selected archives.", ingestError);
        markReady();
        setError(
          friendlyError(
            ingestError,
            "That export could not be read. Check it is the full .zip and try again.",
          ),
        );
        setBusy(false);
        setProgress(null);
        setPercent(0);
      }
    };

    void run();
  }, [api, destination, markIngesting, markLive, markReady, queue, router]);

  return {
    ready: Boolean(api),
    busy,
    progress,
    percent,
    error,
    queue,
    addFile,
    removeAt,
    start,
    setError,
  };
}
