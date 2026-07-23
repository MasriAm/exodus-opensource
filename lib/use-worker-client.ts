"use client";

import { useEffect, useState } from "react";

import { useArchiveSession } from "@/components/archive-session";
import type { WorkerClient } from "@/lib/worker-client";

/** Prefer the layout-owned session client; falls back only while booting. */
export function useWorkerClient(): WorkerClient | null {
  const session = useArchiveSession();
  const [client, setClient] = useState<WorkerClient | null>(session.api);

  useEffect(() => {
    setClient(session.api);
  }, [session.api]);

  return client;
}
