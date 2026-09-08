"use client";

import { useMemo } from "react";

import { formatDate } from "@/lib/format";
import { maskToBlocks, redactText } from "@/lib/drama/redact";
import { displayConversationLabel } from "@/lib/instagram-labels";
import { containsArabic } from "@/lib/ui-text";
import type { EvidenceExhibit, EvidenceItem } from "@/lib/drama/types";

export { maskToBlocks };

/**
 * Any string that came out of somebody's archive, rendered safely: bidi
 * isolated so a right-to-left message cannot reorder the interface around it,
 * and flagged for Arabic so the CSS can drop the monospace evidence face.
 */
export function UserString({
  value,
  as: Tag = "span",
  className,
}: {
  value: string;
  as?: "span" | "p" | "div";
  className?: string;
}) {
  return (
    <Tag
      dir="auto"
      data-arabic={containsArabic(value)}
      className={`rc-user-text ${className ?? ""}`}
    >
      <bdi>{value}</bdi>
    </Tag>
  );
}

type RedactableProps = {
  text: string;
  hidden: boolean;
  /** Names masked even once revealed, so a screenshot stays share-safe. */
  names?: readonly string[];
  onToggle: () => void;
  className?: string;
};

export function Redactable({
  text,
  hidden,
  names = [],
  onToggle,
  className,
}: RedactableProps) {
  const shown = useMemo(
    () => (names.length > 0 ? redactText(text, names) : text),
    [names, text],
  );
  const masked = useMemo(() => maskToBlocks(text), [text]);

  return (
    <button
      type="button"
      className={`rc-reveal ${className ?? ""}`}
      onClick={onToggle}
      aria-pressed={!hidden}
      aria-label={hidden ? "Reveal this message" : "Hide this message"}
    >
      {hidden ? (
        <span className="rc-redacted" aria-hidden="true">
          {masked}
        </span>
      ) : (
        <UserString value={shown} />
      )}
      {hidden ? <span className="sr-only">Message hidden. Tap to reveal.</span> : null}
    </button>
  );
}

function whoLabel(item: EvidenceItem): string {
  return item.isSelf ? "you" : displayConversationLabel(item.conversation);
}

type ReceiptStripProps = {
  exhibit: EvidenceExhibit;
  /** Index within the report, used for the exhibit letter. */
  index: number;
  hidden: boolean;
  onToggle: (messageId: number) => void;
  revealed: ReadonlySet<number>;
  names?: readonly string[];
};

/**
 * One category of evidence, printed as a till roll. The exhibit letter is real
 * indexing — these are the numbered items of a case file, in order.
 */
export function ReceiptStrip({
  exhibit,
  index,
  hidden,
  onToggle,
  revealed,
  names,
}: ReceiptStripProps) {
  const letter = String.fromCharCode(65 + (index % 26));

  return (
    <article className="rc-strip">
      <header className="rc-strip-head">
        <h3 className="rc-strip-title">
          <span aria-hidden="true">{exhibit.category.emoji} </span>
          {exhibit.category.label}
        </h3>
        <span className="rc-strip-count">Exhibit {letter}</span>
      </header>

      <p className="rc-quote-meta" style={{ marginTop: 0 }}>
        {exhibit.category.blurb}
      </p>

      {exhibit.items.map((item) => {
        const isHidden = hidden && !revealed.has(item.messageId);
        return (
          <blockquote key={item.messageId} className="rc-quote">
            <Redactable
              text={item.text}
              hidden={isHidden}
              names={names}
              onToggle={() => onToggle(item.messageId)}
            />
            <span className="rc-quote-meta">
              <UserString value={whoLabel(item)} />
              <span aria-hidden="true">·</span>
              <span>{formatDate(item.sentAtMs)}</span>
            </span>
          </blockquote>
        );
      })}

      <p className="rc-strip-foot">
        {exhibit.totalMatches.toLocaleString()} message
        {exhibit.totalMatches === 1 ? "" : "s"} matched this pattern
      </p>
    </article>
  );
}
