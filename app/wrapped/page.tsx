"use client";

import dynamic from "next/dynamic";

import { useArchiveSession } from "@/components/archive-session";
import { SessionGate } from "@/components/session-gate";
import { StatePanel } from "@/components/state-panel";

const WrappedClient = dynamic(
  () =>
    import("@/components/wrapped-client").then((mod) => mod.WrappedClient),
  {
    ssr: false,
    loading: () => (
      <StatePanel
        kind="loading"
        title="Opening your time capsule"
        description="Loading the Wrapped deck."
        className="m-6"
      />
    ),
  },
);

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
