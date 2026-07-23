"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type PhotoThumbProps = {
  zipPath: string;
  readBlob: (zipPath: string) => Promise<Blob>;
  alt?: string;
  className?: string;
};

/**
 * Grid-size photograph: thin cream frame + soft shadow only.
 * No sepia, no vignette below lightbox size — the full vintage treatment
 * is reserved for the lightbox and Wrapped's Artifact slide.
 */
export function PhotoThumb({
  zipPath,
  readBlob,
  alt = "",
  className,
}: PhotoThumbProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let created: string | null = null;
    void readBlob(zipPath)
      .then((blob) => {
        const next = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(next);
          return;
        }
        created = next;
        setUrl(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (created) {
        URL.revokeObjectURL(created);
      }
    };
  }, [zipPath, readBlob]);

  return (
    <div
      className={cn(
        "rounded-[2px] bg-cream p-1 shadow-[0_2px_8px_rgba(0,0,0,0.12)]",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="block aspect-square w-full rounded-[1px] object-cover"
        />
      ) : (
        <div className="aspect-square w-full bg-paper" aria-hidden="true" />
      )}
    </div>
  );
}
