"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { ActivityHeatmapView } from "./activity-heatmap-view";
import {
  CommandPalette,
  type DeskSection,
} from "./command-palette";
import { DeskHome } from "./desk-home";
import { ExportView } from "./export-view";
import { FilterBar } from "./filter-bar";
import { FootprintView } from "./footprint-view";
import { DashboardHeader } from "./header";
import { MediaView, type MediaItem as MediaViewItem } from "./media-view";
import {
  MessagesView,
  type ConversationItem,
  type MessageItem as MessageViewItem,
} from "./messages-view";
import { PeopleView } from "./people-view";
import { SearchView, type SearchHit as SearchViewHit } from "./search-view";
import { DashboardSidebar } from "./sidebar";
import { YearFilmstrip } from "./year-filmstrip";

import type { ArchiveFilter } from "@/lib/db/archive-filter";
import { yearBoundsMs } from "@/lib/db/archive-filter";
import type {
  DeskHomeResult,
  FilterOptionsResult,
  FootprintResult,
  IngestApi,
  MediaItem,
  MessageCursor,
  MessageHeatmapResult,
  MessageItem,
  PeopleListItem,
  PersonDetailResult,
  SearchHit,
} from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";

const VIEW_LABELS: Record<DeskSection, { eyebrow: string; title: string }> = {
  desk: { eyebrow: "Reading desk", title: "Your archive at a glance" },
  people: { eyebrow: "Card catalog", title: "People" },
  messages: { eyebrow: "Index cards", title: "Messages" },
  media: { eyebrow: "Contact sheet", title: "Media" },
  activity: { eyebrow: "Microfilm calendar", title: "Activity" },
  search: { eyebrow: "Across every thread", title: "Search" },
  footprint: { eyebrow: "Outside the DMs", title: "Footprint" },
  export: { eyebrow: "Portable by design", title: "Export" },
};

function mapMessage(message: MessageItem): MessageViewItem {
  return {
    conversation: message.conversation,
    sender: message.sender,
    sentAt: message.sentAtMs,
    text: message.text,
    mediaRef: message.mediaRef,
  };
}

function mapSearchHit(hit: SearchHit): SearchViewHit {
  return {
    conversation: hit.conversation,
    sender: hit.sender,
    sentAt: hit.sentAtMs,
    snippet: hit.snippet,
    matchTerms: hit.matchTerms,
    rowId: hit.rowId,
  };
}

function mapMediaItem(item: MediaItem): MediaViewItem {
  return {
    zipPath: item.zipPath,
    kind: item.kind,
    takenAt: item.takenAtMs,
    conversation: item.conversation,
  };
}

function yearsFromRange(fromMs: number | null, toMs: number | null): number[] {
  if (fromMs === null || toMs === null) {
    return [];
  }
  const start = new Date(fromMs).getUTCFullYear();
  const end = new Date(toMs).getUTCFullYear();
  const years: number[] = [];
  for (let year = start; year <= end; year += 1) {
    years.push(year);
  }
  return years;
}

type DashboardClientProps = {
  api: IngestApi;
};

export function DashboardClient({ api }: DashboardClientProps) {
  const [activeView, setActiveView] = useState<DeskSection>("desk");
  const [filter, setFilter] = useState<ArchiveFilter>({});
  const [year, setYear] = useState<number | null>(null);
  const [options, setOptions] = useState<FilterOptionsResult | null>(null);
  const [desk, setDesk] = useState<DeskHomeResult | null>(null);
  const [deskLoading, setDeskLoading] = useState(true);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<MessageItem | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [searchSeed, setSearchSeed] = useState("");

  const [people, setPeople] = useState<PeopleListItem[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [personDetail, setPersonDetail] = useState<PersonDetailResult | null>(
    null,
  );
  const [personLoading, setPersonLoading] = useState(false);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<MessageViewItem[]>([]);
  const [messageCursor, setMessageCursor] = useState<MessageCursor | null>(null);
  const [messagesHaveMore, setMessagesHaveMore] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<SearchViewHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [media, setMedia] = useState<MediaViewItem[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const [heatmap, setHeatmap] = useState<MessageHeatmapResult | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [selectedDayMs, setSelectedDayMs] = useState<number | null>(null);
  const [dayMessages, setDayMessages] = useState<MessageItem[]>([]);
  const [dayLoading, setDayLoading] = useState(false);

  const [footprint, setFootprint] = useState<FootprintResult | null>(null);
  const [footprintLoading, setFootprintLoading] = useState(false);
  const [footprintError, setFootprintError] = useState<string | null>(null);

  const effectiveFilter = useMemo(() => {
    if (year === null) {
      return filter;
    }
    const bounds = yearBoundsMs(year);
    return {
      ...filter,
      fromMs: filter.fromMs ?? bounds.fromMs,
      toMs: filter.toMs ?? bounds.toMs,
    };
  }, [filter, year]);

  const years = useMemo(
    () => yearsFromRange(options?.activeFromMs ?? null, options?.activeToMs ?? null),
    [options],
  );

  const showFootprint = Boolean(
    footprint &&
      (footprint.comments.length > 0 ||
        footprint.interestsByYear.length > 0 ||
        footprint.profileHistory.length > 0),
  );

  useEffect(() => {
    let active = true;
    void api
      .query("filterOptions")
      .then((result) => {
        if (active) {
          setOptions(result);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

  useEffect(() => {
    let active = true;
    setDeskLoading(true);
    setDeskError(null);
    void api
      .query("deskHome", { filter: effectiveFilter })
      .then((result) => {
        if (active) {
          setDesk(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setDeskError(
            friendlyError(loadError, "The reading desk could not be opened."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setDeskLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, effectiveFilter]);

  useEffect(() => {
    let active = true;
    void api
      .query("footprint", { filter: effectiveFilter })
      .then((result) => {
        if (active) {
          setFootprint(result);
          setFootprintLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setFootprintError(
            friendlyError(loadError, "Footprint data could not be loaded."),
          );
          setFootprintLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, effectiveFilter]);

  useEffect(() => {
    if (activeView !== "people") {
      return;
    }
    let active = true;
    setPeopleLoading(true);
    setPeopleError(null);
    void api
      .query("peopleList", { filter: effectiveFilter, limit: 500 })
      .then((result) => {
        if (!active) {
          return;
        }
        setPeople(result.items);
        setSelectedPerson((current) => {
          if (
            current &&
            result.items.some((item) => item.conversation === current)
          ) {
            return current;
          }
          return result.items[0]?.conversation ?? null;
        });
      })
      .catch((loadError: unknown) => {
        if (active) {
          setPeopleError(
            friendlyError(loadError, "The people index could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setPeopleLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter]);

  useEffect(() => {
    if (activeView !== "people" || !selectedPerson) {
      return;
    }
    let active = true;
    setPersonLoading(true);
    void api
      .query("personDetail", {
        conversation: selectedPerson,
        filter: {
          fromMs: effectiveFilter.fromMs,
          toMs: effectiveFilter.toMs,
          platform: effectiveFilter.platform,
        },
      })
      .then((result) => {
        if (active) {
          setPersonDetail(result);
        }
      })
      .catch(() => {
        if (active) {
          setPersonDetail(null);
        }
      })
      .finally(() => {
        if (active) {
          setPersonLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter, selectedPerson]);

  useEffect(() => {
    if (activeView !== "messages") {
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setMessagesError(null);
    void api
      .query("conversationList", {
        limit: 1_000,
        offset: 0,
        filter: effectiveFilter,
      })
      .then((conversationResult) => {
        if (!active) {
          return;
        }
        const nextConversations = conversationResult.items.map(
          (conversation): ConversationItem => ({
            conversation: conversation.conversation,
            messageCount: conversation.messageCount,
            lastMessageAt: conversation.lastMessageAtMs,
            lastSnippet: conversation.preview,
          }),
        );
        setConversations(nextConversations);
        setSelectedConversation((current) => {
          if (
            current !== null &&
            nextConversations.some((item) => item.conversation === current)
          ) {
            return current;
          }
          return nextConversations[0]?.conversation ?? null;
        });
        if (nextConversations.length === 0) {
          setMessagesLoading(false);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setMessagesError(
            friendlyError(
              loadError,
              "The local archive database could not be opened.",
            ),
          );
          setMessagesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter]);

  useEffect(() => {
    if (activeView !== "messages" || selectedConversation === null) {
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setMessagesError(null);
    setMessages([]);
    setMessageCursor(null);
    void api
      .query("messagesPage", {
        conversation: selectedConversation,
        limit: 100,
        filter: {
          fromMs: effectiveFilter.fromMs,
          toMs: effectiveFilter.toMs,
          platform: effectiveFilter.platform,
        },
      })
      .then((result) => {
        if (!active) {
          return;
        }
        setMessages([...result.items].reverse().map(mapMessage));
        setMessageCursor(result.nextBefore);
        setMessagesHaveMore(result.hasMore);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setMessagesError(
            friendlyError(loadError, "This conversation could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setMessagesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter, selectedConversation]);

  useEffect(() => {
    if (activeView !== "media") {
      return;
    }
    let active = true;
    setMediaLoading(true);
    setMediaError(null);
    void api
      .query("mediaList", { limit: 10_000, offset: 0, filter: effectiveFilter })
      .then((result) => {
        if (active) {
          setMedia(result.items.map(mapMediaItem));
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setMediaError(
            friendlyError(loadError, "The media index could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setMediaLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter]);

  useEffect(() => {
    if (activeView !== "activity") {
      return;
    }
    const targetYear =
      year ??
      years[years.length - 1] ??
      new Date().getUTCFullYear();
    let active = true;
    setHeatmapLoading(true);
    setHeatmapError(null);
    void api
      .query("messageHeatmap", {
        year: targetYear,
        filter: {
          platform: filter.platform,
          conversation: filter.conversation,
        },
      })
      .then((result) => {
        if (active) {
          setHeatmap(result);
          setSelectedDayMs(null);
          setDayMessages([]);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setHeatmapError(
            friendlyError(loadError, "The activity calendar could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active) {
          setHeatmapLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, filter.conversation, filter.platform, year, years]);

  const loadEarlierMessages = useCallback(() => {
    if (
      selectedConversation === null ||
      messageCursor === null ||
      messagesLoading
    ) {
      return;
    }
    setMessagesLoading(true);
    void api
      .query("messagesPage", {
        conversation: selectedConversation,
        before: messageCursor,
        limit: 100,
        filter: {
          fromMs: effectiveFilter.fromMs,
          toMs: effectiveFilter.toMs,
          platform: effectiveFilter.platform,
        },
      })
      .then((result) => {
        const earlier = [...result.items].reverse().map(mapMessage);
        setMessages((current) => [...earlier, ...current]);
        setMessageCursor(result.nextBefore);
        setMessagesHaveMore(result.hasMore);
      })
      .catch((loadError: unknown) => {
        setMessagesError(
          friendlyError(loadError, "Earlier messages could not be loaded."),
        );
      })
      .finally(() => setMessagesLoading(false));
  }, [
    api,
    effectiveFilter,
    messageCursor,
    messagesLoading,
    selectedConversation,
  ]);

  const search = useCallback(
    (term: string) => {
      setSearchLoading(true);
      setSearchError(null);
      setHasSearched(true);
      void api
        .query("search", { term, limit: 500, offset: 0, filter: effectiveFilter })
        .then((result) => {
          setSearchResults(
            result.groups.flatMap((group) => group.hits.map(mapSearchHit)),
          );
        })
        .catch((queryError: unknown) => {
          setSearchError(
            friendlyError(queryError, "The local search could not be completed."),
          );
        })
        .finally(() => setSearchLoading(false));
    },
    [api, effectiveFilter],
  );

  const readMediaBlob = useCallback(
    (zipPath: string) => api.readMediaBlob(zipPath),
    [api],
  );
  const exportTable = useCallback(
    (table: "messages" | "media" | "events", format: "csv" | "json") =>
      api.exportTable(table, format),
    [api],
  );

  const openPerson = useCallback((conversation: string) => {
    setSelectedPerson(conversation);
    setActiveView("people");
  }, []);

  const openMessages = useCallback((conversation: string) => {
    setSelectedConversation(conversation);
    setActiveView("messages");
  }, []);

  const onSurprise = useCallback(() => {
    void api
      .query("surpriseMemory", { filter: effectiveFilter })
      .then((result) => setSurprise(result.message))
      .catch(() => setSurprise(null));
  }, [api, effectiveFilter]);

  const onSelectDay = useCallback(
    (dayMs: number) => {
      setSelectedDayMs(dayMs);
      setDayLoading(true);
      void api
        .query("dayMessages", { dayMs, filter: effectiveFilter, limit: 300 })
        .then((result) => setDayMessages(result.items))
        .catch(() => setDayMessages([]))
        .finally(() => setDayLoading(false));
    },
    [api, effectiveFilter],
  );

  const activeLabel = VIEW_LABELS[activeView];
  const messageCount = desk?.messages;

  const activeContent = (() => {
    switch (activeView) {
      case "desk":
        if (deskError) {
          return (
            <p className="font-body text-coral" role="alert">
              {deskError}
            </p>
          );
        }
        if (deskLoading || !desk) {
          return (
            <p className="font-body text-body">Laying out the reading desk…</p>
          );
        }
        return (
          <DeskHome
            data={desk}
            readBlob={readMediaBlob}
            onOpenPeople={() => setActiveView("people")}
            onOpenSearch={(query) => {
              if (query) {
                setSearchSeed(query);
              }
              setActiveView("search");
            }}
            onOpenPerson={openPerson}
            onOpenActivity={() => setActiveView("activity")}
            onOpenMedia={() => setActiveView("media")}
            onSurprise={onSurprise}
            surprise={surprise}
          />
        );
      case "people":
        return (
          <PeopleView
            people={people}
            loading={peopleLoading}
            error={peopleError}
            selected={selectedPerson}
            detail={personDetail}
            detailLoading={personLoading}
            onSelect={setSelectedPerson}
            onOpenMessages={openMessages}
            readBlob={readMediaBlob}
          />
        );
      case "messages":
        return (
          <MessagesView
            conversations={conversations}
            selectedConversation={selectedConversation}
            messages={messages}
            loading={messagesLoading}
            error={messagesError}
            hasMore={messagesHaveMore}
            onSelectConversation={setSelectedConversation}
            onLoadMore={loadEarlierMessages}
          />
        );
      case "search":
        return (
          <SearchView
            results={searchResults}
            loading={searchLoading}
            error={searchError}
            hasSearched={hasSearched}
            initialTerm={searchSeed}
            onSearch={search}
            onOpenConversation={openMessages}
          />
        );
      case "media":
        return (
          <MediaView
            items={media}
            loading={mediaLoading}
            error={mediaError}
            readBlob={readMediaBlob}
          />
        );
      case "activity":
        return (
          <ActivityHeatmapView
            heatmap={heatmap}
            loading={heatmapLoading}
            error={heatmapError}
            selectedDayMs={selectedDayMs}
            dayMessages={dayMessages}
            dayLoading={dayLoading}
            onSelectDay={onSelectDay}
            onOpenConversation={openMessages}
          />
        );
      case "footprint":
        return (
          <FootprintView
            data={footprint}
            loading={footprintLoading}
            error={footprintError}
          />
        );
      case "export":
        return <ExportView exportTable={exportTable} />;
    }
  })();

  return (
    <main className="min-h-screen bg-paper lg:flex">
      <DashboardSidebar
        active={activeView}
        onSelect={setActiveView}
        showFootprint={showFootprint || footprintLoading}
        onOpenCommands={() => setCommandsOpen(true)}
      />
      <div className="min-w-0 flex-1 border-ink bg-cream/40 lg:border-s-2">
        <DashboardHeader
          eyebrow={activeLabel.eyebrow}
          title={activeLabel.title}
          messageCount={messageCount}
        />
        <div className="mx-auto w-full max-w-[1140px] space-y-4 p-4 sm:p-6 lg:p-8">
          {activeView !== "desk" ? (
            <>
              <label className="flex min-w-0 items-center gap-2 border-b border-ink/20 px-1 py-2">
                <Search
                  aria-hidden="true"
                  className="size-4 shrink-0 text-body"
                />
                <input
                  className="min-w-0 flex-1 bg-transparent font-display text-sm outline-none placeholder:text-body"
                  placeholder="Search the archive — Ctrl+K"
                  dir="auto"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const value = (
                        event.target as HTMLInputElement
                      ).value.trim();
                      if (value) {
                        setSearchSeed(value);
                        setActiveView("search");
                        search(value);
                      }
                    }
                  }}
                />
              </label>

              <YearFilmstrip years={years} value={year} onChange={setYear} />
              <FilterBar
                options={options}
                filter={filter}
                onChange={(next) => {
                  setFilter(next);
                }}
              />
            </>
          ) : null}
          {activeContent}
        </div>
      </div>

      <CommandPalette
        open={commandsOpen}
        onOpenChange={setCommandsOpen}
        options={options}
        hasFootprint={showFootprint || footprintLoading}
        onGoSection={setActiveView}
        onGoPerson={openPerson}
        onSearch={(query) => {
          setSearchSeed(query);
          setActiveView("search");
          search(query);
        }}
      />
    </main>
  );
}
