"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

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
  sceneId,
  path,
  reduceMotion,
}: {
  sceneId: LoadingSceneId;
  path: string;
  reduceMotion: boolean | null;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={sceneId}
        className="relative mx-auto aspect-square w-full max-w-[200px] sm:max-w-[360px]"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduceMotion ? undefined : { opacity: 0 }}
        transition={{ duration: 0.35 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={path}
          alt=""
          width={420}
          height={420}
          decoding="async"
          className="h-full w-full object-contain"
          style={{
            maskImage:
              "radial-gradient(circle at center, black 62%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(circle at center, black 62%, transparent 100%)",
          }}
        />
      </motion.div>
    </AnimatePresence>
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

  const sceneId = sceneForProgress(progressPercent);
  const scene =
    captions.scenes.find((entry) => entry.id === sceneId) ??
    captions.scenes[0] ??
    FALLBACK_LOADING_CAPTIONS.scenes[0];

  useEffect(() => {
    setCaptionIndex(0);
  }, [sceneId]);

  useEffect(() => {
    if (reduceMotion) {
      return;
    }
    const timer = window.setInterval(() => {
      setCaptionIndex((value) => value + 1);
    }, CAPTION_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion, sceneId]);

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
          sceneId={scene.id}
          path={scene.path}
          reduceMotion={reduceMotion}
        />

        <div className="min-h-[3rem] w-full text-center sm:min-h-[3.5rem]">
          <AnimatePresence mode="wait">
            <motion.p
              key={`${scene.id}-${caption}`}
              dir="auto"
              className="font-body text-base font-medium leading-7 text-ink sm:text-xl sm:leading-8"
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
            >
              {caption}
            </motion.p>
          </AnimatePresence>
        </div>

        <Telemetry progress={progress} progressPercent={progressPercent} />
      </div>
    </div>
  );
}
