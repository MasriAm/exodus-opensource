import * as Comlink from "comlink";

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
    return remote.query(name, ...args) as Promise<QueryResultByName[Name]>;
  };

  return {
    ingest(
      file: File,
      onProgress: IngestProgressCallback,
    ): Promise<IngestSummary> {
      ensureActive();
      return remote.ingest(file, Comlink.proxy(onProgress));
    },
    query,
    conversationList: (params) => query("conversationList", params),
    messagesPage: (params) => query("messagesPage", params),
    counts: () => query("counts"),
    search: (params) => query("search", params),
    activityTimeline: (params) => query("activityTimeline", params),
    mediaList: (params) => query("mediaList", params),
    wrappedStats: () => query("wrappedStats"),
    exportMetadata: () => query("exportMetadata"),
    readMediaBlob(zipPath: string): Promise<Blob> {
      ensureActive();
      return remote.readMediaBlob(zipPath);
    },
    exportTable(
      table: ExportTable,
      format: ExportFormat,
    ): Promise<Blob> {
      ensureActive();
      return remote.exportTable(table, format);
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
      remote[Comlink.releaseProxy]();
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
