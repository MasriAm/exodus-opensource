"use client";

import { useEffect } from "react";

import type { PlatformThemeId } from "@/lib/platform-theme";

/**
 * Apply a capsule skin for as long as the screen is mounted.
 *
 * The attribute goes on the document element rather than a wrapper because the
 * themed tokens are declared on `:root`, and because the deck renders from
 * several branches (loading, empty, error, the deck itself) that would each
 * otherwise need their own wrapper. Portals and modals inherit it for free.
 */
export function usePlatformTheme(theme: PlatformThemeId | null): void {
  useEffect(() => {
    if (theme === null || theme === "archive") {
      return;
    }
    const root = document.documentElement;
    const previous = root.dataset.wrappedTheme;
    root.dataset.wrappedTheme = theme;

    return () => {
      if (previous === undefined) {
        delete root.dataset.wrappedTheme;
      } else {
        root.dataset.wrappedTheme = previous;
      }
    };
  }, [theme]);
}
