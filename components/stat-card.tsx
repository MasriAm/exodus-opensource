import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  detail?: string;
  icon: LucideIcon;
  className?: string;
};

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  className,
}: StatCardProps) {
  return (
    <article
      className={cn(
        "rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
          {detail ? (
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
    </article>
  );
}
