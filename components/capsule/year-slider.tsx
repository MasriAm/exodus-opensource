"use client";

import { cn } from "@/lib/utils";

type YearSliderProps = {
  years: number[];
  value: number;
  onChange: (year: number) => void;
  className?: string;
};

export function YearSlider({
  years,
  value,
  onChange,
  className,
}: YearSliderProps) {
  if (years.length === 0) {
    return null;
  }

  const min = years[0];
  const max = years[years.length - 1];
  const span = Math.max(1, max - min);
  const percent = ((value - min) / span) * 100;

  return (
    <div className={cn("relative pt-8", className)}>
      <p
        className="pointer-events-none absolute top-0 font-display text-sm font-bold text-teal"
        style={{
          left: `clamp(0%, calc(${percent}% - 1.5rem), calc(100% - 3rem))`,
        }}
      >
        {value}
      </p>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        aria-label="Filter interests by year"
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-0.5 w-full cursor-pointer appearance-none bg-ink accent-teal [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-strong [&::-webkit-slider-thumb]:bg-teal"
      />
      <div className="mt-2 flex justify-between font-display text-xs text-body">
        <span>{min}</span>
        <span className="meta-caps">during</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
