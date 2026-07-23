"use client";

import { useEffect, useRef, useState } from "react";
import { FileQuestion, ImageIcon, LoaderCircle, X } from "lucide-react";

import { VintagePhoto } from "@/components/capsule/vintage-photo";
import { StatePanel } from "@/components/state-panel";
import { formatDate } from "@/lib/format";

export type MediaItem = {
  zipPath: string;
  kind: "image" | "video" | "audio" | "other";
  takenAt: number | string | Date | null;
  conversation: string | null;
};

type LazyMediaProps = {
  item: MediaItem;
  readBlob: (zipPath: string) => Promise<Blob>;
  onOpen?: (url: string, item: MediaItem) => void;
};

function LazyMedia({ item, readBlob, onOpen }: LazyMediaProps) {
  const containerRef = useRef<HTMLElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const omittedFromExport = item.zipPath.startsWith("omitted://");

  useEffect(() => {
    const node = containerRef.current;
    if (!node || omittedFromExport) {
      return;
    }
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const inRange = entries.some((entry) => entry.isIntersecting);
        setVisible(inRange);
        if (!inRange) {
          const objectUrl = objectUrlRef.current;
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrlRef.current = null;
          }
          setUrl(null);
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [omittedFromExport]);

  useEffect(() => {
    if (!visible || omittedFromExport) {
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setError(false);
    void readBlob(item.zipPath)
      .then((blob) => {
        if (!active) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setUrl(objectUrl);
      })
      .catch((readError: unknown) => {
        console.error(`Could not read media entry ${item.zipPath}.`, readError);
        if (active) {
          setError(true);
        }
      });

    return () => {
      active = false;
      if (objectUrl && objectUrlRef.current === objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrlRef.current = null;
      }
    };
  }, [item.zipPath, omittedFromExport, readBlob, visible]);

  const label = item.conversation
    ? `Media shared in ${item.conversation}`
    : "Archive media";

  return (
    <article ref={containerRef} className="group">
      {item.kind === "image" && url && !error && !omittedFromExport ? (
        <button
          type="button"
          className="w-full text-start"
          onClick={() => onOpen?.(url, item)}
        >
          <VintagePhoto compact>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              loading="lazy"
              className="target-photo aspect-square w-full object-cover"
            />
          </VintagePhoto>
        </button>
      ) : (
        <div className="overflow-hidden border-strong bg-cream">
          <div className="grid aspect-square place-items-center bg-paper/60">
            {omittedFromExport ? (
              <div className="px-5 text-center font-body text-sm text-body">
                <ImageIcon aria-hidden="true" className="mx-auto mb-2 size-6" />
                Media was omitted from the WhatsApp export.
              </div>
            ) : !visible || (!url && !error) ? (
              <LoaderCircle
                aria-label="Loading media"
                className="size-5 animate-spin text-body motion-reduce:animate-none"
              />
            ) : error ? (
              <div className="px-5 text-center font-body text-sm text-body">
                <FileQuestion aria-hidden="true" className="mx-auto mb-2 size-6" />
                This media entry could not be opened.
              </div>
            ) : item.kind === "video" ? (
              <video
                src={url ?? undefined}
                controls
                preload="metadata"
                aria-label={label}
                className="size-full bg-ink object-contain"
              />
            ) : item.kind === "audio" ? (
              <audio
                src={url ?? undefined}
                controls
                preload="metadata"
                aria-label={label}
              />
            ) : (
              <a
                href={url ?? undefined}
                download={item.zipPath.split("/").at(-1)}
                className="font-display text-sm font-bold text-teal underline"
              >
                Open attachment
              </a>
            )}
          </div>
        </div>
      )}
      <div className="mt-2 px-1">
        <p dir="auto" className="truncate font-display text-sm font-bold text-ink">
          {item.conversation ??
            (omittedFromExport
              ? "Omitted media"
              : item.zipPath.split("/").at(-1))}
        </p>
        <p className="meta-caps mt-1">
          {item.takenAt ? formatDate(item.takenAt) : "Date unavailable"} ·{" "}
          {item.kind}
        </p>
      </div>
    </article>
  );
}

type MediaViewProps = {
  items: MediaItem[];
  loading: boolean;
  error: string | null;
  readBlob: (zipPath: string) => Promise<Blob>;
};

export function MediaView({
  items,
  loading,
  error,
  readBlob,
}: MediaViewProps) {
  const [lightbox, setLightbox] = useState<{
    url: string;
    item: MediaItem;
  } | null>(null);

  if (error) {
    return (
      <StatePanel
        kind="error"
        title="Media could not be loaded"
        description={error}
      />
    );
  }
  if (loading) {
    return (
      <StatePanel
        kind="loading"
        title="Finding media"
        description="The worker is indexing archive attachments."
      />
    );
  }
  if (items.length === 0) {
    return (
      <StatePanel
        icon={ImageIcon}
        title="No media found"
        description="This export does not contain supported image, video, or audio entries."
      />
    );
  }

  return (
    <section>
      <div className="mb-5">
        <h2 className="font-display text-xl font-bold tracking-[0.02em]">
          Media gallery
        </h2>
        <p className="mt-1 font-body text-sm text-body">
          Files are decompressed only as they approach the screen. Hover or tap
          to reveal the original.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        {items.map((item) => (
          <LazyMedia
            key={item.zipPath}
            item={item}
            readBlob={readBlob}
            onOpen={(url, mediaItem) => setLightbox({ url, item: mediaItem })}
          />
        ))}
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-cream"
            aria-label="Close preview"
            onClick={() => setLightbox(null)}
          >
            <X className="size-6" />
          </button>
          <div onClick={(event) => event.stopPropagation()}>
            <VintagePhoto className="max-h-[85vh] max-w-[min(90vw,40rem)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={lightbox.url}
                alt={
                  lightbox.item.conversation
                    ? `Media from ${lightbox.item.conversation}`
                    : "Archive media"
                }
                className="target-photo max-h-[70vh] w-full object-contain"
              />
            </VintagePhoto>
          </div>
        </div>
      ) : null}
    </section>
  );
}
