import type { HTMLAttributes, ReactNode } from "react";

import { CapsuleCard } from "@/components/capsule/card";
import { cn } from "@/lib/utils";

type StackedCardsProps = HTMLAttributes<HTMLDivElement> & {
  layers?: number;
  children: ReactNode;
};

export function StackedCards({
  className,
  layers = 3,
  children,
  ...props
}: StackedCardsProps) {
  return (
    <div className={cn("relative", className)} {...props}>
      {Array.from({ length: Math.max(0, layers - 1) }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="absolute inset-0 rounded-[var(--radius)] border-strong bg-cream"
          style={{
            transform: `translate(${(index + 1) * 6}px, ${(index + 1) * 6}px)`,
            zIndex: index,
          }}
        />
      ))}
      <CapsuleCard className="relative z-10">{children}</CapsuleCard>
    </div>
  );
}
