"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { IngestLoadingScene } from "@/components/ingest-loading-scene";
import { ReceiptStrip } from "@/components/receipts/evidence";
import { ExportGuide } from "@/components/receipts/export-guide";
import { useArchiveImport } from "@/components/receipts/use-archive-import";
import { useTemplateReport } from "@/components/receipts/use-drama-report";
import { maskToBlocks } from "@/components/receipts/evidence";

/**
 * Four messages from the fictional demo corpus, composed for the hero.
 * The point of the opening beat is the redaction lifting — sending screenshots
 * of your chats is the behaviour this whole product is about.
 */
const HERO_THREAD = [
  { mine: false, at: "2:03", text: "are you awake. i want to say something and i'll lose my nerve by morning" },
  { mine: true, at: "2:20", text: "i'm awake" },
  { mine: false, at: "2:44", text: "i think i've been treating you like a sure thing and you've never once acted like one" },
  { mine: true, at: "2:55", text: "you could just be normal about it. thats an option nobody ever picks" },
] as const;

const FINDS = [
  {
    mark: "🌙",
    title: "Your 3am era, quantified",
    body: "The share of everything you have ever typed that happened between 1am and 5am — and which one person you were typing it to.",
  },
  {
    mark: "🔥",
    title: "The arguments",
    body: "Pulled out by what was actually said, not by who you tell us to look for.",
  },
  {
    mark: "🤐",
    title: "The secrets",
    body: "Every “don't tell anyone” you ever sent, still sitting there.",
  },
  {
    mark: "👻",
    title: "Double texts and dead air",
    body: "How often you kept typing into silence, how long you make people wait, and how long they make you wait back.",
  },
  {
    mark: "💔",
    title: "The situationship",
    body: "The chat that burned through more messages per day than anything else and then stopped.",
  },
  {
    mark: "💀",
    title: "The ick",
    body: "Vocabulary from your first two years on the app, which has not aged well.",
  },
] as const;

function HeroScreenshot() {
  const [revealed, setRevealed] = useState(0);
  const [capped, setCapped] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setRevealed(HERO_THREAD.length);
      setCapped(true);
      return;
    }

    const timers = HERO_THREAD.map((_, index) =>
      window.setTimeout(() => setRevealed(index + 1), 620 + index * 340),
    );
    const final = window.setTimeout(
      () => setCapped(true),
      620 + HERO_THREAD.length * 340,
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(final);
    };
  }, []);

  return (
    <div className="rc-phone rc-enter" style={{ animationDelay: "120ms" }}>
      <div className="rc-phone-top">
        <span className="rc-phone-who">noor.hbb</span>
        <span>Tuesday</span>
      </div>

      <div className="rc-thread">
        {HERO_THREAD.map((message, index) => {
          const hidden = index >= revealed;
          return (
            <div
              key={message.text}
              className={`rc-bubble ${message.mine ? "rc-bubble-you" : "rc-bubble-them"}`}
            >
              <span className={hidden ? "rc-redacted" : undefined}>
                {hidden ? maskToBlocks(message.text) : message.text}
              </span>
              <span className="rc-bubble-time">{message.at} am</span>
            </div>
          );
        })}
      </div>

      {capped ? (
        <p className="rc-capped">
          <span aria-hidden="true">⚡</span>
          Read on your device only. Nothing here was uploaded.
        </p>
      ) : null}
    </div>
  );
}

export function ReceiptsLanding() {
  const router = useRouter();
  const demo = useTemplateReport();
  const importer = useArchiveImport("/receipts/report");
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<number>>(new Set());

  const previewExhibits = useMemo(() => demo.exhibits.slice(0, 6), [demo]);

  const toggleReveal = useCallback((messageId: number) => {
    setRevealedIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  if (importer.busy && importer.progress) {
    return (
      <main className="rc">
        <IngestLoadingScene
          progress={importer.progress}
          progressPercent={importer.percent}
        />
      </main>
    );
  }

  return (
    <main className="rc">
      <div className="rc-shell">
        <nav className="rc-bar">
          <Link href="/" className="rc-wordmark">
            exodus <span>/ receipts</span>
          </Link>
          <p className="rc-private">Runs entirely on this device</p>
        </nav>

        <header className="rc-hero">
          <div>
            <h1 className="rc-h1 rc-enter">
              Everything you sent at 3am is still in there.
            </h1>
            <p className="rc-lede rc-enter" style={{ animationDelay: "80ms" }}>
              Snapchat and Instagram will hand you your entire message history if
              you ask. Drop that file here and we will find the arguments, the
              confessions and the things you swore you deleted — without any of it
              leaving your phone.
            </p>

            <div className="rc-hero-actions rc-enter" style={{ animationDelay: "160ms" }}>
              <button
                type="button"
                className="rc-btn rc-btn-primary"
                onClick={() => router.push("/receipts/report?demo=1")}
              >
                See it on a fake group chat
              </button>
              <button
                type="button"
                className="rc-btn rc-btn-ghost"
                onClick={() => inputRef.current?.click()}
                disabled={!importer.ready}
              >
                Use my own export
              </button>
            </div>
            <p className="rc-hero-note">
              The demo runs on six invented people. No account, no sign-up, and
              nothing to delete afterwards.
            </p>
          </div>

          <HeroScreenshot />
        </header>
      </div>

      <div className="rc-shell">
        <section className="rc-section" aria-labelledby="rc-exhibits">
          <div className="rc-section-head">
            <div>
              <h2 className="rc-h2" id="rc-exhibits">
                This is what it pulls out
              </h2>
              <p className="rc-body" style={{ marginTop: "0.75rem" }}>
                Real output from the demo chat, blocked out until you tap. Your own
                report looks exactly like this, with your own messages in it.
              </p>
            </div>
          </div>

          <div className="rc-strip-rail">
            {previewExhibits.map((exhibit, index) => (
              <ReceiptStrip
                key={exhibit.category.id}
                exhibit={exhibit}
                index={index}
                hidden
                revealed={revealedIds}
                onToggle={toggleReveal}
              />
            ))}
          </div>
        </section>

        <section className="rc-section" aria-labelledby="rc-finds">
          <div className="rc-section-head">
            <h2 className="rc-h2" id="rc-finds">
              Six things you already know but have never seen
            </h2>
          </div>

          <div className="rc-finds">
            {FINDS.map((find) => (
              <article className="rc-find" key={find.title}>
                <span className="rc-find-mark" aria-hidden="true">
                  {find.mark}
                </span>
                <h3 className="rc-h3">{find.title}</h3>
                <p>{find.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rc-section" aria-labelledby="rc-drop-title">
          <div className="rc-privacy">
            <div>
              <h2 className="rc-h2" id="rc-privacy-title">
                Why this is safe to do with your DMs
              </h2>
              <p className="rc-body" style={{ marginTop: "1rem" }}>
                A message export is the most personal file you own. This one never
                moves.
              </p>
              <ol className="rc-steps" style={{ marginTop: "1.5rem" }}>
                <li>Your .zip is opened by your browser, not a server.</li>
                <li>
                  Messages are read into a database that lives in this tab&apos;s
                  memory. There is no API to upload them to.
                </li>
                <li>
                  Close the tab and it is gone. Nothing is stored, cached or
                  synced.
                </li>
              </ol>
              <p className="rc-body" style={{ marginTop: "1.25rem", fontSize: "0.9rem" }}>
                The whole project is open source, so this is checkable rather than
                promised.
              </p>
            </div>

            <div>
              <h3 className="rc-h3" id="rc-drop-title">
                Drop your export
              </h3>
              <div
                className="rc-drop"
                data-active={dragging}
                style={{ marginTop: "1rem" }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(event.relatedTarget as Node | null)
                  ) {
                    return;
                  }
                  setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files.item(0);
                  if (file) {
                    importer.addFile(file);
                  }
                }}
              >
                <button
                  type="button"
                  className="rc-btn rc-btn-primary"
                  onClick={() => inputRef.current?.click()}
                  disabled={!importer.ready || importer.busy}
                >
                  Choose your .zip
                </button>
                <p className="rc-drop-hint">
                  or drag it here. Snapchat, Instagram, WhatsApp and Facebook
                  exports all work, and you can add more than one.
                </p>

                {importer.queue.length > 0 ? (
                  <div className="rc-queue">
                    {importer.queue.map((item, index) => (
                      <div className="rc-queue-row" key={`${item.platform}-${index}`}>
                        <span>
                          {item.platform}
                          <small>{item.file.name}</small>
                        </span>
                        <button
                          type="button"
                          className="rc-link"
                          onClick={() => importer.removeAt(index)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="rc-btn rc-btn-primary"
                      onClick={importer.start}
                      disabled={importer.busy}
                    >
                      Read {importer.queue.length} export
                      {importer.queue.length === 1 ? "" : "s"}
                    </button>
                  </div>
                ) : null}

                {importer.error ? (
                  <p className="rc-error" role="alert">
                    {importer.error}
                  </p>
                ) : null}
              </div>

              <input
                ref={inputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.item(0);
                  if (file) {
                    importer.addFile(file);
                  }
                  event.target.value = "";
                }}
              />
            </div>
          </div>
        </section>

        <section className="rc-section" aria-labelledby="rc-guide">
          <div className="rc-section-head">
            <div>
              <h2 className="rc-h2" id="rc-guide">
                Getting the file
              </h2>
              <p className="rc-body" style={{ marginTop: "0.75rem" }}>
                Each app makes you request it and then emails a link. Snapchat is
                usually same-day; Instagram can take a few hours.
              </p>
            </div>
          </div>
          <ExportGuide />
        </section>

        <footer className="rc-foot">
          <Link href="/" className="rc-link">
            The full archive desk
          </Link>
          <span>Open source, offline, and yours.</span>
        </footer>
      </div>
    </main>
  );
}
