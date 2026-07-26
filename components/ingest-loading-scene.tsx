"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";

import { formatNumber } from "@/lib/format";
import {
  FALLBACK_LOADING_CAPTIONS,
  loadLoadingCaptions,
  pickCaption,
  sceneForProgress,
  type LoadingCaptions,
  type LoadingSceneId,
} from "@/lib/loading-captions";
import type { IngestProgress } from "@/lib/db/types";
import { cn } from "@/lib/utils";

const CAPTION_ROTATE_MS = 2800;

type IngestLoadingSceneProps = {
  progress: IngestProgress | null;
  progressPercent?: number;
  className?: string;
};

function Telemetry({
  progress,
  progressPercent,
}: {
  progress: IngestProgress | null;
  progressPercent?: number;
}) {
  const rows = progress?.rows;
  const percent =
    typeof progressPercent === "number"
      ? Math.min(100, Math.max(0, Math.round(progressPercent)))
      : null;

  return (
    <div className="w-full max-w-lg space-y-4">
      <div
        className="h-2 overflow-hidden border border-ink/20 bg-cream"
        role="progressbar"
        aria-label={progress?.label ?? "Import progress"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
      >
        <div
          className={cn(
            "h-full bg-ink transition-[width] duration-300 motion-reduce:transition-none",
            percent === null && "w-1/3 animate-pulse motion-reduce:animate-none",
          )}
          style={
            percent === null ? undefined : { width: `${Math.max(2, percent)}%` }
          }
        />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <p className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
          {progress?.label ?? "Preparing the private worker…"}
        </p>
        {percent !== null ? (
          <p className="font-display text-[11px] tracking-[0.08em] text-ink">
            {percent}%
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-ink/20 pt-4">
        {(
          [
            ["messages", rows?.messages ?? 0],
            ["media", rows?.media ?? 0],
            ["events", rows?.events ?? 0],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="text-center sm:text-start">
            <dt className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
              {label}
            </dt>
            <dd className="mt-1 font-display text-[17px] font-bold text-ink">
              {formatNumber(value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SceneArt({
  scenes,
  activeId,
  reduceMotion,
}: {
  scenes: ReadonlyArray<{ id: LoadingSceneId; path: string }>;
  activeId: LoadingSceneId;
  reduceMotion: boolean | null;
}) {
  // Keep all GIFs mounted — remounting on scene change restarts them (blink).
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px] sm:max-w-[360px]">
      {scenes.map((scene) => {
        const active = scene.id === activeId;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={scene.id}
            src={scene.path}
            alt=""
            width={420}
            height={420}
            decoding="async"
            className={cn(
              "absolute inset-0 h-full w-full object-contain transition-opacity duration-500",
              active ? "opacity-100" : "pointer-events-none opacity-0",
              reduceMotion && "transition-none",
            )}
            style={{
              maskImage:
                "radial-gradient(circle at center, black 62%, transparent 100%)",
              WebkitMaskImage:
                "radial-gradient(circle at center, black 62%, transparent 100%)",
            }}
          />
        );
      })}
    </div>
  );
}

export function IngestLoadingScene({
  progress,
  progressPercent,
  className,
}: IngestLoadingSceneProps) {
  const reduceMotion = useReducedMotion();
  const [captions, setCaptions] = useState<LoadingCaptions>(
    FALLBACK_LOADING_CAPTIONS,
  );
  const [captionIndex, setCaptionIndex] = useState(0);

  useEffect(() => {
    let active = true;
    void loadLoadingCaptions().then((loaded) => {
      if (active) {
        setCaptions(loaded);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const targetSceneId = sceneForProgress(progressPercent);
  const [stickySceneId, setStickySceneId] = useState<LoadingSceneId>(
    targetSceneId,
  );

  useEffect(() => {
    const order: LoadingSceneId[] = ["dusting", "scroll", "cauldron"];
    setStickySceneId((current) => {
      const currentIndex = order.indexOf(current);
      const targetIndex = order.indexOf(targetSceneId);
      // Only advance — never rewind when progress oscillates.
      return targetIndex > currentIndex ? targetSceneId : current;
    });
  }, [targetSceneId]);

  const scene =
    captions.scenes.find((entry) => entry.id === stickySceneId) ??
    captions.scenes[0] ??
    FALLBACK_LOADING_CAPTIONS.scenes[0];

  useEffect(() => {
    setCaptionIndex(0);
  }, [stickySceneId]);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setCaptionIndex((value) => value + 1);
    }, CAPTION_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, stickySceneId]);

  const caption = useMemo(
    () =>
      pickCaption(
        scene.captions,
        captionIndex,
        FALLBACK_LOADING_CAPTIONS.scenes[0].captions[0],
      ),
    [captionIndex, scene.captions],
  );

  return (
    <div
      className={cn(
        "fixed inset-0 z-40 flex min-h-[100dvh] flex-col items-center justify-center overflow-y-auto bg-paper px-4 py-6 sm:px-5 sm:py-10",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex w-full max-w-xl flex-col items-center gap-5 sm:gap-8">
        <p className="font-display text-[11px] uppercase tracking-[0.12em] text-ink/75">
          Developing your archive
        </p>

        <SceneArt
          scenes={captions.scenes.map((entry) => ({
            id: entry.id,
            path: entry.path,
          }))}
          activeId={scene.id}
          reduceMotion={reduceMotion}
        />

        <div className="min-h-[3rem] w-full text-center sm:min-h-[3.5rem]">
          <p
            dir="auto"
            className="font-body text-base font-medium leading-7 text-ink sm:text-xl sm:leading-8"
          >
            {caption}
          </p>
        </div>

        <Telemetry progress={progress} progressPercent={progressPercent} />
      </div>
    </div>
  );
}
