"use client";

import dynamic from "next/dynamic";

import { useArchiveSession } from "@/components/archive-session";
import { SessionGate } from "@/components/session-gate";
import { StatePanel } from "@/components/state-panel";

const DashboardClient = dynamic(
  () =>
    import("@/components/dashboard/dashboard-client").then(
      (mod) => mod.DashboardClient,
    ),
  {
    ssr: false,
    loading: () => (
      <StatePanel
        kind="loading"
        title="Opening your reading desk"
        description="Loading the archive terminal."
        className="m-6"
      />
    ),
  },
);

export default function DashboardPage() {
  const { api } = useArchiveSession();

  return (
    <SessionGate
      loadingTitle="Opening your reading desk"
      loadingDescription="Your archive lives in this browser session only. Import an export from the home page if you just arrived here."
    >
      {api ? <DashboardClient api={api} /> : null}
    </SessionGate>
  );
}
