"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DeskSection } from "./desk-section";
import { FilterBar } from "./filter-bar";
import { DashboardHeader } from "./header";
import type { MediaItem as MediaViewItem } from "./media-view";
import type {
  ConversationItem,
  MessageItem as MessageViewItem,
} from "./messages-view";
import { IdentityManager } from "./identity-manager";
import { useUnifiedIdentities } from "@/lib/use-unified-identities";
import type { SearchHit as SearchViewHit } from "./search-view";
import { DashboardSidebar } from "./sidebar";

import { useArchiveSession, setSessionFlash } from "@/components/archive-session";
import { PressButton } from "@/components/capsule/press-button";
import { StatePanel } from "@/components/state-panel";
import type { ArchiveFilter } from "@/lib/db/archive-filter";
import { yearBoundsMs } from "@/lib/db/archive-filter";
import type {
  DeskHomeResult,
  FilterOptionsResult,
  FootprintResult,
  IngestApi,
  MediaItem,
  MessageHeatmapResult,
  MessageItem,
  PeopleListItem,
  PersonDetailResult,
  SearchHit,
} from "@/lib/db/types";
import { friendlyError } from "@/lib/errors";
import { isQueryTimeoutError } from "@/lib/query-timeout";

function SectionLoading({ title }: { title: string }) {
  return (
    <StatePanel
      kind="loading"
      title={title}
      description="Loading this section of the desk."
    />
  );
}

const DeskHome = dynamic(
  () => import("./desk-home").then((mod) => mod.DeskHome),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening the overview" />,
  },
);
const PeopleView = dynamic(
  () => import("./people-view").then((mod) => mod.PeopleView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening the card catalog" />,
  },
);
const MessagesView = dynamic(
  () => import("./messages-view").then((mod) => mod.MessagesView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening messages" />,
  },
);
const SearchView = dynamic(
  () => import("./search-view").then((mod) => mod.SearchView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening search" />,
  },
);
const MediaView = dynamic(
  () => import("./media-view").then((mod) => mod.MediaView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening media" />,
  },
);
const ActivityHeatmapView = dynamic(
  () =>
    import("./activity-heatmap-view").then((mod) => mod.ActivityHeatmapView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening the calendar" />,
  },
);
const FootprintView = dynamic(
  () => import("./footprint-view").then((mod) => mod.FootprintView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening footprint" />,
  },
);
const ExportView = dynamic(
  () => import("./export-view").then((mod) => mod.ExportView),
  {
    ssr: false,
    loading: () => <SectionLoading title="Opening export" />,
  },
);

const VIEW_LABELS: Record<
  DeskSection,
  { eyebrow: string; title: string; subtitle: string }
> = {
  desk: {
    eyebrow: "Archive terminal",
    title: "Overview",
    subtitle:
      "The overview of what you imported — counts, a search, and a few places to start.",
  },
  people: {
    eyebrow: "Card catalog",
    title: "Personnel analysis",
    subtitle:
      "Every correspondent in the archive, with streaks, silence, and shared media.",
  },
  messages: {
    eyebrow: "Correspondence",
    title: "Message archive",
    subtitle: "Threads and their messages, still sitting only in this browser.",
  },
  media: {
    eyebrow: "Contact sheet",
    title: "Media archive",
    subtitle: "Photographs and attachments pulled from the export on demand.",
  },
  activity: {
    eyebrow: "Year ledger",
    title: "Activity calendar",
    subtitle:
      "Message density across a year — click any active day to read what landed.",
  },
  search: {
    eyebrow: "Across every thread",
    title: "Search",
    subtitle: "Find a line, a name, or a token without sending a query anywhere.",
  },
  footprint: {
    eyebrow: "Outside the DMs",
    title: "Digital footprint",
    subtitle: "Public comments, interests, and identity changes from the export.",
  },
  identity: {
    eyebrow: "Unified Entities",
    title: "Merged Contacts",
    subtitle: "Link conversations across different platforms into a unified person.",
  },
  export: {
    eyebrow: "Portable by design",
    title: "Export",
    subtitle: "Download a formatted spreadsheet or JSON from the local database.",
  },
};

function mapMessage(message: MessageItem): MessageViewItem {
  return {
    conversation: message.conversation,
    sender: message.sender,
    sentAt: message.sentAtMs,
    text: message.text,
    mediaRef: message.mediaRef,
    platform: message.platform,
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

const MESSAGES_PAGE_SIZE = 18;
const MEDIA_PAGE_SIZE = 24;

export function DashboardClient({ api }: DashboardClientProps) {
  const router = useRouter();
  const {
    identities: unifiedIdentities,
    addIdentity,
    removeIdentity,
  } = useUnifiedIdentities();
  const { reloadSession } = useArchiveSession();
  const [activeView, setActiveView] = useState<DeskSection>("desk");
  const [deskRetryToken, setDeskRetryToken] = useState(0);
  const [filter, setFilter] = useState<ArchiveFilter>({});
  const [year, setYear] = useState<number | null>(null);
  const [options, setOptions] = useState<FilterOptionsResult | null>(null);
  const [desk, setDesk] = useState<DeskHomeResult | null>(null);
  const [deskLoading, setDeskLoading] = useState(true);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [surprise, setSurprise] = useState<MessageItem | null>(null);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseEmpty, setSurpriseEmpty] = useState(false);
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
  const [messagesPage, setMessagesPage] = useState(1);
  const [messagesTotalPages, setMessagesTotalPages] = useState(1);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaKind, setMediaKind] = useState<
    "image" | "video" | "audio" | "other"
  >("image");

  const [searchResults, setSearchResults] = useState<SearchViewHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [media, setMedia] = useState<MediaViewItem[]>([]);
  const [mediaTotalCount, setMediaTotalCount] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const searchSeqRef = useRef(0);
  const [peopleOffset, setPeopleOffset] = useState(0);
  const [peopleHasMore, setPeopleHasMore] = useState(false);
  const [workerStalled, setWorkerStalled] = useState(false);

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
    let resolvedFilter = filter;
    if (filter.conversation?.startsWith("unified:")) {
      const identityId = filter.conversation.slice(8);
      const identity = unifiedIdentities.find(id => id.id === identityId);
      if (identity) {
        resolvedFilter = {
          ...filter,
          conversation: null,
          unifiedAliases: identity.aliases,
        };
      } else {
        // The unified identity was deleted; fall back to "Everyone".
        resolvedFilter = {
          ...filter,
          conversation: null,
        };
      }
    }

    if (year === null) {
      return resolvedFilter;
    }
    const bounds = yearBoundsMs(year);
    return {
      ...resolvedFilter,
      fromMs: resolvedFilter.fromMs ?? bounds.fromMs,
      toMs: resolvedFilter.toMs ?? bounds.toMs,
    };
  }, [filter, year, unifiedIdentities]);

  const years = useMemo(
    () => yearsFromRange(options?.activeFromMs ?? null, options?.activeToMs ?? null),
    [options],
  );

  // If a unified identity is deleted while it is the active filter, fallback to Everyone.
  useEffect(() => {
    if (filter.conversation?.startsWith("unified:")) {
      const identityId = filter.conversation.slice(8);
      const exists = unifiedIdentities.some(id => id.id === identityId);
      if (!exists) {
        setFilter(current => ({ ...current, conversation: null }));
      }
    }
  }, [filter.conversation, unifiedIdentities, setFilter]);

  const showFootprint = Boolean(
    footprint &&
      (footprint.comments.length > 0 ||
        footprint.interestsByYear.length > 0 ||
        footprint.profileHistory.length > 0 ||
        footprint.followEvents.length > 0 ||
        footprint.personalInfo.length > 0 ||
        footprint.calls.length > 0 ||
        footprint.systemNotes.length > 0),
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
            friendlyError(
              loadError,
              "The reading desk went quiet — the private worker timed out or stalled.",
            ),
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
  }, [api, deskRetryToken, effectiveFilter]);

  const reloadDesk = useCallback(async () => {
    setDeskLoading(true);
    setDeskError(null);
    try {
      // Soft retry first — the worker queue may already have recovered.
      const result = await api.query("deskHome", { filter: effectiveFilter });
      setDesk(result);
      setDeskLoading(false);
      return;
    } catch {
      // Hard reset: dispose the wedged worker. In-memory archive is gone.
    }
    await reloadSession();
    setSessionFlash(
      "The private worker had to restart, so the archive left memory. Drop your export again — nothing was uploaded.",
    );
    router.replace("/");
  }, [api, effectiveFilter, reloadSession, router]);

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
    setPeopleOffset(0);
  }, [effectiveFilter]);

  useEffect(() => {
    if (activeView !== "people") {
      return;
    }
    let active = true;
    if (peopleOffset === 0) {
      setPeopleLoading(true);
    }
    setPeopleError(null);
    const pageSize = 200;
    void api
      .query("peopleList", {
        filter: effectiveFilter,
        limit: pageSize,
        offset: peopleOffset,
      })
      .then((result) => {
        if (!active) {
          return;
        }
        setPeople((current) =>
          peopleOffset === 0 ? result.items : [...current, ...result.items],
        );
        setPeopleHasMore(result.items.length === pageSize);
        if (peopleOffset === 0) {
          setSelectedPerson((current) => {
            if (
              current &&
              result.items.some((item) => item.conversation === current)
            ) {
              return current;
            }
            return result.items[0]?.conversation ?? null;
          });
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          if (isQueryTimeoutError(loadError)) {
            setWorkerStalled(true);
          }
          setPeopleError(
            friendlyError(loadError, "The people index could not be loaded."),
          );
        }
      })
      .finally(() => {
        if (active && peopleOffset === 0) {
          setPeopleLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [activeView, api, effectiveFilter, peopleOffset]);

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
          unifiedAliases: effectiveFilter.unifiedAliases,
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
        limit: 5_000,
        offset: 0,
        filter: effectiveFilter,
      })
      .then((conversationResult) => {
        if (!active) {
          return;
        }
        let nextConversations = conversationResult.items.map(
          (conversation): ConversationItem => ({
            platform: conversation.platform,
            conversation: conversation.conversation,
            messageCount: conversation.messageCount,
            lastMessageAt: conversation.lastMessageAtMs,
            lastSnippet: conversation.preview,
          }),
        );
        if (effectiveFilter.unifiedAliases && effectiveFilter.unifiedAliases.length > 0) {
          nextConversations = [{
            platform: "unified",
            conversation: "Combined Thread",
            messageCount: nextConversations.reduce((acc, c) => acc + c.messageCount, 0),
            lastMessageAt: Math.max(...nextConversations.map(c => Number(c.lastMessageAt))),
            lastSnippet: nextConversations[0]?.lastSnippet ?? null,
          }];
        }
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
    setMessagesPage(1);
  }, [effectiveFilter]);

  useEffect(() => {
    setMediaPage(1);
  }, [effectiveFilter]);

  useEffect(() => {
    if (activeView !== "messages" || selectedConversation === null) {
      return;
    }
    let active = true;
    setMessagesLoading(true);
    setMessagesError(null);
    const offset = (messagesPage - 1) * MESSAGES_PAGE_SIZE;
    void api
      .query("messagesPage", {
        conversation: selectedConversation,
        limit: MESSAGES_PAGE_SIZE,
        offset,
        filter: {
          fromMs: effectiveFilter.fromMs,
          toMs: effectiveFilter.toMs,
          platform: effectiveFilter.platform,
          unifiedAliases: effectiveFilter.unifiedAliases,
        },
      })
      .then((result) => {
        if (!active) {
          return;
        }
        setMessages(result.items.map(mapMessage));
        setMessagesTotalPages(
          Math.max(1, Math.ceil(result.totalCount / MESSAGES_PAGE_SIZE)),
        );
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
  }, [
    activeView,
    api,
    effectiveFilter,
    messagesPage,
    selectedConversation,
  ]);

  useEffect(() => {
    setMediaPage(1);
  }, [effectiveFilter, mediaKind]);

  useEffect(() => {
    if (activeView !== "media") {
      return;
    }
    let active = true;
    setMediaLoading(true);
    setMediaError(null);
    void api
      .query("mediaList", {
        kind: mediaKind,
        limit: MEDIA_PAGE_SIZE,
        offset: (mediaPage - 1) * MEDIA_PAGE_SIZE,
        filter: effectiveFilter,
      })
      .then((result) => {
        if (active) {
          setMedia(result.items.map(mapMediaItem));
          setMediaTotalCount(result.totalCount);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          if (isQueryTimeoutError(loadError)) {
            setWorkerStalled(true);
          }
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
  }, [activeView, api, effectiveFilter, mediaKind, mediaPage]);

  useEffect(() => {
    if (activeView !== "activity") {
      return;
    }
    // Calendar is year-scoped — keep the Year filter in sync with the chart
    // so "messages match" agrees with the visible heatmap (and the ZIP counts).
    if (year === null && years.length > 0) {
      setYear(years[years.length - 1] ?? null);
      return;
    }
    const targetYear = year ?? new Date().getUTCFullYear();
    let active = true;
    setHeatmapLoading(true);
    setHeatmapError(null);
    void api
      .query("messageHeatmap", {
        year: targetYear,
        filter: {
          platform: effectiveFilter.platform,
          conversation: effectiveFilter.conversation,
          unifiedAliases: effectiveFilter.unifiedAliases,
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

  const search = useCallback(
    (term: string) => {
      const seq = searchSeqRef.current + 1;
      searchSeqRef.current = seq;
      setSearchLoading(true);
      setSearchError(null);
      setHasSearched(true);
      void api
        .query("search", { term, limit: 200, offset: 0, filter: effectiveFilter })
        .then((result) => {
          if (searchSeqRef.current !== seq) {
            return;
          }
          setSearchResults(
            result.groups.flatMap((group) => group.hits.map(mapSearchHit)),
          );
          setSearchLoading(false);
        })
        .catch((queryError: unknown) => {
          if (searchSeqRef.current !== seq) {
            return;
          }
          if (isQueryTimeoutError(queryError)) {
            setWorkerStalled(true);
          }
          setSearchError(
            friendlyError(
              queryError,
              "The local search could not be completed.",
            ),
          );
          setSearchLoading(false);
        });
    },
    [api, effectiveFilter],
  );

  const readMediaBlob = useCallback(
    (zipPath: string) => api.readMediaBlob(zipPath),
    [api],
  );
  const exportTable = useCallback(
    (
      table: "messages" | "media" | "events",
      format: "xlsx" | "csv" | "json",
    ) => api.exportTable(table, format),
    [api],
  );

  useEffect(() => {
    const onVisible = () => {
      if (document.hidden) {
        return;
      }
      void api
        .ping()
        .then(() => setWorkerStalled(false))
        .catch((error: unknown) => {
          if (isQueryTimeoutError(error)) {
            setWorkerStalled(true);
          }
        });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [api]);

  const openPerson = useCallback((conversation: string) => {
    setSelectedPerson(conversation);
    setActiveView("people");
  }, []);

  const openMessages = useCallback(
    (
      conversation: string,
      targetMessage?: { rowId: number; sentAtMs: number },
    ) => {
      setSelectedConversation(conversation);
      setActiveView("messages");
      
      if (targetMessage) {
        // Fetch the chronological rank of the message to jump to its page
        void api
          .query("messageRank", {
            rowId: targetMessage.rowId,
            sentAtMs: targetMessage.sentAtMs,
            filter: { ...effectiveFilter, conversation },
          })
          .then((result) => {
            const page =
              Math.floor(Math.max(0, result.rank - 1) / MESSAGES_PAGE_SIZE) + 1;
            setMessagesPage(page);
          });
      } else {
        setMessagesPage(1);
      }
    },
    [api, effectiveFilter],
  );

  const onSurprise = useCallback(() => {
    setSurpriseLoading(true);
    setSurpriseEmpty(false);
    void api
      .query("surpriseMemory", { filter: effectiveFilter })
      .then((result) => {
        setSurprise(result.message);
        setSurpriseEmpty(result.message === null);
        queueMicrotask(() => {
          document
            .getElementById("surprise-memory")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      })
      .catch(() => {
        setSurprise(null);
        setSurpriseEmpty(true);
      })
      .finally(() => setSurpriseLoading(false));
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

  const filterMatch = useMemo(() => {
    switch (activeView) {
      case "people":
        return { count: people.length, noun: "person", plural: "people" };
      case "messages":
        return {
          // Desk COUNT(*) for the same filter — not a sum of the loaded thread page.
          count: messageCount ?? 0,
          noun: "message",
        };
      case "media":
        return { count: mediaTotalCount, noun: "media item" };
      case "activity":
        return {
          count:
            heatmap?.days.reduce((sum, day) => sum + day.messageCount, 0) ?? 0,
          noun: "message",
        };
      default:
        return {
          count: messageCount ?? 0,
          noun: "message",
        };
    }
  }, [
    activeView,
    conversations,
    heatmap,
    mediaTotalCount,
    messageCount,
    people.length,
  ]);

  const activeContent = (() => {
    switch (activeView) {
      case "desk":
        if (deskError) {
          return (
            <StatePanel
              kind="error"
              title="The reading desk went quiet"
              description={deskError}
              action={
                <div className="flex flex-wrap gap-4">
                  <button
                    type="button"
                    className="font-display text-sm font-bold text-teal underline underline-offset-4"
                    onClick={() => {
                      setDeskRetryToken((value) => value + 1);
                    }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="font-display text-sm font-bold text-ink underline underline-offset-4"
                    onClick={() => {
                      void reloadDesk();
                    }}
                  >
                    Reload the desk
                  </button>
                </div>
              }
            />
          );
        }
        if (deskLoading || !desk) {
          return (
            <StatePanel
              kind="loading"
              title="Laying out the reading desk"
              description="If this hangs more than a few seconds after the tab was away, reload the desk."
              action={
                <div className="flex flex-wrap justify-center gap-4">
                  <button
                    type="button"
                    className="font-display text-sm font-bold text-teal underline underline-offset-4"
                    onClick={() => {
                      setDeskRetryToken((value) => value + 1);
                    }}
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    className="font-display text-sm font-bold text-ink underline underline-offset-4"
                    onClick={() => {
                      void reloadDesk();
                    }}
                  >
                    Reload the desk
                  </button>
                </div>
              }
            />
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
            surpriseLoading={surpriseLoading}
            surpriseEmpty={surpriseEmpty}
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
            hasMore={peopleHasMore}
            onLoadMore={() => setPeopleOffset((value) => value + 200)}
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
            page={messagesPage}
            totalPages={messagesTotalPages}
            owners={options?.owners ?? {}}
            globalArchiveOwnerName={options?.globalArchiveOwnerName ?? null}
            onSelectConversation={(conv) => {
              setSelectedConversation(conv);
              setMessagesPage(1);
            }}
            onChangePage={setMessagesPage}
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
      case "media": {
        const mediaTotalPages = Math.max(
          1,
          Math.ceil(mediaTotalCount / MEDIA_PAGE_SIZE),
        );
        return (
          <MediaView
            items={media}
            totalCount={mediaTotalCount}
            page={mediaPage}
            totalPages={mediaTotalPages}
            loading={mediaLoading}
            error={mediaError}
            kind={mediaKind}
            onChangeKind={setMediaKind}
            readBlob={readMediaBlob}
            onChangePage={setMediaPage}
          />
        );
      }
      case "activity":
        return (
          <ActivityHeatmapView
            heatmap={heatmap}
            loading={heatmapLoading}
            error={heatmapError}
            selectedDayMs={selectedDayMs}
            dayMessages={dayMessages}
            dayLoading={dayLoading}
            years={years}
            year={year}
            onChangeYear={setYear}
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
      case "identity":
        return (
          <IdentityManager
            identities={unifiedIdentities}
            conversations={options?.conversations ?? []}
            onAddIdentity={addIdentity}
            onRemoveIdentity={removeIdentity}
          />
        );
      case "export":
        return <ExportView exportTable={exportTable} />;
    }
  })();

  return (
    <main className="min-h-screen overflow-x-hidden bg-paper lg:flex lg:items-start lg:overflow-visible">
      <DashboardSidebar
        active={activeView}
        onSelect={setActiveView}
        showFootprint={showFootprint || footprintLoading}
      />
      <div className="min-w-0 flex-1 bg-paper">
        <DashboardHeader
          eyebrow={activeLabel.eyebrow}
          title={activeLabel.title}
          subtitle={activeLabel.subtitle}
          messageCount={messageCount}
          onExport={() => setActiveView("export")}
        />
        {/* Left-aligned in the content column — not centered in the viewport */}
        <div className="w-full max-w-[1280px] space-y-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {workerStalled ? (
            <StatePanel
              kind="error"
              title="The private worker went quiet"
              description="A query timed out — often after the tab was backgrounded. Reload the desk and drop your export again."
              action={
                <PressButton
                  type="button"
                  onClick={() => {
                    void reloadDesk();
                  }}
                >
                  Reload the desk
                </PressButton>
              }
            />
          ) : null}
          {activeView === "desk" ||
          activeView === "messages" ||
          activeView === "people" ||
          activeView === "media" ||
          activeView === "activity" ? (
            <div className="archive-panel p-3 sm:p-4">
              <FilterBar
                options={options}
                unifiedIdentities={unifiedIdentities}
                filter={filter}
                year={year}
                years={years}
                onChange={setFilter}
                onChangeYear={setYear}
                matchCount={filterMatch.count}
                matchNoun={filterMatch.noun}
                matchPlural={
                  "plural" in filterMatch ? filterMatch.plural : undefined
                }
              />
            </div>
          ) : null}
          {activeContent}
        </div>
      </div>

    </main>
  );
}
