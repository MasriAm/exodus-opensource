import * as Comlink from "comlink";

import {
  COUNTS_TIMEOUT_MS,
  DESK_QUERY_TIMEOUT_MS,
  EXPORT_TIMEOUT_MS,
  HEAVY_QUERY_TIMEOUT_MS,
  INGEST_TIMEOUT_MS,
  PING_TIMEOUT_MS,
  VIEW_QUERY_TIMEOUT_MS,
  withTimeout,
} from "./query-timeout";
import type {
  ActivityTimelineParams,
  ActivityTimelineResult,
  ConversationListParams,
  ConversationListResult,
  CountsResult,
  ExportFormat,
  ExportMetadataResult,
  ExportTable,
  IngestApi,
  IngestProgressCallback,
  IngestSummary,
  MediaListParams,
  MediaListResult,
  MessagesPageParams,
  MessagesPageResult,
  QueryArgs,
  QueryName,
  QueryResultByName,
  SearchParams,
  SearchResult,
  WrappedStatsResult,
} from "./db/types";
import { thumbCacheClear } from "./thumb-cache";

export interface WorkerClient extends IngestApi {
  conversationList(
    params?: ConversationListParams,
  ): Promise<ConversationListResult>;
  messagesPage(params: MessagesPageParams): Promise<MessagesPageResult>;
  counts(): Promise<CountsResult>;
  search(params: SearchParams): Promise<SearchResult>;
  activityTimeline(
    params?: ActivityTimelineParams,
  ): Promise<ActivityTimelineResult>;
  mediaList(params?: MediaListParams): Promise<MediaListResult>;
  wrappedStats(): Promise<WrappedStatsResult>;
  exportMetadata(): Promise<ExportMetadataResult>;
  markArchiveLive(): void;
  hasLiveArchive(): boolean;
  dispose(): void;
}

type ExodusGlobal = typeof globalThis & {
  __exodusWorkerClient?: WorkerClient;
  __exodusArchiveLive?: boolean;
};

const HEAVY_QUERIES = new Set<QueryName>([
  "wrappedStats",
  "personDetail",
  "footprint",
]);

export function createWorkerClient(): WorkerClient {
  const worker = new Worker(
    new URL("../workers/ingest.worker.ts", import.meta.url),
    { type: "module" },
  );
  const remote = Comlink.wrap<IngestApi>(worker);
  let disposed = false;

  const ensureActive = (): void => {
    if (disposed) {
      throw new Error("This Exodus worker client has been disposed.");
    }
  };

  const query = <Name extends QueryName>(
    name: Name,
    ...args: QueryArgs<Name>
  ): Promise<QueryResultByName[Name]> => {
    ensureActive();
    const timeoutMs = HEAVY_QUERIES.has(name)
      ? HEAVY_QUERY_TIMEOUT_MS
      : DESK_QUERY_TIMEOUT_MS;
    return withTimeout(
      remote.query(name, ...args) as Promise<QueryResultByName[Name]>,
      timeoutMs,
      `query:${String(name)}`,
    );
  };

  return {
    ingest(
      file: File,
      onProgress: IngestProgressCallback,
    ): Promise<IngestSummary> {
      ensureActive();
      thumbCacheClear();
      return withTimeout(
        remote.ingest(file, Comlink.proxy(onProgress)),
        INGEST_TIMEOUT_MS,
        "ingest",
      );
    },
    query,
    conversationList: (params) => query("conversationList", params),
    messagesPage: (params) => query("messagesPage", params),
    counts: () =>
      withTimeout(query("counts"), COUNTS_TIMEOUT_MS, "counts"),
    search: (params) => query("search", params),
    activityTimeline: (params) => query("activityTimeline", params),
    mediaList: (params) => query("mediaList", params),
    wrappedStats: () => query("wrappedStats"),
    exportMetadata: () => query("exportMetadata"),
    readMediaBlob(zipPath: string): Promise<Blob> {
      ensureActive();
      return withTimeout(
        remote.readMediaBlob(zipPath),
        VIEW_QUERY_TIMEOUT_MS,
        `readMediaBlob:${zipPath}`,
      );
    },
    exportTable(
      table: ExportTable,
      format: ExportFormat,
    ): Promise<Blob> {
      ensureActive();
      return withTimeout(
        remote.exportTable(table, format),
        EXPORT_TIMEOUT_MS,
        `exportTable:${table}`,
      );
    },
    ping(): Promise<true> {
      ensureActive();
      return withTimeout(remote.ping(), PING_TIMEOUT_MS, "ping");
    },
    markArchiveLive(): void {
      (globalThis as ExodusGlobal).__exodusArchiveLive = true;
    },
    hasLiveArchive(): boolean {
      return (globalThis as ExodusGlobal).__exodusArchiveLive === true;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      (globalThis as ExodusGlobal).__exodusArchiveLive = false;
      thumbCacheClear();
      try {
        remote[Comlink.releaseProxy]();
      } catch {
        // ignore
      }
      worker.terminate();
    },
  };
}

export function getWorkerClient(): WorkerClient {
  const root = globalThis as ExodusGlobal;
  if (!root.__exodusWorkerClient) {
    root.__exodusWorkerClient = createWorkerClient();
  }
  return root.__exodusWorkerClient;
}

export function disposeWorkerClient(): void {
  const root = globalThis as ExodusGlobal;
  root.__exodusWorkerClient?.dispose();
  root.__exodusWorkerClient = undefined;
  root.__exodusArchiveLive = false;
  try {
    sessionStorage.removeItem("exodus:archive-live");
  } catch {
    // ignore
  }
}

/** Tear down a wedged worker and return a fresh client. */
export function resetWorkerClient(): WorkerClient {
  disposeWorkerClient();
  return getWorkerClient();
}

export type {
  ActivityTimelineParams,
  ActivityTimelineResult,
  ConversationListParams,
  ConversationListResult,
  CountsResult,
  ExportFormat,
  ExportMetadataResult,
  ExportTable,
  IngestProgress,
  IngestSummary,
  MediaListParams,
  MediaListResult,
  MessageCursor,
  MessageItem,
  MessagesPageParams,
  MessagesPageResult,
  QueryName,
  SearchParams,
  SearchResult,
  WrappedStatsResult,
} from "./db/types";
