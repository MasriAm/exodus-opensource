"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Mark } from "@/components/capsule/mark";
import { StatePanel } from "@/components/state-panel";
import { UserText } from "@/components/user-text";
import { formatDateTime, pluralize } from "@/lib/format";

export type SearchHit = {
  conversation: string;
  sender: string;
  sentAt: number | string | Date;
  snippet: string;
  matchTerms?: string[];
  rowId?: number;
};

function groupByConversation(results: SearchHit[]): Map<string, SearchHit[]> {
  const grouped = new Map<string, SearchHit[]>();
  for (const result of results) {
    const hits = grouped.get(result.conversation) ?? [];
    hits.push(result);
    grouped.set(result.conversation, hits);
  }
  return grouped;
}

function highlightSnippet(snippet: string, terms: string[]) {
  if (terms.length === 0) {
    return snippet;
  }
  const escaped = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean);
  if (escaped.length === 0) {
    return snippet;
  }
  const parts = snippet.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  const lowerTerms = new Set(terms.map((term) => term.toLocaleLowerCase()));
  return parts.map((part, index) =>
    lowerTerms.has(part.toLocaleLowerCase()) ? (
      <Mark key={`${part}-${index}`}>{part}</Mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

type SearchViewProps = {
  results: SearchHit[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  initialTerm?: string;
  /** Sticky person filter ignored by search (shown as a hint). */
  ignoredConversation?: string | null;
  onSearch: (term: string) => void;
  onOpenConversation?: (conversation: string, targetMessage?: { rowId: number; sentAtMs: number }) => void;
};

export function SearchView({
  results,
  loading,
  error,
  hasSearched,
  initialTerm = "",
  ignoredConversation = null,
  onSearch,
  onOpenConversation,
}: SearchViewProps) {
  const [term, setTerm] = useState(initialTerm);
  const [lastTerm, setLastTerm] = useState(initialTerm);

  useEffect(() => {
    if (initialTerm && initialTerm !== term) {
      setTerm(initialTerm);
      setLastTerm(initialTerm);
      onSearch(initialTerm);
    }
    // Only react to external initialTerm changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTerm]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = term.trim();
    if (normalized.length >= 1) {
      setLastTerm(normalized);
      onSearch(normalized);
    }
  };

  const grouped = groupByConversation(results);
  const highlightTerms = lastTerm
    .replace(/(?:^|\s)(from|in|before|after|has):(?:"[^"]+"|\S+)/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <p className="font-body text-[15px] leading-7 text-body">
        Find a phrase, name, or date across every thread — the query never leaves
        this browser.
      </p>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 border-b border-ink/20 py-2 sm:flex-row sm:items-end"
        role="search"
      >
        <label className="flex min-w-0 flex-1 items-center gap-3">
          <Search aria-hidden="true" className="size-4 shrink-0 text-body" />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            dir="auto"
            placeholder='from:sara in:"group" after:2019 has:media'
            className="h-10 min-w-0 flex-1 bg-transparent font-display text-[15px] text-ink outline-none placeholder:text-body"
          />
        </label>
        <button
          type="submit"
          disabled={loading || term.trim().length < 1}
          className="font-display text-[11px] uppercase tracking-[0.08em] text-teal hover:underline disabled:opacity-40"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>
      <p className="font-display text-[11px] uppercase tracking-[0.06em] text-body">
        Tokens: from: · in: · before: · after: · has:media
      </p>

      {ignoredConversation ? (
        <p className="font-body text-[13px] text-body">
          Search covers every thread — the{" "}
          <UserText className="font-semibold text-ink">
            {ignoredConversation}
          </UserText>{" "}
          filter is ignored here. Use{" "}
          <code className="font-display text-[12px] text-ink">
            in:&quot;{ignoredConversation}&quot;
          </code>{" "}
          to scope it back.
        </p>
      ) : null}

      {error ? (
        <StatePanel
          kind="error"
          title="Search could not be completed"
          description={error}
        />
      ) : loading ? (
        <StatePanel
          kind="loading"
          title="Searching locally"
          description="DuckDB is scanning message text inside the browser worker."
        />
      ) : !hasSearched ? (
        <StatePanel
          icon={Search}
          title="Type a word to begin"
          description="Results appear as quiet rows — never as an error when nothing matches."
        />
      ) : results.length === 0 ? (
        <StatePanel
          title="No matching messages"
          description="Try another word, spelling, Arabic phrase, or search token."
        />
      ) : (
        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b border-ink/20 pb-3">
            <h2 className="font-display text-[17px] font-bold text-ink">
              {pluralize(results.length, "match", "matches")}
              {results.length >= 200 ? " (showing first 200)" : ""}
            </h2>
            <p className="font-display text-[11px] uppercase tracking-[0.08em] text-body">
              {pluralize(grouped.size, "conversation")}
            </p>
          </div>
          <div className="max-h-[min(62vh,36rem)] space-y-8 overflow-y-auto overscroll-contain pe-1">
            {[...grouped.entries()].map(([conversation, hits]) => (
              <section key={conversation}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <UserText
                    as="h3"
                    className="font-body text-sm font-semibold text-ink"
                  >
                    {conversation}
                  </UserText>
                  {onOpenConversation ? (
                    <button
                      type="button"
                      className="font-display text-[11px] uppercase tracking-[0.08em] text-teal hover:underline"
                      onClick={() => onOpenConversation(conversation)}
                    >
                      Open thread
                    </button>
                  ) : null}
                </div>
                <ol className="mt-2 border-y border-ink/20">
                  {hits.map((hit, index) => (
                    <li
                      key={`${String(hit.sentAt)}-${hit.sender}-${index}`}
                      className="border-b border-ink/20 last:border-b-0"
                    >
                      <button
                        type="button"
                        className="interactive-row block w-full py-3 text-left"
                        onClick={() => onOpenConversation?.(conversation, { rowId: hit.rowId ?? 0, sentAtMs: Number(hit.sentAt) })}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <UserText className="font-body text-xs font-semibold text-teal">
                            {hit.sender}
                          </UserText>
                          <time
                            dateTime={new Date(hit.sentAt).toISOString()}
                            className="font-display text-[11px] uppercase tracking-[0.08em] text-body"
                          >
                            {formatDateTime(hit.sentAt)}
                          </time>
                        </div>
                        <p
                          dir="auto"
                          className="mt-2 whitespace-pre-wrap break-words font-body text-[15px] leading-7 text-ink [unicode-bidi:isolate]"
                        >
                          {highlightSnippet(
                            hit.snippet,
                            hit.matchTerms?.length
                              ? hit.matchTerms
                              : highlightTerms,
                          )}
                        </p>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
