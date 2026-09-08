"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

import {
  Redactable,
  ReceiptStrip,
  UserString,
} from "@/components/receipts/evidence";
import { formatDate } from "@/lib/format";
import type { DramaReport } from "@/lib/drama/types";

/** Parsers store platform ids lowercase; the cover should read like a brand. */
const PLATFORM_LABELS: Record<string, string> = {
  snapchat: "Snapchat",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
};

function platformLabel(platform: string): string {
  return (
    PLATFORM_LABELS[platform.toLocaleLowerCase()] ??
    platform.charAt(0).toLocaleUpperCase() + platform.slice(1)
  );
}

function yearRange(fromMs: number | null, toMs: number | null): string {
  if (fromMs === null || toMs === null) {
    return "an unknown stretch";
  }
  const from = new Date(fromMs).getFullYear();
  const to = new Date(toMs).getFullYear();
  return from === to ? `${from}` : `${from}–${to}`;
}

type ReportViewProps = {
  report: DramaReport;
  /** Names masked inside revealed quotes, so a screenshot stays share-safe. */
  names?: readonly string[];
  truncated?: boolean;
  snapCount?: number;
};

export function ReceiptsReport({
  report,
  names = [],
  truncated = false,
  snapCount = 0,
}: ReportViewProps) {
  const [hidden, setHidden] = useState(true);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<number>>(new Set());

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

  const [verdict, ...runnersUp] = report.verdicts;

  return (
    <main className="rc">
      <div className="rc-shell">
        <nav className="rc-bar">
          <Link href="/receipts" className="rc-wordmark">
            exodus <span>/ receipts</span>
          </Link>
          <button
            type="button"
            className="rc-btn rc-btn-ghost"
            style={{ padding: "0.5rem 1rem", fontSize: "0.88rem" }}
            onClick={() => {
              setHidden((current) => !current);
              setRevealedIds(new Set());
            }}
          >
            {hidden ? "Reveal every message" : "Block everything out"}
          </button>
        </nav>

        <header className="rc-cover">
          <h1 className="rc-h1">
            {report.isDemo
              ? "Six people who do not exist, fully exposed."
              : "Your receipts."}
          </h1>
          <div className="rc-cover-meta">
            <span>
              <b>{report.analyzedMessages.toLocaleString()}</b> messages read
            </span>
            <span>
              <b>{report.conversationCount.toLocaleString()}</b> conversations
            </span>
            <span>
              <b>{yearRange(report.activeFromMs, report.activeToMs)}</b>
            </span>
            {report.platforms.length > 0 ? (
              <span>
                <b>{report.platforms.map(platformLabel).join(", ")}</b>
              </span>
            ) : null}
            {snapCount > 0 ? (
              <span>
                <b>{snapCount.toLocaleString()}</b>{" "}
                {snapCount === 1 ? "snap" : "snaps"}
              </span>
            ) : null}
          </div>

          {truncated ? (
            <p className="rc-body" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
              Your archive holds {report.totalMessages.toLocaleString()} messages.
              We read the most recent {report.analyzedMessages.toLocaleString()} so
              the tab stays usable.
            </p>
          ) : null}

          {report.isDemo ? (
            <p className="rc-body" style={{ marginTop: "1rem", fontSize: "0.9rem" }}>
              Everything below was written for this demo. Nobody in it is real.{" "}
              <Link href="/receipts" className="rc-link">
                Run it on your own export
              </Link>{" "}
              to see the version that stings.
            </p>
          ) : null}
        </header>
      </div>

      {verdict ? (
        <div className="rc-shell">
          <section className="rc-sticker" aria-label="Your verdict">
            <p className="rc-sticker-kicker">The verdict</p>
            <h2 className="rc-sticker-title">{verdict.title}</h2>
            <p className="rc-sticker-line">{verdict.line}</p>
            <p className="rc-sticker-evidence">{verdict.evidence}</p>
          </section>

          {runnersUp.length > 0 ? (
            <p className="rc-runners">
              <span>Also true of you:</span>
              {runnersUp.map((runner) => (
                <span key={runner.id}>
                  <b style={{ color: "var(--rc-text)" }}>{runner.title}</b> —{" "}
                  {runner.evidence}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rc-shell">
        {report.exhibits.length > 0 ? (
          <section className="rc-section" aria-labelledby="rc-report-exhibits">
            <div className="rc-section-head">
              <div>
                <h2 className="rc-h2" id="rc-report-exhibits">
                  The exhibits
                </h2>
                <p className="rc-body" style={{ marginTop: "0.75rem" }}>
                  {hidden
                    ? "Blocked out by default. Tap any message to read it."
                    : "Everything is readable. Use the button above to block it out again."}
                </p>
              </div>
            </div>

            <div className="rc-strip-rail">
              {report.exhibits.map((exhibit, index) => (
                <ReceiptStrip
                  key={exhibit.category.id}
                  exhibit={exhibit}
                  index={index}
                  hidden={hidden}
                  revealed={revealedIds}
                  onToggle={toggleReveal}
                  names={names}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="rc-section" aria-labelledby="rc-report-stats">
          <div className="rc-section-head">
            <h2 className="rc-h2" id="rc-report-stats">
              The numbers behind it
            </h2>
          </div>
          <div className="rc-stats">
            {report.stats.map((stat) => (
              <div className="rc-stat" key={stat.id}>
                <p className="rc-stat-value">{stat.value}</p>
                <p className="rc-stat-label">{stat.label}</p>
                <p className="rc-stat-caption">{stat.caption}</p>
              </div>
            ))}
          </div>

          {report.lateNightAccomplice ? (
            <p className="rc-body" style={{ marginTop: "2rem" }}>
              Most of that after-midnight typing went to one person:{" "}
              <UserString
                className="rc-flare"
                value={report.lateNightAccomplice.conversation}
              />
              , {report.lateNightAccomplice.messageCount.toLocaleString()} times.
            </p>
          ) : null}
        </section>

        {report.situationship || report.slowFade || report.comeback ? (
          <section className="rc-section" aria-labelledby="rc-report-arcs">
            <div className="rc-section-head">
              <h2 className="rc-h2" id="rc-report-arcs">
                Three chats that had a whole arc
              </h2>
            </div>

            <div className="rc-stories">
              {report.situationship ? (
                <article className="rc-story">
                  <p className="rc-story-figure">
                    {report.situationship.messageCount.toLocaleString()} messages
                  </p>
                  <div>
                    <h3 className="rc-h3">
                      <UserString value={report.situationship.conversation} />{" "}
                      burned out in{" "}
                      {report.situationship.spanDays.toLocaleString()} days
                    </h3>
                    <p className="rc-body" style={{ marginTop: "0.5rem" }}>
                      That is {report.situationship.intensity} messages on every day
                      it was alive. Nothing else in your archive moved that fast.
                    </p>
                  </div>
                  {report.situationship.lastMessage ? (
                    <div>
                      <p className="rc-pull">
                        <Redactable
                          text={report.situationship.lastMessage.text}
                          hidden={
                            hidden &&
                            !revealedIds.has(report.situationship.lastMessage.id)
                          }
                          names={names}
                          onToggle={() =>
                            toggleReveal(report.situationship!.lastMessage!.id)
                          }
                        />
                      </p>
                      <p className="rc-quote-meta" style={{ color: "var(--rc-faint)" }}>
                        The last thing anyone said ·{" "}
                        {formatDate(report.situationship.lastMessage.sentAtMs)}
                      </p>
                    </div>
                  ) : null}
                </article>
              ) : null}

              {report.slowFade ? (
                <article className="rc-story">
                  <p className="rc-story-figure">
                    {report.slowFade.silentDays.toLocaleString()} days quiet
                  </p>
                  <div>
                    <h3 className="rc-h3">
                      <UserString value={report.slowFade.conversation} /> just
                      stopped
                    </h3>
                    <p className="rc-body" style={{ marginTop: "0.5rem" }}>
                      {report.slowFade.messageCount.toLocaleString()} messages, and
                      then nothing.{" "}
                      {report.slowFade.lastWordWasYours
                        ? "You had the last word, and it was never answered."
                        : "They had the last word, and you never answered it."}
                    </p>
                  </div>
                  {report.slowFade.lastMessage ? (
                    <p className="rc-pull">
                      <Redactable
                        text={report.slowFade.lastMessage.text}
                        hidden={
                          hidden && !revealedIds.has(report.slowFade.lastMessage.id)
                        }
                        names={names}
                        onToggle={() => toggleReveal(report.slowFade!.lastMessage!.id)}
                      />
                    </p>
                  ) : null}
                </article>
              ) : null}

              {report.comeback ? (
                <article className="rc-story">
                  <p className="rc-story-figure">
                    {report.comeback.silentDays.toLocaleString()} days, then this
                  </p>
                  <div>
                    <h3 className="rc-h3">
                      Somebody broke the silence with{" "}
                      <UserString value={report.comeback.conversation} />
                    </h3>
                    <p className="rc-body" style={{ marginTop: "0.5rem" }}>
                      {report.comeback.revivedByYou
                        ? `After all that time, you were the one who caved — on ${formatDate(report.comeback.revivedAtMs)}.`
                        : `They resurfaced first, on ${formatDate(report.comeback.revivedAtMs)}.`}
                    </p>
                  </div>
                  <p className="rc-pull">
                    <Redactable
                      text={report.comeback.message.text}
                      hidden={hidden && !revealedIds.has(report.comeback.message.id)}
                      names={names}
                      onToggle={() => toggleReveal(report.comeback!.message.id)}
                    />
                  </p>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {report.signatureWords.length > 0 ? (
          <section className="rc-section" aria-labelledby="rc-report-words">
            <div className="rc-section-head">
              <div>
                <h2 className="rc-h2" id="rc-report-words">
                  Words you cannot stop typing
                </h2>
                <p className="rc-body" style={{ marginTop: "0.75rem" }}>
                  Counted across your own messages only, with the filler removed.
                </p>
              </div>
            </div>
            <ul className="rc-words">
              {report.signatureWords.map((word) => (
                <li className="rc-word" key={word.word}>
                  {word.word}
                  <b>{word.count.toLocaleString()}</b>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="rc-foot">
          <Link href="/receipts" className="rc-link">
            Back to Receipts
          </Link>
          <Link href="/dashboard" className="rc-link">
            Read the full archive
          </Link>
          <span>
            Nothing on this page left your device, and it disappears when you close
            the tab.
          </span>
        </footer>
      </div>
    </main>
  );
}
