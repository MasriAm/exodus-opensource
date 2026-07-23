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
          initial: { opacity: 0, y: 6 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.22, delay },
        };

  return (
    <main className="relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-paper">
      {showScene ? (
        <IngestLoadingScene
          progress={progress}
          progressPercent={progressPercent}
        />
      ) : null}

      <header className="relative z-10 mx-auto flex w-full max-w-3xl shrink-0 items-center justify-end px-4 py-2 sm:px-8 sm:py-3">
        <NetworkBadge />
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 pb-4 pt-1 text-center sm:px-8 sm:pb-6">
        <motion.div {...item(0)}>
          <CapsuleBadge>100% local, open source and private</CapsuleBadge>
        </motion.div>

        <motion.h1
          className="mt-3 max-w-2xl font-display text-[1.65rem] font-bold leading-tight tracking-[0.04em] text-ink sm:mt-4 sm:text-4xl md:text-5xl"
          {...item(0.05)}
        >
          MEET YOUR PAST SELF.
        </motion.h1>

        <motion.p
          className="mt-2 max-w-lg font-body text-[14px] font-medium leading-6 text-ink/85 sm:mt-3 sm:text-[15px] sm:leading-6"
          {...item(0.1)}
        >
          Drop your Instagram <Mark>.zip</Mark> export. We parse it in your
          browser — nothing leaves this device.
        </motion.p>

        <motion.div className="mt-4 w-full sm:mt-5" {...item(0.15)}>
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
