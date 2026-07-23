import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type TapedNoteProps = {
  children: ReactNode;
  className?: string;
};

export function TapedNote({ children, className }: TapedNoteProps) {
  return (
    <aside
      className={cn(
        "relative -rotate-1 border-strong bg-receipt p-5 shadow-[var(--shadow-soft)] motion-reduce:rotate-0",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rotate-1 bg-teal/40"
      />
      {children}
    </aside>
  );
}
