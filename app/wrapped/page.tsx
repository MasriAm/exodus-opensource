"use client";

import { SessionGate } from "@/components/session-gate";
import { WrappedClient } from "@/components/wrapped-client";
import { useArchiveSession } from "@/components/archive-session";

export default function WrappedPage() {
  const { api } = useArchiveSession();

  return (
    <SessionGate
      loadingTitle="Opening your time capsule"
      loadingDescription="Your Wrapped lives in this browser session only. Import an archive from the home page if you just arrived here."
    >
      {api ? <WrappedClient api={api} /> : null}
    </SessionGate>
  );
}
