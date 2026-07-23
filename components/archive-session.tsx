"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { IngestProgress, IngestSummary } from "@/lib/db/types";
import {
  getWorkerClient,
  resetWorkerClient,
  type WorkerClient,
} from "@/lib/worker-client";

export const SESSION_FLASH_KEY = "exodus:flash";
export const LAST_INGEST_KEY = "exodus:last-ingest";
export const ARCHIVE_LIVE_KEY = "exodus:archive-live";

type SessionStatus = "booting" | "ready" | "ingesting" | "live";

type ArchiveSessionValue = {
  api: WorkerClient | null;
  status: SessionStatus;
  ingestProgress: IngestProgress | null;
  lastSummary: IngestSummary | null;
  markIngesting: (progress: IngestProgress | null) => void;
  markLive: (summary: IngestSummary) => void;
  markReady: () => void;
  /** Dispose a wedged worker and try to recover the in-memory archive. */
  reloadSession: () => Promise<"live" | "ready">;
};

const ArchiveSessionContext = createContext<ArchiveSessionValue | null>(null);

function readLastSummary(): IngestSummary | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(LAST_INGEST_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as IngestSummary;
  } catch {
    return null;
  }
}

function readLiveFlag(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return sessionStorage.getItem(ARCHIVE_LIVE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeLiveFlag(live: boolean): void {
  try {
    if (live) {
      sessionStorage.setItem(ARCHIVE_LIVE_KEY, "1");
    } else {
      sessionStorage.removeItem(ARCHIVE_LIVE_KEY);
    }
  } catch {
    // Ignore; in-memory flags still apply.
  }
}

export function ArchiveSessionProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<WorkerClient | null>(null);
  const [status, setStatus] = useState<SessionStatus>("booting");
  const [ingestProgress, setIngestProgress] = useState<IngestProgress | null>(
    null,
  );
  const [lastSummary, setLastSummary] = useState<IngestSummary | null>(null);

  useEffect(() => {
    let active = true;
    const client = getWorkerClient();
    setApi(client);
    setLastSummary(readLastSummary());

    const boot = async () => {
      if (client.hasLiveArchive() || readLiveFlag()) {
        try {
          const counts = await client.counts();
          if (!active) {
            return;
          }
          if (counts.messages > 0 || counts.media > 0 || counts.events > 0) {
            client.markArchiveLive();
            writeLiveFlag(true);
            setStatus("live");
            return;
          }
        } catch {
          // Fall through to ready — SessionGate will explain.
        }
        if (!active) {
          return;
        }
        writeLiveFlag(false);
        setStatus("ready");
        return;
      }
      if (active) {
        setStatus("ready");
      }
    };

    void boot();
    return () => {
      active = false;
    };
  }, []);

  const markIngesting = useCallback((progress: IngestProgress | null) => {
    setStatus("ingesting");
    setIngestProgress(progress);
  }, []);

  const markLive = useCallback((summary: IngestSummary) => {
    try {
      sessionStorage.setItem(LAST_INGEST_KEY, JSON.stringify(summary));
    } catch {
      // sessionStorage may be unavailable; in-memory flags still apply.
    }
    getWorkerClient().markArchiveLive();
    writeLiveFlag(true);
    setLastSummary(summary);
    setIngestProgress(null);
    setStatus("live");
  }, []);

  const markReady = useCallback(() => {
    setIngestProgress(null);
    setStatus((current) => (current === "live" ? "live" : "ready"));
  }, []);

  const reloadSession = useCallback(async (): Promise<"live" | "ready"> => {
    setStatus("booting");
    setIngestProgress(null);
    const client = resetWorkerClient();
    setApi(client);
    // A reset always drops the in-memory DuckDB — the archive must be re-imported.
    writeLiveFlag(false);
    setStatus("ready");
    return "ready";
  }, []);

  const value = useMemo(
    () => ({
      api,
      status,
      ingestProgress,
      lastSummary,
      markIngesting,
      markLive,
      markReady,
      reloadSession,
    }),
    [
      api,
      ingestProgress,
      lastSummary,
      markIngesting,
      markLive,
      markReady,
      reloadSession,
      status,
    ],
  );

  return (
    <ArchiveSessionContext.Provider value={value}>
      {children}
    </ArchiveSessionContext.Provider>
  );
}

export function useArchiveSession(): ArchiveSessionValue {
  const value = useContext(ArchiveSessionContext);
  if (!value) {
    throw new Error("useArchiveSession must be used within ArchiveSessionProvider.");
  }
  return value;
}

export function consumeSessionFlash(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const message = sessionStorage.getItem(SESSION_FLASH_KEY);
    if (message) {
      sessionStorage.removeItem(SESSION_FLASH_KEY);
    }
    return message;
  } catch {
    return null;
  }
}

export function setSessionFlash(message: string): void {
  try {
    sessionStorage.setItem(SESSION_FLASH_KEY, message);
  } catch {
    // Ignore; caller can still redirect.
  }
}
