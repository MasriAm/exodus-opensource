import { cn } from "@/lib/utils";

type SlideTitleProps = {
  children: string;
  accent?: "teal" | "coral" | "slate" | "ink";
  className?: string;
};

const accentClass: Record<NonNullable<SlideTitleProps["accent"]>, string> = {
  teal: "text-teal",
  coral: "text-coral",
  slate: "text-slate",
  ink: "text-ink",
};

export function SlideTitle({
  children,
  accent = "teal",
  className,
}: SlideTitleProps) {
  return (
    <h2
      className={cn(
        "font-display text-2xl font-bold tracking-[0.02em] text-ink sm:text-3xl",
        className,
      )}
    >
      <span className={accentClass[accent]} aria-hidden="true">
        {">> "}
      </span>
      {children}
    </h2>
  );
}
