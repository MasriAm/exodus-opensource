import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type MarkProps = HTMLAttributes<HTMLElement> & {
  variant?: "teal" | "dark";
  as?: "span" | "mark";
};

export function Mark({
  className,
  variant = "teal",
  as: Tag = "mark",
  ...props
}: MarkProps) {
  return (
    <Tag
      className={cn(
        "rounded-[2px] px-[0.3em] py-0 font-medium not-italic",
        variant === "teal" && "bg-teal text-cream",
        variant === "dark" && "bg-ink text-cream",
        className,
      )}
      {...props}
    />
  );
}
