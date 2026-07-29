"use client";

import { motion, useReducedMotion } from "framer-motion";

import { ArchiveDropzone } from "@/components/archive-dropzone";
import { CapsuleBadge } from "@/components/capsule/badge";
import { Mark } from "@/components/capsule/mark";
import { IngestLoadingScene } from "@/components/ingest-loading-scene";
import { NetworkBadge } from "@/components/network-badge";
import type { IngestProgress } from "@/lib/db/types";

import { X, Play } from "lucide-react";

type HomeShellProps = {
  busy: boolean;
  workerReady: boolean;
  progress: IngestProgress | null;
  progressPercent?: number;
  error?: string | null;
  queuedExports?: { file: File; platform: string }[];
  onConfirmImport?: () => void;
  onRemoveExport?: (index: number) => void;
  onFile: (file: File) => void;
  onDemo: () => void;
};

export function HomeShell({
  busy,
  workerReady,
  progress,
  progressPercent,
  error,
  queuedExports,
  onConfirmImport,
  onRemoveExport,
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
          Drop your Instagram, WhatsApp, or Facebook <Mark>.zip</Mark> export. We parse it in your
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

        {queuedExports && queuedExports.length > 0 && (
          <motion.div
            className="mt-6 w-full flex flex-col gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-col gap-2 rounded-xl bg-paper border border-ink/10 p-4 text-left shadow-sm">
              <h3 className="font-display text-sm font-bold text-ink/70 uppercase tracking-wider mb-2">
                Staging Area ({queuedExports.length})
              </h3>
              {queuedExports.map((exportItem, index) => (
                <div
                  key={`${exportItem.platform}-${index}`}
                  className="flex items-center justify-between rounded-lg bg-ink/5 px-4 py-3"
                >
                  <div className="flex flex-col min-w-0">
                    <span className="font-display font-semibold text-ink text-sm">
                      {exportItem.platform}
                    </span>
                    <span className="font-body text-ink/60 text-xs truncate">
                      {exportItem.file.name}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveExport?.(index)}
                    className="p-2 text-ink/40 hover:text-ink hover:bg-ink/10 rounded-full transition-colors"
                    title="Remove export"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              <button
                onClick={onConfirmImport}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 font-display text-sm font-semibold text-paper transition-opacity hover:opacity-90 disabled:opacity-50"
                disabled={busy}
              >
                <Play className="w-4 h-4" />
                START PARSING
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
}
