"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Mark } from "@/components/capsule/mark";
import { PressButton } from "@/components/capsule/press-button";
import { StatePanel } from "@/components/state-panel";
import { formatDateTime, formatNumber } from "@/lib/format";

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
  onSearch: (term: string) => void;
  onOpenConversation?: (conversation: string) => void;
};

export function SearchView({
  results,
  loading,
  error,
  hasSearched,
  initialTerm = "",
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
    <div className="space-y-5">
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 border-b-2 border-ink bg-cream px-3 py-3 sm:flex-row sm:items-end"
        role="search"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="meta-caps">Search</span>
          <span className="flex items-center gap-3">
            <Search aria-hidden="true" className="size-5 shrink-0 text-body" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              dir="auto"
              placeholder='from:sara in:"group" after:2019 has:media …'
              className="h-10 min-w-0 flex-1 border-0 bg-transparent font-display text-base text-ink outline-none placeholder:text-body"
            />
          </span>
        </label>
        <PressButton type="submit" disabled={loading || term.trim().length < 1}>
          {loading ? "Searching…" : "Search"}
        </PressButton>
      </form>
      <p className="font-body text-xs text-body">
        Tokens: <Mark>from:</Mark> <Mark>in:</Mark> <Mark>before:</Mark>{" "}
        <Mark>after:</Mark> <Mark>has:media</Mark>
      </p>

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
          title="Find a moment"
          description="Search every message without sending a query—or your archive—anywhere."
        />
      ) : results.length === 0 ? (
        <StatePanel
          title="No matching messages"
          description="Try another word, spelling, Arabic phrase, or search token."
        />
      ) : (
        <section className="border-strong bg-cream p-5 shadow-press sm:p-7">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="meta-caps">Results</p>
              <h2 className="mt-1 font-display text-xl font-bold">
                {formatNumber(results.length)} matches
              </h2>
            </div>
            <p className="meta-caps">
              {formatNumber(grouped.size)} conversations
            </p>
          </div>
          <div className="space-y-7">
            {[...grouped.entries()].map(([conversation, hits]) => (
              <section key={conversation}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 dir="auto" className="font-display text-base font-bold">
                    {conversation}
                  </h3>
                  {onOpenConversation ? (
                    <button
                      type="button"
                      className="font-display text-xs text-teal underline underline-offset-4"
                      onClick={() => onOpenConversation(conversation)}
                    >
                      Open thread
                    </button>
                  ) : null}
                </div>
                <ol className="mt-3 divide-y divide-ink/20 border-strong bg-receipt">
                  {hits.map((hit, index) => (
                    <li
                      key={`${String(hit.sentAt)}-${hit.sender}-${index}`}
                      className="p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span
                          dir="auto"
                          className="font-display tracking-[0.02em] text-teal"
                        >
                          {hit.sender}
                        </span>
                        <time
                          dateTime={new Date(hit.sentAt).toISOString()}
                          className="meta-caps"
                        >
                          {formatDateTime(hit.sentAt)}
                        </time>
                      </div>
                      <p
                        dir="auto"
                        className="mt-2 whitespace-pre-wrap break-words font-body text-sm leading-6 text-ink"
                      >
                        {highlightSnippet(
                          hit.snippet,
                          hit.matchTerms?.length
                            ? hit.matchTerms
                            : highlightTerms,
                        )}
                      </p>
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
