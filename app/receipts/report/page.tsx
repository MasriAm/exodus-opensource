"use client";

import { Suspense } from "react";

import { ReportClient } from "@/components/receipts/report-client";

import "../receipts.css";

export default function ReceiptsReportPage() {
  return (
    <Suspense
      fallback={
        <main className="rc">
          <div className="rc-shell">
            <p className="rc-empty" style={{ marginTop: "4rem" }}>
              Reading your messages…
            </p>
          </div>
        </main>
      }
    >
      <ReportClient />
    </Suspense>
  );
}
