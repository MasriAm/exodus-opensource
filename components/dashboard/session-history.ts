import type { DeskSection } from "./desk-section";

const DESK_SECTIONS: ReadonlySet<string> = new Set([
  "desk",
  "people",
  "messages",
  "media",
  "activity",
  "search",
  "footprint",
  "identity",
  "export",
]);

export function parseDeskSection(raw: string | null | undefined): DeskSection {
  if (raw && DESK_SECTIONS.has(raw)) {
    return raw as DeskSection;
  }
  return "desk";
}

export function deskSectionHref(view: DeskSection): string {
  return view === "desk" ? "/dashboard" : `/dashboard?view=${view}`;
}

export function readDeskSectionFromLocation(): DeskSection {
  if (typeof window === "undefined") {
    return "desk";
  }
  return parseDeskSection(
    new URLSearchParams(window.location.search).get("view"),
  );
}

export function wrappedSlideHref(slide: number): string {
  return slide <= 0 ? "/wrapped" : `/wrapped?slide=${slide}`;
}

export function readWrappedSlideFromLocation(maxIndex: number): number {
  if (typeof window === "undefined" || maxIndex < 0) {
    return 0;
  }
  const raw = new URLSearchParams(window.location.search).get("slide");
  if (raw === null) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, maxIndex);
}

/** In-app history step — no RSC fetch, no archive payload in the URL. */
export function pushSessionUrl(href: string, state: object): void {
  if (typeof window === "undefined") {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === href) {
    return;
  }
  window.history.pushState(state, "", href);
}

export function replaceSessionUrl(href: string, state: object): void {
  if (typeof window === "undefined") {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === href) {
    return;
  }
  window.history.replaceState(state, "", href);
}
