"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type VintagePhotoProps = {
  children: ReactNode;
  className?: string;
  compact?: boolean;
  alt?: string;
};

export function VintagePhoto({
  children,
  className,
  compact = false,
}: VintagePhotoProps) {
  const [revealed, setRevealed] = useState(false);
  const labelId = useId();

  const toggle = useCallback(() => {
    setRevealed((value) => !value);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  useEffect(() => {
    const media = window.matchMedia("(hover: hover)");
    if (media.matches) {
      return;
    }
    // Touch devices rely on tap-toggle via onClick.
  }, []);

  return (
    <div
      className={cn(
        "vintage-print-container",
        compact && "p-2 pb-3",
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-pressed={revealed}
        aria-describedby={labelId}
        className={cn(
          "photo-filter-wrapper w-full cursor-pointer outline-none",
          revealed && "is-revealed",
        )}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
      <p id={labelId} className="sr-only">
        Hover, press, or activate to reveal the original photo.
      </p>
    </div>
  );
}
