"use client";

import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Download,
  Fingerprint,
  Images,
  LayoutDashboard,
  MessageCircleMore,
  Search,
  Sparkles,
  Users,
} from "lucide-react";

import { Brand } from "@/components/brand";
import type { DeskSection } from "./command-palette";
import { cn } from "@/lib/utils";

const navigation = [
  { id: "desk", label: "Desk", icon: LayoutDashboard },
  { id: "people", label: "People", icon: Users },
  { id: "messages", label: "Messages", icon: MessageCircleMore },
  { id: "media", label: "Media", icon: Images },
  { id: "activity", label: "Activity", icon: CalendarDays },
  { id: "search", label: "Search", icon: Search },
  { id: "footprint", label: "Footprint", icon: Fingerprint },
  { id: "export", label: "Export", icon: Download },
] as const satisfies ReadonlyArray<{
  id: DeskSection;
  label: string;
  icon: typeof Search;
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
  const items = navigation.filter(
    (item) => showFootprint || item.id !== "footprint",
  );

  return (
    <aside className="border-ink bg-paper text-ink lg:flex lg:min-h-screen lg:w-56 lg:shrink-0 lg:flex-col lg:border-r-2">
      <div className="flex items-center justify-between gap-4 px-4 py-4 lg:block lg:px-4 lg:py-5">
        <Brand />
        <button
          type="button"
          onClick={onOpenCommands}
          className="font-display text-xs tracking-[0.02em] text-body underline underline-offset-4 lg:mt-3 lg:inline-block"
        >
          Cmd/Ctrl+K
        </button>
      </div>

      <nav
        aria-label="Reading desk"
        className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:space-y-0 lg:overflow-visible lg:px-2 lg:pb-0"
      >
        <button
          type="button"
          onClick={() => router.push("/wrapped")}
          className="mb-2 flex shrink-0 items-center gap-2 border-2 border-transparent px-3 py-2 font-display text-sm tracking-[0.02em] text-teal transition hover:border-ink hover:bg-cream lg:w-full"
        >
          <Sparkles aria-hidden="true" className="size-4" />
          Wrapped
        </button>
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            aria-current={active === id ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-2 border-2 px-3 py-2 font-display text-sm tracking-[0.02em] transition lg:w-full",
              active === id
                ? "border-ink border-e-0 bg-cream text-ink lg:relative lg:z-10 lg:-me-px"
                : "border-transparent bg-paper text-body hover:border-ink/40 hover:bg-cream/60",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto hidden p-4 lg:block">
        <p className="font-body text-xs leading-5 text-body">
          A reading desk for a decade of private correspondence. Nothing leaves
          this browser.
        </p>
      </div>
    </aside>
  );
}
