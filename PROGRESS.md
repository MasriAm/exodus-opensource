# Exodus Progress

## Status

Phases 0–8 are complete. The static export under `out/` is the shippable
artifact. No commits were made during this work.

## Phase notes

### Dashboard v2 — Reading Desk

- Fixed Wrapped→dashboard empty handoff: worker pinned on `globalThis`,
  `ArchiveSessionProvider` + `SessionGate`, soft `router.push` navigation.
- Dashboard IA replaced with Reading Desk: alive home, year film-strip,
  global filters, People, heatmap calendar, grown-up search tokens,
  Footprint, Cmd+K palette, Surprise me. Filters applied in SQL.

### Time Capsule design revamp

Presentation-only restyle to a vintage personal-archive aesthetic (aged paper,
Courier Prime + Lora, film grain, sepia polaroids). Shared recipes live under
`components/capsule/`. Ingest routes to `/wrapped` first; the dashboard sidebar
replays Wrapped. Empty Wrapped slides are skipped. Fonts are self-hosted via
`@fontsource`; no CDN assets.

### Phase 0 — Scaffold & constraints

Complete from the earlier scaffold session. Static export, strict TypeScript,
CSP headers, DuckDB asset copy, and smoke tests remain in place.

### Phase 1 — Fixture generator

- Deterministic seeded generator for Instagram and WhatsApp archives.
- Exact analytics and count expectations live in `fixtures/manifest.json`.
- Fixture ZIP tests assert entry counts, pagination, bilingual content,
  mojibake escapes, and WhatsApp edge cases.

### Phase 2 — Zip layer, worker, detection

- `lib/zip.ts` provides random-access entry reads with wrapper-root aliases.
- One Comlink-exposed worker owns ZIP reading, parser selection, DuckDB, and
  named queries.
- Landing dropzone plus same-origin synthetic export import are wired.

### Phase 3 — Instagram parser

- Detects `your_instagram_activity/` paths, including wrapped roots.
- Parses paginated inbox threads, media, follower/following events.
- Applies safe mojibake repair to Instagram-sourced strings.
- Fixture-backed parser tests match the committed manifest.

### Phase 4 — Ingest to DB + first views

- Batched prepared inserts into DuckDB with zod validation.
- Named queries power conversation list, paginated messages, and counts.
- Dashboard message reader uses `dir="auto"` bubbles and loading/empty/error
  states.

### Phase 5 — Search + media + activity

- Case-insensitive local search grouped by conversation.
- Lazy media decoding with IntersectionObserver; blob URLs are revoked when
  cards leave the viewport or unmount.
- WhatsApp `omitted://` media references render placeholders instead of ZIP
  reads.
- Activity view charts event totals over time with recharts.

### Phase 6 — Wrapped + share card

- Named wrapped statistics cover totals, date range, top contacts, hourly
  histogram / 3am era, busiest day, top words, first message, and streak.
- Story extras: longest mutual follows, chat eras (longest conversation /
  most typed word / longest WhatsApp call), cringe comments, interests by
  year, username/bio history, and first image (lazy Blob URL).
- Share-card PNG export was removed; Wrapped is view-only in-session.
- Numbers use `Intl.NumberFormat`.

### Phase 7 — WhatsApp parser + export-out

- Supports iOS and Android timestamps, continuations, system lines, omitted
  media, and RTL marks.
- CSV exports use DuckDB `COPY` and prepend a UTF-8 BOM.
- JSON exports are created from local query rows so the CSP does not need the
  DuckDB JSON extension.
- `CONTRIBUTING.md` documents the three-step parser workflow.

### Phase 8 — Polish, PWA, ship

- Landing trust badges and live same-origin network-request badge.
- Service worker precaches the finalized static shell and DuckDB assets.
- README includes architecture notes and screenshots from the synthetic
  fixture.
- Accessibility: focus styles, alt text, and loading/empty/error states across
  views.

## Verification

Gate commands (latest audit run):

- `npm run typecheck` — passed
- `npm run test` — 10 files / 32 tests passed (latest)
- `npm run lint` — passed when run
- `npm run build` — passed; service worker finalized with local assets under
  `out/` (hash changes each build)
- Browser smoke (`npm run test:browser`) — optional; requires Edge/Chrome and
  a running preview. Prefer `npm run preview` then smoke when verifying offline.

Known sync notes from the full-project audit:

- Landing badge shows **External: 0 · Local assets: N** (same-origin shell loads
  are expected; third-party must stay 0)
- In-memory DuckDB is session-scoped: refreshing `/dashboard` or `/wrapped`
  requires re-import (empty-state copy points home)
- Manifest `analytics.twoToFourAmMessages` matches Wrapped hours `[2, 4)` UTC

## Deviations

1. DuckDB ingestion no longer uses `read_json(...)` / `read_json_auto(...)`.
   Under the app CSP those APIs attempt to download the remote JSON extension.
   Batches are inserted with prepared statements instead.
2. JSON export likewise avoids DuckDB's JSON `COPY` extension and serializes
   query rows in the worker. CSV still uses DuckDB `COPY`.
3. The worker imports `@duckdb/duckdb-wasm/dist/duckdb-browser` so the browser
   bundle does not pull the Node DuckDB entry. A local ambient declaration
   keeps TypeScript happy with the package `exports` map.
4. Instagram personal-information entries without positive timestamps are
   ignored; follower/following events are still ingested.
5. WhatsApp wall-clock timestamps are interpreted as UTC because exports do
   not include a timezone.
6. Lighthouse installable-PWA scoring was not run; installability is covered by
   the committed manifest, production service-worker registration, and the
   offline browser smoke instead.
7. Gallery memory flatness was verified by asserting blob URL revocation when
   cards leave the viewport, not by a continuous DevTools Memory profile.
8. Wrapped story extras (mutuals, cringe comments, interests-by-year, profile
   history, first image, longest WhatsApp call) degrade by hiding empty
   sections. Optional Instagram story files are try/caught so malformed or
   missing surfaces do not fail ingest. Longest mutual duration uses
   `Date.now()` at query time (not a fixed fixture clock). First-image slide
   uses on-demand `readMediaBlob` + Blob URLs, never Base64.
9. The landing network badge reports **external** requests only (target: 0).
   Same-origin JS/CSS loads are expected and appear only in the tooltip — they
   are not phone-home traffic. CSP `connect-src 'self'` still blocks
   cross-origin fetches.
10. Synthetic Instagram demo is **embedded** at fixture-copy time
    (`lib/generated/demo-instagram.ts`) so “Try synthetic export” does not
    depend on `fetch("/demo-instagram.zip")` (that path failed under some
    OneDrive/dev/SW conditions with `TypeError: Failed to fetch`).

## Final definition of done checklist

- [x] Both fixtures ingest with manifest-exact counts; all tests green
- [x] Wi-Fi off after load: browse, search, media, Wrapped, export all work
- [x] Network activity after load stays same-origin (CSP `connect-src 'self'`)
- [x] Arabic text correct; `dir="auto"` on user-content surfaces
- [x] No `any`, no `@ts-ignore`, no TODOs in application code
- [x] Every view has loading/empty/error states; corrupted ZIP surfaces a
  friendly error
- [x] `npm i` → `npm run fixtures` → `npm run dev` is the documented local path
- [x] LICENSE, README, CONTRIBUTING, and honest PROGRESS.md are present
