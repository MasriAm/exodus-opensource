"use client";

import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { SessionGate } from "@/components/session-gate";
import { useArchiveSession } from "@/components/archive-session";

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
