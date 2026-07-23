import { formatNumber } from "@/lib/format";

type DashboardHeaderProps = {
  title: string;
  eyebrow: string;
  subtitle?: string;
  messageCount?: number;
};

export function DashboardHeader({
  title,
  eyebrow,
  subtitle,
  messageCount,
}: DashboardHeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-ink/20 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-8">
      <div className="min-w-0 max-w-2xl">
        <p className="meta-caps text-[11px] text-body">{eyebrow}</p>
        <h1 className="mt-1 font-display text-[17px] font-bold tracking-[0.02em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 font-body text-[15px] leading-7 text-body">
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:pt-1">
        {messageCount !== undefined ? (
          <span className="inline-flex items-center border border-ink/20 px-2.5 py-1 font-display text-[11px] tracking-[0.02em] text-body">
            {formatNumber(messageCount)} messages
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5 border border-ink/20 px-2.5 py-1 font-display text-[11px] tracking-[0.02em] text-body">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-teal" />
          Local session
        </span>
      </div>
    </header>
  );
}
