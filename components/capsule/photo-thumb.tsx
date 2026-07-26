"use client";

import { useEffect, useState } from "react";

import { thumbCacheGet, thumbCacheSet } from "@/lib/thumb-cache";
import { cn } from "@/lib/utils";

type PhotoThumbProps = {
  zipPath: string;
  readBlob: (zipPath: string) => Promise<Blob>;
  alt?: string;
  className?: string;
  caption?: string | null;
};

/** Serialize blob reads so exclusive worker ops don't all time out at once. */
let thumbChain: Promise<unknown> = Promise.resolve();

function enqueueThumb<T>(work: () => Promise<T>): Promise<T> {
  const run = thumbChain.then(work, work);
  thumbChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Polaroid-style photograph frame.
 * Failures show a captioned frame — never a permanent grey square.
 * Object URLs are shared via a bounded LRU cache (not revoked on unmount).
 */
export function PhotoThumb({
  zipPath,
  readBlob,
  alt = "",
  className,
  caption,
}: PhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(() => thumbCacheGet(zipPath));
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(() => thumbCacheGet(zipPath) === null);

  useEffect(() => {
    let active = true;
    const cached = thumbCacheGet(zipPath);
    if (cached) {
      setUrl(cached);
      setFailed(false);
      setLoading(false);
      return;
    }

    setUrl(null);
    setFailed(false);
    setLoading(true);

    void enqueueThumb(() => readBlob(zipPath))
      .then((blob) => {
        if (!active) {
          return;
        }
        const next = thumbCacheSet(zipPath, blob);
        setUrl(next);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [zipPath, readBlob]);

  const label =
    caption?.trim() ||
    zipPath.split("/").pop() ||
    "Photograph";

  return (
    <div
      className={cn(
        "border border-ink bg-receipt p-1.5 shadow-[2px_2px_0_color-mix(in_srgb,var(--ink)_15%,transparent)]",
        className,
      )}
    >
      {url && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt || label}
          className="block aspect-square w-full object-cover"
        />
      ) : (
        <div
          className="flex aspect-square w-full flex-col items-center justify-center gap-1 border border-dashed border-ink/30 bg-cream px-2 text-center"
          role={failed ? "img" : "status"}
          aria-label={failed ? `Unavailable: ${label}` : "Loading photograph"}
        >
          <span className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/60">
            {loading && !failed ? "Loading…" : "No preview"}
          </span>
          <span
            dir="auto"
            className="line-clamp-3 font-body text-[11px] font-medium leading-4 text-ink/75 [unicode-bidi:isolate]"
          >
            <bdi>{label}</bdi>
          </span>
        </div>
      )}
    </div>
  );
}
