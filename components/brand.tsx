import Link from "next/link";

import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex items-center gap-2 font-display text-lg font-bold tracking-[0.04em] text-ink",
        className,
      )}
      aria-label="Exodus home"
    >
      <span aria-hidden="true" className="text-teal">
        {">>"}
      </span>
      Exodus
    </Link>
  );
}
