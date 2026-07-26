import type { ReactNode } from "react";

import { containsArabic } from "@/lib/ui-text";
import { cn } from "@/lib/utils";

type ArchivePanelProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/** Cream panel with 2px ink border + 4px hard shadow (mockup chrome). */
export function ArchivePanel({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: ArchivePanelProps) {
  const titleText = typeof title === "string" ? title : null;
  const titleArabic = titleText !== null && containsArabic(titleText);

  return (
    <section className={cn("archive-panel", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/25 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            dir={titleArabic ? "auto" : undefined}
            className={cn(
              "text-[12px] font-bold text-ink",
              titleArabic
                ? "font-body tracking-normal normal-case"
                : "font-display uppercase tracking-[0.1em]",
            )}
          >
            {title}
          </h2>
          {subtitle ? (
            <div className="mt-1 max-w-2xl font-body text-[14px] font-medium leading-6 text-ink/80">
              {subtitle}
            </div>
          ) : null}
        </div>
        {action}
      </div>
      <div className={cn("px-4 py-4 sm:px-5 sm:py-5", bodyClassName)}>
        {children}
      </div>
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
};

/** Labeled stat card: mono label + rule + large serif value. */
export function StatCard({ label, value, valueClassName }: StatCardProps) {
  return (
    <div className="archive-stat-card">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.1em] text-ink/75">
        {label}
      </p>
      <div className="mt-2 border-t border-ink/25 pt-3">
        <p
          className={cn(
            "font-body text-2xl font-semibold leading-tight text-ink sm:text-[1.65rem]",
            valueClassName,
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
