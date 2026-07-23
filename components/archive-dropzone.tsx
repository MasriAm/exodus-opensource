"use client";

import { useId, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { Mark } from "@/components/capsule/mark";
import { PressButton } from "@/components/capsule/press-button";
import { TapedNote } from "@/components/capsule/taped-note";
import { cn } from "@/lib/utils";

type ArchiveDropzoneProps = {
  busy: boolean;
  error?: string | null;
  onFile: (file: File) => void;
  onDemo: () => void;
};

function isZipFile(file: File): boolean {
  return (
    file.name.toLocaleLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

export function ArchiveDropzone({
  busy,
  error,
  onFile,
  onDemo,
}: ArchiveDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const submitFile = (file: File | undefined) => {
    if (!file) {
      return;
    }
    if (!isZipFile(file)) {
      setValidationError("Choose a .zip export from Instagram or WhatsApp.");
      return;
    }
    setValidationError(null);
    onFile(file);
  };

  return (
    <div className="w-full">
      <div
        className={cn(
          "relative border-2 border-dashed border-ink/60 bg-cream/40 p-4 transition sm:p-6",
          dragActive && "border-teal bg-cream",
          busy && "pointer-events-none opacity-40",
        )}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
          }
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          submitFile(event.dataTransfer.files.item(0) ?? undefined);
        }}
      >
        <button
          type="button"
          className="flex w-full flex-col items-center text-center"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <ArrowUpRight
            aria-hidden="true"
            className="size-6 text-body sm:size-8"
            strokeWidth={1.5}
          />
          <p className="mt-2 max-w-md font-body text-[14px] font-medium leading-6 text-ink/85 sm:mt-3 sm:text-[15px]">
            Click or drag &amp; drop to upload your export
          </p>
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="sr-only"
          disabled={busy}
          onChange={(event) => {
            submitFile(event.target.files?.item(0) ?? undefined);
            event.target.value = "";
          }}
        />
      </div>

      {!busy ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PressButton onClick={onDemo}>Try a synthetic export</PressButton>
          <button
            type="button"
            className="text-left font-display text-xs tracking-[0.02em] text-ink underline underline-offset-4"
            onClick={() => setGuideOpen((open) => !open)}
            aria-expanded={guideOpen}
          >
            Don&apos;t have your data yet? Read the 3-step guide
          </button>
        </div>
      ) : null}

      {guideOpen && !busy ? (
        <TapedNote className="mt-6">
          <ol className="space-y-4 font-body text-sm leading-6 text-body">
            <li>
              <span className="font-display text-xs font-bold text-ink">
                STEP 1
              </span>
              <p className="mt-1">
                Open the Instagram app → Settings → Accounts Center → Your
                information and permissions → Download your information
              </p>
            </li>
            <li>
              <span className="font-display text-xs font-bold text-ink">
                STEP 2
              </span>
              <p className="mt-1">
                Request a download. You must select <Mark>JSON</Mark> format,
                not HTML. &quot;All time&quot; range.
              </p>
            </li>
            <li>
              <span className="font-display text-xs font-bold text-ink">
                STEP 3
              </span>
              <p className="mt-1">
                Check your email — Instagram sends a link to your .zip when
                it&apos;s ready.
              </p>
            </li>
          </ol>
          <p className="mt-5 border-t border-ink/20 pt-3 font-display text-xs tracking-[0.02em] text-ink">
            Bookmark this page and come back when you have your data.
          </p>
        </TapedNote>
      ) : null}

      {validationError || error ? (
        <p
          className="mt-3 text-center font-body text-sm font-medium text-coral"
          role="alert"
        >
          {validationError ?? error}
        </p>
      ) : null}
    </div>
  );
}
