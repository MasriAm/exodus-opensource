"use client";

import { motion, useReducedMotion } from "framer-motion";

import { ArchiveDropzone } from "@/components/archive-dropzone";
import { CapsuleBadge } from "@/components/capsule/badge";
import { Mark } from "@/components/capsule/mark";
import { IngestLoadingScene } from "@/components/ingest-loading-scene";
import { NetworkBadge } from "@/components/network-badge";
import type { IngestProgress } from "@/lib/db/types";

type HomeShellProps = {
  busy: boolean;
  workerReady: boolean;
  progress: IngestProgress | null;
  progressPercent?: number;
  error?: string | null;
  onFile: (file: File) => void;
  onDemo: () => void;
};

export function HomeShell({
  busy,
  workerReady,
  progress,
  progressPercent,
  error,
  onFile,
  onDemo,
}: HomeShellProps) {
  const reduceMotion = useReducedMotion();
  const showScene = busy && progress !== null;

  const item = (delay: number) =>
    reduceMotion
      ? undefined
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.3, delay },
        };

  return (
    <main className="relative min-h-screen overflow-hidden bg-paper">
      {showScene ? (
        <IngestLoadingScene
          progress={progress}
          progressPercent={progressPercent}
        />
      ) : null}

      <header className="relative z-10 mx-auto flex max-w-3xl items-center justify-end px-5 py-5 sm:px-8">
        <NetworkBadge />
      </header>

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-5 pb-20 pt-6 text-center sm:px-8 sm:pt-10">
        <motion.div {...item(0)}>
          <CapsuleBadge>100% local, open source and private</CapsuleBadge>
        </motion.div>

        <motion.h1
          className="mt-8 max-w-2xl font-display text-4xl font-bold tracking-[0.04em] text-ink sm:text-6xl"
          {...item(0.08)}
        >
          MEET YOUR PAST SELF.
        </motion.h1>

        <motion.p
          className="mt-6 max-w-xl font-body text-base leading-8 text-body sm:text-lg"
          {...item(0.16)}
        >
          Drop your Instagram <Mark>.zip</Mark> export below. We&apos;ll parse
          the data directly in your browser to build your personal time capsule.
          Nothing ever leaves your computer.
        </motion.p>

        <motion.div className="mt-10 w-full" {...item(0.24)}>
          <ArchiveDropzone
            busy={busy || !workerReady}
            error={error}
            onFile={onFile}
            onDemo={onDemo}
          />
        </motion.div>
      </div>
    </main>
  );
}
