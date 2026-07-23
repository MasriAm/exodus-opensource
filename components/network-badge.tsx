"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";

import { countResourceOrigins } from "@/lib/network-origin";

export function NetworkBadge() {
  const [externalCount, setExternalCount] = useState(0);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    const refresh = () => {
      const urls = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name);
      const counts = countResourceOrigins(urls, window.location.href);
      setExternalCount(counts.external);
      setLocalCount(counts.local);
    };

    refresh();

    if (!("PerformanceObserver" in window)) {
      return;
    }

    const observer = new PerformanceObserver(() => {
      refresh();
    });

    observer.observe({ entryTypes: ["resource"] });
    return () => observer.disconnect();
  }, []);

  const healthy = externalCount === 0;

  return (
    <span
      className={`inline-flex items-center gap-2 border-strong px-3 py-1.5 font-display text-xs tracking-[0.02em] shadow-press ${
        healthy ? "bg-cream text-ink" : "bg-coral/15 text-coral"
      }`}
      title={
        healthy
          ? `No third-party requests. ${localCount} same-origin app files loaded to run this page.`
          : `${externalCount} external request(s) detected. Local assets: ${localCount}.`
      }
    >
      <Radio
        aria-hidden="true"
        className={`size-3 ${healthy ? "text-teal" : "text-coral"}`}
      />
      <span>
        {healthy
          ? "0 external requests"
          : `${externalCount} external request${externalCount === 1 ? "" : "s"}`}
      </span>
    </span>
  );
}
