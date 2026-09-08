"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useArchiveSession } from "@/components/archive-session";
import { ReceiptsReport } from "@/components/receipts/report";
import {
  useArchiveReport,
  useTemplateReport,
} from "@/components/receipts/use-drama-report";

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="rc">
      <div className="rc-shell">
        <nav className="rc-bar">
          <Link href="/receipts" className="rc-wordmark">
            exodus <span>/ receipts</span>
          </Link>
        </nav>
        <div className="rc-empty" style={{ marginTop: "3rem" }}>
          <h1 className="rc-h3">{title}</h1>
          <div style={{ marginTop: "0.75rem" }}>{children}</div>
        </div>
      </div>
    </main>
  );
}

export function ReportClient() {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const { api, status } = useArchiveSession();
  const templateReport = useTemplateReport();
  const archive = useArchiveReport(isDemo ? null : api);

  if (isDemo) {
    return <ReceiptsReport report={templateReport} />;
  }

  if (!api || status === "booting" || archive.loading) {
    return (
      <Panel title="Reading your messages…">
        <p>This runs in your browser, so it takes a moment on a big archive.</p>
      </Panel>
    );
  }

  if (archive.error) {
    return (
      <Panel title="That report could not be built">
        <p>{archive.error}</p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/receipts" className="rc-link">
            Try importing the export again
          </Link>
        </p>
      </Panel>
    );
  }

  if (!archive.report || archive.report.analyzedMessages === 0) {
    return (
      <Panel title="Nothing is loaded in this tab">
        <p>
          Your archive only ever lives in the tab you dropped it into, so a
          refresh clears it. That is the trade for never uploading anything.
        </p>
        <p style={{ marginTop: "1rem" }}>
          <Link href="/receipts" className="rc-link">
            Drop your export again
          </Link>
        </p>
      </Panel>
    );
  }

  return (
    <ReceiptsReport
      report={archive.report}
      names={archive.names}
      truncated={archive.truncated}
      snapCount={archive.snapCount}
    />
  );
}
