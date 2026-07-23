"use client";

import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  Fingerprint,
  Images,
  LayoutDashboard,
  MessageCircleMore,
  Sparkles,
  Users,
} from "lucide-react";

import { Brand } from "@/components/brand";
import type { DeskSection } from "./command-palette";
import { cn } from "@/lib/utils";

const CORE_NAV = [
  { id: "desk", label: "Desk", icon: LayoutDashboard },
  { id: "messages", label: "Messages", icon: MessageCircleMore },
  { id: "people", label: "People", icon: Users },
  { id: "media", label: "Media", icon: Images },
  { id: "activity", label: "Calendar", icon: CalendarDays },
  { id: "footprint", label: "Footprint", icon: Fingerprint },
] as const satisfies ReadonlyArray<{
  id: DeskSection;
  label: string;
  icon: typeof LayoutDashboard;
}>;

type DashboardSidebarProps = {
  active: DeskSection;
  onSelect: (view: DeskSection) => void;
  showFootprint: boolean;
  onOpenCommands: () => void;
};

export function DashboardSidebar({
  active,
  onSelect,
  showFootprint,
  onOpenCommands,
}: DashboardSidebarProps) {
  const router = useRouter();
  const items = CORE_NAV.filter(
    (item) => showFootprint || item.id !== "footprint",
  );

  return (
    <aside className="bg-paper text-ink lg:flex lg:min-h-screen lg:w-48 lg:shrink-0 lg:flex-col lg:border-e lg:border-ink/20">
      <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-4 lg:py-5">
        <Brand />
        <button
          type="button"
          onClick={onOpenCommands}
          className="font-display text-[11px] tracking-[0.08em] text-body underline underline-offset-4 lg:mt-3 lg:inline-block"
        >
          Ctrl+K
        </button>
      </div>

      <nav
        aria-label="Reading desk"
        className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:px-2 lg:pb-0"
      >
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active === id ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2.5 font-display text-xs tracking-[0.02em] transition-colors duration-150 lg:min-h-0 lg:w-full lg:py-2",
              active === id
                ? "border-s-2 border-teal bg-cream text-ink"
                : "border-s-2 border-transparent text-body hover:bg-teal-wash hover:text-ink",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => router.push("/wrapped")}
          className="flex min-h-11 shrink-0 items-center gap-2 border-s-2 border-transparent px-3 py-2.5 font-display text-xs tracking-[0.02em] text-teal transition-colors duration-150 hover:bg-teal-wash lg:hidden"
        >
          <Sparkles aria-hidden="true" className="size-4" />
          Wrapped
        </button>
        <button
          type="button"
          onClick={() => onSelect("export")}
          className={cn(
            "flex min-h-11 shrink-0 items-center gap-2 px-3 py-2.5 font-display text-xs tracking-[0.02em] transition-colors duration-150 lg:hidden",
            active === "export"
              ? "border-s-2 border-teal bg-cream text-ink"
              : "border-s-2 border-transparent text-body hover:bg-teal-wash hover:text-ink",
          )}
        >
          <Download aria-hidden="true" className="size-4" />
          Export
        </button>
      </nav>

      <div className="hidden border-t border-ink/20 px-2 py-3 lg:block">
        <button
          type="button"
          onClick={() => router.push("/wrapped")}
          className="flex w-full items-center gap-2 px-3 py-2 font-display text-xs tracking-[0.02em] text-teal transition-colors duration-150 hover:bg-teal-wash"
        >
          <Sparkles aria-hidden="true" className="size-4" />
          Wrapped
        </button>
        <button
          type="button"
          onClick={() => onSelect("export")}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 font-display text-xs tracking-[0.02em] transition-colors duration-150",
            active === "export"
              ? "border-s-2 border-teal bg-cream text-ink"
              : "border-s-2 border-transparent text-body hover:bg-teal-wash hover:text-ink",
          )}
        >
          <Download aria-hidden="true" className="size-4" />
          Export
        </button>
      </div>
    </aside>
  );
}
