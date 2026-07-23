import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

type StatePanelProps = {
  title: string;
  description: string;
  kind?: "loading" | "empty" | "error";
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
};

export function StatePanel({
  title,
  description,
  kind = "empty",
  icon,
  action,
  className,
}: StatePanelProps) {
  const Icon =
    icon ??
    (kind === "loading"
      ? LoaderCircle
      : kind === "error"
        ? CircleAlert
        : Inbox);

  return (
    <section
      role={kind === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "grid min-h-64 place-items-center border-2 border-dashed border-ink/50 bg-cream/70 p-8 text-center",
        kind === "error" && "border-coral/50 bg-coral/5",
        className,
      )}
    >
      <div className="max-w-md">
        <span className="mx-auto grid size-12 place-items-center border-strong bg-paper text-ink">
          <Icon
            aria-hidden="true"
            className={cn(
              "size-5",
              kind === "loading" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <h2 className="mt-4 font-display text-xl font-bold tracking-[0.02em] text-ink">
          {title}
        </h2>
        <p className="mt-2 font-body text-sm leading-6 text-body">
          {description}
        </p>
        {action ? (
          <div className="mt-5 flex justify-center">{action}</div>
        ) : null}
      </div>
    </section>
  );
}
