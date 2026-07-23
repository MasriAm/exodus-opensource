"use client";

import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";

import type { FilterOptionsResult } from "@/lib/db/types";

export type DeskSection =
  | "desk"
  | "people"
  | "messages"
  | "media"
  | "activity"
  | "search"
  | "footprint"
  | "export";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: FilterOptionsResult | null;
  onGoSection: (section: DeskSection) => void;
  onGoPerson: (conversation: string) => void;
  onSearch: (query: string) => void;
  hasFootprint: boolean;
};

const SECTIONS: Array<{ id: DeskSection; label: string }> = [
  { id: "desk", label: "Reading desk" },
  { id: "messages", label: "Messages" },
  { id: "people", label: "People" },
  { id: "media", label: "Media" },
  { id: "activity", label: "Calendar" },
  { id: "search", label: "Search" },
  { id: "footprint", label: "Footprint" },
  { id: "export", label: "Export" },
];

export function CommandPalette({
  open,
  onOpenChange,
  options,
  onGoSection,
  onGoPerson,
  onSearch,
  hasFootprint,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const people = options?.conversations ?? [];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const sections = useMemo(
    () => SECTIONS.filter((section) => hasFootprint || section.id !== "footprint"),
    [hasFootprint],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-ink/40 p-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 cursor-default"
        onClick={() => onOpenChange(false)}
      />
      <Command
        className="relative z-10 w-full max-w-lg overflow-hidden border-strong bg-cream shadow-press"
        label="Command palette"
      >
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Jump to a person, section, or search…"
          className="w-full border-b-2 border-ink bg-transparent px-4 py-3 font-display text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-2">
          <Command.Empty className="px-3 py-6 font-body text-sm text-body">
            Nothing matched.
          </Command.Empty>
          <Command.Group heading="Sections" className="meta-caps px-2 py-1 text-[10px] text-body">
            {sections.map((section) => (
              <Command.Item
                key={section.id}
                value={section.label}
                onSelect={() => {
                  onGoSection(section.id);
                  onOpenChange(false);
                }}
                className="cursor-pointer rounded-[var(--radius)] px-3 py-2 font-display text-sm aria-selected:bg-ink aria-selected:text-cream"
              >
                {section.label}
              </Command.Item>
            ))}
          </Command.Group>
          {people.length > 0 ? (
            <Command.Group
              heading="People"
              className="meta-caps px-2 py-1 text-[10px] text-body"
            >
              {people.slice(0, 40).map((person) => (
                <Command.Item
                  key={`${person.platform}:${person.conversation}`}
                  value={`person ${person.conversation}`}
                  onSelect={() => {
                    onGoPerson(person.conversation);
                    onOpenChange(false);
                  }}
                  className="cursor-pointer rounded-[var(--radius)] px-3 py-2 font-display text-sm aria-selected:bg-ink aria-selected:text-cream"
                >
                  <span dir="auto">{person.conversation}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {query.trim() ? (
            <Command.Group
              heading="Search"
              className="meta-caps px-2 py-1 text-[10px] text-body"
            >
              <Command.Item
                value={`search ${query}`}
                onSelect={() => {
                  onSearch(query.trim());
                  onOpenChange(false);
                }}
                className="cursor-pointer rounded-[var(--radius)] px-3 py-2 font-display text-sm aria-selected:bg-ink aria-selected:text-cream"
              >
                Search for “{query.trim()}”
              </Command.Item>
            </Command.Group>
          ) : null}
        </Command.List>
      </Command>
    </div>
  );
}
