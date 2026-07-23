import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type TagBoxProps = HTMLAttributes<HTMLSpanElement> & {
  inverted?: boolean;
};

export function TagBox({ className, inverted = false, ...props }: TagBoxProps) {
  return (
    <span
      dir="auto"
      className={cn(
        "inline-flex max-w-full items-center rounded-[var(--radius)] border-strong px-3 py-1.5 font-display text-sm tracking-[0.02em]",
        inverted ? "bg-ink text-cream" : "bg-cream text-ink",
        className,
      )}
      {...props}
    />
  );
}
