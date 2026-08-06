import { pluralize } from "@/lib/format";

type DashboardHeaderProps = {
  title: string;
  eyebrow: string;
  subtitle?: string;
  messageCount?: number;
  onExport: () => void;
};

export function DashboardHeader({
  title,
  eyebrow,
  subtitle,
  messageCount,
  onExport,
}: DashboardHeaderProps) {
  return (
    <header className="border-b-2 border-ink/25">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="meta-caps text-[11px]">{eyebrow}</p>
            <h1 className="mt-1 font-display text-[1.75rem] font-bold uppercase tracking-[0.06em] text-ink sm:text-[2rem] lg:text-[2.15rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 max-w-2xl font-body text-[15px] font-medium leading-7 text-ink/85">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onExport}
            className="shrink-0 self-start border-2 border-ink bg-teal px-4 py-2.5 font-display text-xs font-bold uppercase tracking-[0.08em] text-cream shadow-press transition-[transform,box-shadow,background-color] hover:bg-[color-mix(in_srgb,var(--teal)_88%,var(--ink))] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[4px_4px_0_var(--ink)] motion-reduce:transition-none"
          >
            Export data
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {messageCount !== undefined ? (
            <span className="inline-flex items-center border-2 border-ink/30 bg-cream px-2.5 py-1 font-display text-[11px] font-bold tracking-[0.04em] text-ink">
              {pluralize(messageCount, "message")}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 border-2 border-ink/30 bg-cream px-2.5 py-1 font-display text-[11px] font-bold tracking-[0.04em] text-ink">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-teal" />
            Local session
          </span>
        </div>
      </div>
    </header>
  );
}
