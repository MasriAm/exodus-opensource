"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { DeskSection } from "./desk-section";
import { cn } from "@/lib/utils";

const CORE_NAV = [
  { id: "desk", label: "Overview" },
  { id: "messages", label: "Messages" },
  { id: "people", label: "People" },
  { id: "identity", label: "Merged Contacts" },
  { id: "media", label: "Media" },
  { id: "activity", label: "Calendar" },
  { id: "search", label: "Search" },
  { id: "footprint", label: "Footprint" },
] as const satisfies ReadonlyArray<{
  id: DeskSection;
  label: string;
}>;

type DashboardSidebarProps = {
  active: DeskSection;
  onSelect: (view: DeskSection) => void;
  showFootprint: boolean;
};

function NavItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "nav-serif-caps flex min-h-11 w-full shrink-0 items-center gap-2 px-4 py-3 text-start transition-[color,background-color,font-size,font-weight] duration-150 lg:min-h-0 lg:border-b lg:border-dotted lg:border-white/15 lg:px-6",
        active
          ? "bg-white/10 text-[1.05rem] font-bold text-teal lg:text-[1.1rem]"
          : "text-[0.95rem] font-medium text-white/75 hover:bg-white/5 hover:text-white",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "font-display text-xs tracking-[0.08em]",
          active ? "text-teal" : "text-transparent",
        )}
      >
        {">>"}
      </span>
      {label}
    </button>
  );
}

export function DashboardSidebar({
  active,
  onSelect,
  showFootprint,
}: DashboardSidebarProps) {
  const router = useRouter();
  const items = CORE_NAV.filter(
    (item) => showFootprint || item.id !== "footprint",
  );

  return (
    <aside className="relative flex overflow-hidden bg-rail text-white lg:sticky lg:top-0 lg:h-screen lg:max-h-screen lg:w-[230px] lg:shrink-0 lg:flex-col">
      <div className="sidebar-grain" aria-hidden="true" />
      <div className="relative z-[1] flex items-center justify-between gap-3 px-5 py-4 lg:block lg:px-6 lg:pb-4 lg:pt-7">
        <Link
          href="/"
          className="flex items-center gap-1 font-display text-2xl font-bold tracking-[0.22em] text-teal transition-opacity hover:opacity-90 lg:text-[1.65rem]"
          aria-label="Exodus home"
        >
          <img src="/logo.png" alt="E" className="h-9 w-auto lg:h-11 shrink-0 -mt-1" />
          <span>XODUS</span>
        </Link>
      </div>

      <nav
        aria-label="Archive terminal"
        className="relative z-[1] flex min-h-0 flex-1 flex-col"
      >
        {/* Scrollable mid section — Wrapped/Export stay pinned below. */}
        <div className="sidebar-scroll flex gap-0 overflow-x-auto px-2 pb-2 lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:px-0 lg:pb-0">
          <div className="flex gap-0 lg:w-full lg:flex-col lg:border-t lg:border-dotted lg:border-white/15">
            {items.map(({ id, label }) => (
              <NavItem
                key={id}
                label={label}
                active={active === id}
                onClick={() => onSelect(id)}
              />
            ))}
          </div>
        </div>

        <div className="mt-auto shrink-0 border-t border-dotted border-white/20 bg-rail px-2 pb-3 pt-1 lg:px-0 lg:pb-6 lg:pt-2">
          <NavItem
            label="Wrapped"
            active={false}
            onClick={() => router.push("/wrapped")}
          />
          <NavItem
            label="Export"
            active={active === "export"}
            onClick={() => onSelect("export")}
          />
        </div>
      </nav>
    </aside>
  );
}
