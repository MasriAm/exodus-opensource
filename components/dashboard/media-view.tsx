"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileQuestion,
  ImageIcon,
  LoaderCircle,
  Mic,
  Video,
  X,
} from "lucide-react";

import { ArchivePanel } from "@/components/dashboard/archive-panel";
import { AudioPlayer } from "@/components/dashboard/audio-player";
import { VideoPlayer } from "@/components/dashboard/video-player";
import { PageControl } from "@/components/dashboard/page-control";
import { VintagePhoto } from "@/components/capsule/vintage-photo";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import { stripInstagramFolderId } from "@/lib/instagram-labels";
import { formatDate, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

type MediaBucket = "image" | "audio" | "video" | "other";

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

let mediaChain: Promise<unknown> = Promise.resolve();
function enqueueMedia<T>(work: () => Promise<T>): Promise<T> {
  const run = mediaChain.then(work, work);
  mediaChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function LazyMedia({ item, readBlob, onOpen }: LazyMediaProps) {
  const containerRef = useRef<HTMLElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const omittedFromExport = item.zipPath.startsWith("omitted://");
  const fileName = item.zipPath.split("/").at(-1) ?? "media";

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
        if (typeof document !== "undefined" && document.hidden) {
          return;
        }
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
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
    void enqueueMedia(() => readBlob(item.zipPath))
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

  const conversationLabel = item.conversation
    ? stripInstagramFolderId(item.conversation)
    : null;
  const label = conversationLabel
    ? `Media shared in ${conversationLabel}`
    : "Archive media";
  const isHeic = /\.heic$/i.test(fileName);

  return (
    <article ref={containerRef} className="group min-w-0">
      {item.kind === "image" && url && !error && !omittedFromExport ? (
        <button
          type="button"
          className="w-full cursor-pointer text-start transition-opacity hover:opacity-90"
          onClick={() => onOpen?.(url, item)}
        >
          <div className="overflow-hidden border border-ink bg-receipt p-1.5 shadow-panel transition-[box-shadow,transform] group-hover:shadow-press">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={label}
              loading="lazy"
              className="aspect-square w-full object-cover"
            />
          </div>
        </button>
          ) : item.kind === "audio" && url && !error && !omittedFromExport ? (
            <AudioPlayer src={url} title={fileName} />
          ) : item.kind === "video" && url && !error && !omittedFromExport ? (
            <VideoPlayer src={url} title={fileName} />
          ) : (
            <div className="overflow-hidden border-2 border-ink bg-cream shadow-panel">
              <div className="grid aspect-square place-items-center bg-paper/60 px-3">
                {omittedFromExport ? (
                  <div className="text-center font-body text-sm text-ink/75">
                    <ImageIcon aria-hidden="true" className="mx-auto mb-2 size-6" />
                    Omitted from export
                  </div>
                ) : !visible || (!url && !error) ? (
                  <LoaderCircle
                    aria-label="Loading media"
                    className="size-5 animate-spin text-ink/60 motion-reduce:animate-none"
                  />
                ) : error || isHeic ? (
                  <div className="text-center font-body text-sm text-ink/75">
                    <FileQuestion aria-hidden="true" className="mx-auto mb-2 size-6" />
                    <span dir="auto" className="mt-1 block [unicode-bidi:isolate]">
                      <bdi>{isHeic ? "HEIC — not previewable here" : fileName}</bdi>
                    </span>
                  </div>
                ) : (
                  <a
                    href={url ?? undefined}
                    download={fileName}
                    className="font-display text-sm font-bold text-teal underline"
                  >
                    Open attachment
                  </a>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 min-w-0 px-0.5">
        <UserText className="block truncate font-body text-sm font-semibold text-ink">
          {conversationLabel ?? (omittedFromExport ? "Omitted media" : fileName)}
        </UserText>
        <p className="mt-1 font-display text-[10px] font-bold uppercase tracking-[0.08em] text-ink/65">
          {item.takenAt ? formatDate(item.takenAt) : "Date unavailable"}
        </p>
      </div>
    </article>
  );
}

type MediaViewProps = {
  items: MediaItem[];
  totalCount: number;
  page: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  kind: MediaBucket;
  onChangeKind: (kind: MediaBucket) => void;
  readBlob: (zipPath: string) => Promise<Blob>;
  onChangePage: (page: number) => void;
};

const BUCKETS: ReadonlyArray<{
  id: MediaBucket;
  label: string;
  icon: typeof ImageIcon;
}> = [
  { id: "image", label: "Images", icon: ImageIcon },
  { id: "audio", label: "Voice notes", icon: Mic },
  { id: "video", label: "Video", icon: Video },
  { id: "other", label: "Other", icon: FileQuestion },
];

export function MediaView({
  items,
  totalCount,
  page,
  totalPages,
  loading,
  error,
  kind,
  onChangeKind,
  readBlob,
  onChangePage,
}: MediaViewProps) {
  const [lightbox, setLightbox] = useState<{
    url: string;
    item: MediaItem;
  } | null>(null);

  const closeLightbox = () => {
    setLightbox((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  };

  const openLightbox = async (sourceUrl: string, item: MediaItem) => {
    try {
      const blob = await (await fetch(sourceUrl)).blob();
      const owned = URL.createObjectURL(blob);
      setLightbox((current) => {
        if (current) {
          URL.revokeObjectURL(current.url);
        }
        return { url: owned, item };
      });
    } catch {
      setLightbox({ url: sourceUrl, item });
    }
  };

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
  const bucketLabel =
    BUCKETS.find((entry) => entry.id === kind)?.label ?? "Media";

  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="tablist"
        aria-label="Media type"
      >
        {BUCKETS.map((entry) => {
          const Icon = entry.icon;
          const active = kind === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeKind(entry.id)}
              className={cn(
                "inline-flex items-center gap-2 border-2 px-3 py-2 font-display text-xs font-bold uppercase tracking-[0.06em] transition-colors",
                active
                  ? "border-teal bg-teal-wash text-teal"
                  : "border-ink/30 bg-cream text-ink/75 hover:border-ink hover:bg-receipt",
              )}
            >
              <Icon aria-hidden="true" className="size-3.5" />
              {entry.label}
            </button>
          );
        })}
      </div>

      <ArchivePanel
        title={`${bucketLabel} // ${pluralize(totalCount, "file")}`}
        bodyClassName="!p-0"
      >
        {items.length === 0 ? (
          <p className="p-5 font-body text-sm text-ink/75">
            No {kind === "audio" ? "voice notes" : kind} match these filters.
          </p>
        ) : (
          <div
            className={cn(
              "grid gap-4 p-4",
              kind === "audio"
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
            )}
          >
            {items.map((item) => (
              <LazyMedia
                key={`${item.zipPath}-${item.kind}`}
                item={item}
                readBlob={readBlob}
                onOpen={(url, mediaItem) => {
                  void openLightbox(url, mediaItem);
                }}
              />
            ))}
          </div>
        )}
        <PageControl
          page={page}
          totalPages={totalPages}
          onChange={onChangePage}
          disabled={loading}
        />
      </ArchivePanel>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-ink/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Media preview"
          onClick={closeLightbox}
        >
          <button
            type="button"
            className="absolute top-4 right-4 text-cream transition-colors hover:text-teal focus-visible:ring-offset-ink"
            aria-label="Close preview"
            onClick={closeLightbox}
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
                    ? `Media from ${stripInstagramFolderId(lightbox.item.conversation)}`
                    : "Archive media"
                }
                className={cn("target-photo max-h-[70vh] w-full object-contain")}
              />
            </VintagePhoto>
          </div>
        </div>
      ) : null}
    </div>
  );
}
