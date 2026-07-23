import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ReceiptRow = {
  label: string;
  value: ReactNode;
};

type ReceiptProps = {
  title?: string;
  rows: ReceiptRow[];
  className?: string;
};

export function Receipt({ title, rows, className }: ReceiptProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-y border-ink bg-receipt py-3 ps-4 pe-4",
        "border-s-[6px] border-s-ink",
        className,
      )}
    >
      {title ? (
        <p className="meta-caps mb-3 border-b border-ink/30 pb-2 text-ink">
          {title}
        </p>
      ) : null}
      <dl className="space-y-0">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-b border-ink/20 py-2 last:border-b-0"
          >
            <dt className="font-display text-xs tracking-[0.02em] text-body">
              {row.label}
            </dt>
            <dd className="min-w-0 text-end font-body text-sm text-ink" dir="auto">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
