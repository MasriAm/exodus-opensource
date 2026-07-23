"use client";

import { useState } from "react";

import { PressButton } from "@/components/capsule/press-button";
import { Receipt } from "@/components/capsule/receipt";
import { SlideTitle } from "@/components/capsule/slide-title";
import { downloadBlob } from "@/lib/format";

export type ExportTable = "messages" | "media" | "events";
export type ExportFormat = "csv" | "json";

type ExportViewProps = {
  exportTable: (table: ExportTable, format: ExportFormat) => Promise<Blob>;
};

const tables: ReadonlyArray<{
  id: ExportTable;
  label: string;
  description: string;
}> = [
  {
    id: "messages",
    label: "Messages",
    description: "Conversation, sender, time, text, and attachment references.",
  },
  {
    id: "media",
    label: "Media index",
    description: "Archive paths, media kinds, dates, and conversation links.",
  },
  {
    id: "events",
    label: "Activity events",
    description:
      "Follower, comment, call, interest, and other normalized events.",
  },
];

export function ExportView({ exportTable }: ExportViewProps) {
  const [activeExport, setActiveExport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runExport = async (table: ExportTable, format: ExportFormat) => {
    const operation = `${table}-${format}`;
    setActiveExport(operation);
    setError(null);
    try {
      const blob = await exportTable(table, format);
      downloadBlob(blob, `exodus-${table}.${format}`);
    } catch (exportError: unknown) {
      console.error(`Could not export ${table} as ${format}.`, exportError);
      setError("The export could not be created. Please try again.");
    } finally {
      setActiveExport(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <SlideTitle accent="teal">Take back a clean copy</SlideTitle>
        <p className="mt-3 max-w-2xl font-body text-sm leading-6 text-body">
          DuckDB creates each file inside the browser worker. Downloads are
          generated locally and are never uploaded.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-strong bg-coral/10 px-4 py-3 font-body text-sm text-coral"
        >
          {error}
        </p>
      ) : null}

      <div className="space-y-5">
        {tables.map((table) => (
          <Receipt
            key={table.id}
            title={table.label}
            rows={[
              { label: "Contains", value: table.description },
              {
                label: "Actions",
                value: (
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    <PressButton
                      disabled={activeExport !== null}
                      onClick={() => void runExport(table.id, "csv")}
                    >
                      {activeExport === `${table.id}-csv`
                        ? "Creating…"
                        : "Download CSV"}
                    </PressButton>
                    <PressButton
                      disabled={activeExport !== null}
                      onClick={() => void runExport(table.id, "json")}
                    >
                      {activeExport === `${table.id}-json`
                        ? "Creating…"
                        : "Download JSON"}
                    </PressButton>
                  </span>
                ),
              },
            ]}
          />
        ))}
      </div>
    </div>
  );
}
