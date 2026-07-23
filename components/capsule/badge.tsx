import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type CapsuleBadgeProps = HTMLAttributes<HTMLSpanElement>;

export function CapsuleBadge({ className, ...props }: CapsuleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] bg-teal px-3 py-1.5 font-body text-xs font-semibold tracking-wide text-cream",
        className,
      )}
      {...props}
    />
  );
}
