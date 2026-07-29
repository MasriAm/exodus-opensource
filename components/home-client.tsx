"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";

import {
  consumeSessionFlash,
  useArchiveSession,
} from "@/components/archive-session";
import { HomeShell } from "@/components/home-shell";
import {
  loadSyntheticInstagramFile,
  preloadSyntheticInstagram,
} from "@/lib/demo-archive";
import type { IngestProgress, IngestSummary } from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";
import {
  FALLBACK_LOADING_CAPTIONS,
  loadLoadingCaptions,
} from "@/lib/loading-captions";

const STAGE_PERCENT: Record<IngestProgress["stage"], number> = {
  initializing: 4,
  opening: 12,
  detecting: 20,
  parsing: 45,
  loading: 75,
  finalizing: 94,
};

/** Soft floor so a 1–2s ingest still gets one full beat of the scene. */
const MIN_LOADING_SCENE_MS = 2800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function preloadSceneImages(): void {
  for (const scene of FALLBACK_LOADING_CAPTIONS.scenes) {
    const image = new Image();
    image.decoding = "async";
    image.src = scene.path;
  }
}

export function HomeClient() {
  const router = useRouter();
  const { api, markIngesting, markLive, markReady } = useArchiveSession();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [progressPercent, setProgressPercent] = useState<number>();
  const [error, setError] = useState<string | null>(null);
  const [queuedExports, setQueuedExports] = useState<{ file: File; platform: string }[]>([]);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const flash = consumeSessionFlash();
    if (flash) {
      setError(flash);
    }
  }, []);

  useEffect(() => {
    preloadSyntheticInstagram();
    void loadLoadingCaptions();
    preloadSceneImages();
  }, []);

  const importArchives = useCallback(
    async (exportsToProcess: { file: File; platform: string }[], sceneStartedAt = performance.now()) => {
      if (!api) {
        setError("The private worker is still starting. Try again in a moment.");
        setBusy(false);
        setProgress(null);
        setProgressPercent(undefined);
        return;
      }
      setBusy(true);
      setError(null);
      const initial: IngestProgress = {
        stage: "initializing",
        label: "Preparing the private worker…",
        done: 0,
        total: null,
        rows: { messages: 0, media: 0, events: 0 },
      };
      setProgress(initial);
      setProgressPercent(2);
      markIngesting(initial);
      
      let totalCounts: IngestSummary["counts"] = { messages: 0, media: 0, events: 0 };
      let lastSummary: IngestSummary | null = null;
      const totalFiles = exportsToProcess.length;

      try {
        for (let i = 0; i < totalFiles; i++) {
          const { file } = exportsToProcess[i];
          const append = i > 0;
          const progressOffset = (i / totalFiles) * 100;
          const progressScale = 1 / totalFiles;

          const summary = await api.ingest(file, (next) => {
            setProgress({
                ...next,
                label: `[${i + 1}/${totalFiles}] ${next.label}`
            });
            markIngesting(next);
            
            const stageFloor = STAGE_PERCENT[next.stage];
            const measuredPercent =
              next.total !== null && next.total > 0
                ? Math.round((next.done / next.total) * 100)
                : stageFloor;
            const blended = Math.max(stageFloor, measuredPercent);
            
            setProgressPercent((previous) => {
                const scaledBlended = progressOffset + (blended * progressScale);
                return Math.min(98, Math.max(previous ?? 2, scaledBlended, 2));
            });
          }, { append });
          
          totalCounts.messages += summary.counts.messages;
          totalCounts.media += summary.counts.media;
          totalCounts.events += summary.counts.events;
          lastSummary = summary;
        }
        
        if (!lastSummary) throw new Error("No exports processed");
        lastSummary.counts = totalCounts;

        setProgress({
          stage: "finalizing",
          label: `Ready: ${totalCounts.messages.toLocaleString()} messages`,
          done: 1,
          total: 1,
          rows: totalCounts,
        });
        setProgressPercent(100);

        const remaining = Math.max(
          0,
          MIN_LOADING_SCENE_MS - (performance.now() - sceneStartedAt),
        );
        if (remaining > 0) {
          await sleep(remaining);
        }

        flushSync(() => {
          markLive(lastSummary!);
        });
        router.push("/wrapped");
      } catch (ingestError: unknown) {
        console.error("Could not import the selected archives.", ingestError);
        markReady();
        setError(
          friendlyError(
            ingestError,
            "The archive could not be imported. Check the export format and try again.",
          ),
        );
        setBusy(false);
        setProgress(null);
        setProgressPercent(undefined);
      }
    },
    [api, markIngesting, markLive, markReady, router],
  );

  const handleFileDropped = useCallback(
    async (file: File) => {
      if (!api) {
        setError("The private worker is still starting. Try again in a moment.");
        return;
      }
      setDetecting(true);
      setError(null);
      try {
        const platform = await api.detectArchive(file);
        if (platform) {
          setQueuedExports((current) => [...current, { file, platform }]);
        } else {
          setError(
            "The archive could not be recognized. Check the export format and try again.",
          );
        }
      } catch (err: unknown) {
        console.error("Format detection failed", err);
        setError("An error occurred while detecting the archive format.");
      } finally {
        setDetecting(false);
      }
    },
    [api],
  );

  const confirmImport = useCallback(() => {
    if (queuedExports.length > 0) {
      void importArchives(queuedExports);
      setQueuedExports([]);
    }
  }, [importArchives, queuedExports]);

  const removeExport = useCallback((index: number) => {
    setQueuedExports((current) => current.filter((_, i) => i !== index));
  }, []);

  const importDemo = useCallback(async () => {
    const sceneStartedAt = performance.now();
    setBusy(true);
    setError(null);
    setProgress({
      stage: "opening",
      label: "Loading the synthetic export…",
      done: 0,
      total: null,
      rows: { messages: 0, media: 0, events: 0 },
    });
    setProgressPercent(5);

    try {
      const file = await loadSyntheticInstagramFile();
      setProgress({
        stage: "opening",
        label: "Opening the synthetic export…",
        done: 0,
        total: null,
        rows: { messages: 0, media: 0, events: 0 },
      });
      setProgressPercent(8);
      await importArchives([{ file, platform: "Instagram" }], sceneStartedAt);
    } catch (demoError: unknown) {
      console.error("Could not load the synthetic export.", demoError);
      markReady();
      setError(
        friendlyError(
          demoError,
          "The synthetic export could not be loaded. Run `npm run fixtures`, then refresh.",
        ),
      );
      setBusy(false);
      setProgress(null);
      setProgressPercent(undefined);
    }
  }, [importArchives, markReady]);

  return (
    <HomeShell
      busy={busy || detecting}
      workerReady={Boolean(api)}
      progress={progress}
      progressPercent={progressPercent}
      error={error}
      queuedExports={queuedExports}
      onConfirmImport={confirmImport}
      onRemoveExport={removeExport}
      onFile={handleFileDropped}
      onDemo={() => void importDemo()}
    />
  );
}
