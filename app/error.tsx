"use client";

import { useEffect } from "react";

import { StatePanel } from "@/components/state-panel";
import { Button } from "@/components/ui/button";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("An Exodus interface error occurred.", error);
  }, [error]);

  return (
    <main className="min-h-screen p-5 sm:p-8">
      <StatePanel
        kind="error"
        title="This view hit a problem"
        description="Your archive has not been uploaded. Try opening the view again."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
