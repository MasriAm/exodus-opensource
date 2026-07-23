import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type CapsuleCardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function CapsuleCard({
  className,
  interactive = false,
  ...props
}: CapsuleCardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius)] border-strong bg-cream shadow-press",
        interactive &&
          "transition-[transform,box-shadow] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[8px_8px_0_var(--ink)] motion-reduce:transform-none motion-reduce:hover:shadow-press",
        className,
      )}
      {...props}
    />
  );
}
