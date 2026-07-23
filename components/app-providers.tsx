"use client";

import { ArchiveSessionProvider } from "@/components/archive-session";
import { FilmGrain } from "@/components/capsule/film-grain";
import { PwaRegister } from "@/components/pwa-register";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ArchiveSessionProvider>
      {children}
      <FilmGrain />
      <PwaRegister />
    </ArchiveSessionProvider>
  );
}
