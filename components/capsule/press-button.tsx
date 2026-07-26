"use client";

import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type PressButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export function PressButton({
  className,
  type = "button",
  ...props
}: PressButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] border-strong bg-ink px-4 py-2.5 font-display text-sm font-bold tracking-[0.02em] text-cream shadow-press transition-[transform,box-shadow,background-color] enabled:hover:bg-[color-mix(in_srgb,var(--ink)_88%,var(--paper))] enabled:active:translate-x-0.5 enabled:active:translate-y-0.5 enabled:active:shadow-[2px_2px_0_var(--ink)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none motion-reduce:transition-none motion-reduce:enabled:active:translate-x-0 motion-reduce:enabled:active:translate-y-0",
        className,
      )}
      {...props}
    />
  );
}
