"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ARCHIVE_LIVE_KEY,
  LAST_INGEST_KEY,
  setSessionFlash,
  useArchiveSession,
} from "@/components/archive-session";
import { IngestLoadingScene } from "@/components/ingest-loading-scene";
import { StatePanel } from "@/components/state-panel";
import { COUNTS_TIMEOUT_MS, withTimeout } from "@/lib/query-timeout";

const SESSION_ENDED_COPY =
  "Your session ended and nothing was saved — that's the point. Drop your export to start again.";

const NEVER_STARTED_COPY =
  "Nothing is loaded in this browser session yet. Drop your export to open the archive.";

type SessionGateProps = {
  children: ReactNode;
  loadingTitle: string;
  loadingDescription: string;
};

type GatePhase =
  | "pending"
  | "allow"
  | "ingesting"
  | "redirecting"
  | "stalled";

function hadLiveSessionMarker(): boolean {
  try {
    return (
      sessionStorage.getItem(ARCHIVE_LIVE_KEY) === "1" ||
      Boolean(sessionStorage.getItem(LAST_INGEST_KEY))
    );
  } catch {
    return false;
  }
}

/**
 * Ensures /wrapped and /dashboard only render when the in-memory archive is live.
 * Soft client navigations reuse the worker; hard refresh correctly routes home.
 */
export function SessionGate({
  children,
  loadingTitle,
  loadingDescription,
}: SessionGateProps) {
  const router = useRouter();
  const { api, status, ingestProgress, reloadSession } = useArchiveSession();
  const [phase, setPhase] = useState<GatePhase>("pending");
  const [redirectMessage, setRedirectMessage] = useState<string | null>(null);
  const [probeToken, setProbeToken] = useState(0);

  useEffect(() => {
    if (!api || status === "booting") {
      return;
    }

    // Finished ingest may still briefly report "ingesting" before React
    // flushes markLive — trust the live flag / worker marker first.
    if (status === "live" || api.hasLiveArchive()) {
      setPhase("allow");
      return;
    }

    if (status === "ingesting") {
      setPhase("ingesting");
      return;
    }

    let active = true;
    setPhase("pending");

    void withTimeout(api.counts(), COUNTS_TIMEOUT_MS, "sessionGate.counts")
      .then((counts) => {
        if (!active) {
          return;
        }
        if (counts.messages > 0 || counts.media > 0 || counts.events > 0) {
          api.markArchiveLive();
          try {
            sessionStorage.setItem(ARCHIVE_LIVE_KEY, "1");
          } catch {
            // ignore
          }
          setPhase("allow");
          return;
        }
        const hadSession = hadLiveSessionMarker();
        const message = hadSession ? SESSION_ENDED_COPY : NEVER_STARTED_COPY;
        try {
          sessionStorage.removeItem(ARCHIVE_LIVE_KEY);
        } catch {
          // ignore
        }
        setSessionFlash(message);
        setRedirectMessage(message);
        setPhase("redirecting");
        router.replace("/");
      })
      .catch(() => {
        if (!active) {
          return;
        }
        // Hung / timed-out worker — do not leave the gate spinning forever.
        if (hadLiveSessionMarker()) {
          setPhase("stalled");
          return;
        }
        const message = NEVER_STARTED_COPY;
        setSessionFlash(message);
        setRedirectMessage(message);
        setPhase("redirecting");
        router.replace("/");
      });

    return () => {
      active = false;
    };
  }, [api, probeToken, router, status]);

  if (phase === "allow") {
    return <>{children}</>;
  }

  if (phase === "ingesting") {
    const STAGE_PERCENT = {
      initializing: 4,
      opening: 12,
      detecting: 20,
      parsing: 45,
      loading: 75,
      finalizing: 94,
    } as const;
    const percent =
      ingestProgress &&
      ingestProgress.total !== null &&
      ingestProgress.total > 0
        ? Math.round((ingestProgress.done / ingestProgress.total) * 100)
        : ingestProgress
          ? STAGE_PERCENT[ingestProgress.stage]
          : undefined;
    return (
      <main className="min-h-screen bg-paper">
        <IngestLoadingScene
          progress={ingestProgress}
          progressPercent={percent}
        />
      </main>
    );
  }

  if (phase === "redirecting") {
    return (
      <main className="min-h-screen bg-paper p-5 sm:p-8">
        <StatePanel
          title="Back to the dropzone"
          description={redirectMessage ?? NEVER_STARTED_COPY}
          action={
            <Link
              href="/"
              className="font-display text-sm text-teal underline underline-offset-4"
            >
              Meet your past self →
            </Link>
          }
        />
      </main>
    );
  }

  if (phase === "stalled") {
    return (
      <main className="min-h-screen bg-paper p-5 sm:p-8">
        <StatePanel
          kind="error"
          title="The private worker went quiet"
          description="The session probe timed out after the tab was away. Reload the desk to restart the worker — you will need to drop your export again."
          action={
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                className="font-display text-sm font-bold text-teal underline underline-offset-4"
                onClick={() => setProbeToken((value) => value + 1)}
              >
                Try again
              </button>
              <button
                type="button"
                className="font-display text-sm font-bold text-ink underline underline-offset-4"
                onClick={() => {
                  void reloadSession().then(() => {
                    setSessionFlash(
                      "The private worker restarted. Drop your export again — nothing was uploaded.",
                    );
                    router.replace("/");
                  });
                }}
              >
                Reload the desk
              </button>
            </div>
          }
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-paper p-5 sm:p-8">
      <StatePanel
        kind="loading"
        title={loadingTitle}
        description={loadingDescription}
      />
    </main>
  );
}
