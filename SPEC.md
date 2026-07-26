# EXODUS — Master Build Spec & Agent Instructions

You are a senior engineer building **Exodus** for the JOSA Reclaim hackathon: a local-first, zero-knowledge web app that turns Big Tech data-export ZIPs (Instagram, WhatsApp, later Google Takeout) into a private, searchable dashboard — parsed **entirely in the browser**. Nothing the user drops in may ever leave their machine.

Save this file to the repo root as `SPEC.md`. It is the single source of truth. Work through it **one phase at a time** (Section 7). Do not skip ahead. Do not start a phase until the previous phase's gate passed.

---

## 1. Ground rules — read before writing any code

These rules exist to prevent hallucinated APIs, fake progress, and demo-day failures. They override any habit or shortcut.

1. **Never write library calls from memory.** Before using any API from `@duckdb/duckdb-wasm`, `@zip.js/zip.js`, or `comlink`, open the installed package's type definitions in `node_modules/<pkg>/` (e.g. `dist/*.d.ts`) and confirm the exact function name and signature. The installed types are the source of truth — not your training data, not blog posts.
2. **If an API you planned doesn't exist in the installed types, do not write it anyway.** No `@ts-ignore`, no `as any` to silence it. Find the real API in the types, or stop and report the mismatch with the actual exported names you found.
3. **Never invent file paths, config options, or CLI flags.** Read the actual file before editing it. If a file you expect doesn't exist, say so — don't fabricate its contents.
4. **No stub-and-claim.** Never mark a task done if it contains `TODO`, placeholder data, a commented-out body, or an unimplemented branch. Partial work is fine — but report it as partial.
5. **Never report a command result you didn't run.** After each phase, run the gate (`npm run typecheck && npm run test && npm run build`) and paste the real output. If it fails, fix it before moving on. Do not summarize a gate as "passing" without output.
6. **Fixtures are ground truth for parsers.** Parsers are written against the files in `fixtures/` that exist in this repo — open them, read them, derive the schema from them. Never code against a remembered idea of what an Instagram export "usually" looks like. When real export samples appear in `samples/` (gitignored), extend parsers to handle both, with the fixture tests still passing.
7. **When the spec is ambiguous or two rules conflict, stop and ask** one specific question. Do not guess silently on anything that affects the data model, the parser contract, or privacy.
8. **Strict TypeScript.** `"strict": true`, no `any` in committed code (use `unknown` + narrowing), exhaustive `switch` on discriminated unions, all zod parses handled (`safeParse` with explicit error paths).
9. **Every user-visible surface has loading, empty, and error states.** No unhandled promise rejections. Errors surface to the user in plain language, never as raw stack traces, and are also `console.error`'d for debugging.
10. **After each phase:** run the gate and update `PROGRESS.md` (what was built, what's pending, any deviations from spec). Do not commit or push unless the user explicitly asks.
11. **Scope discipline.** Build exactly what the current phase lists. Do not add libraries, abstractions, or features not in this spec. If you believe something extra is needed, propose it in one sentence and wait.

## 2. Architecture invariants (never violate)

Also write these into `.cursor/rules/exodus.mdc` in Phase 0 so they persist across sessions.

- **Fully client-side.** Next.js 15 App Router with `output: 'export'`. NEVER add API routes, route handlers, server actions, middleware, or any `fetch`/XHR/WebSocket to an external origin. If a feature seems to need a server, stop and flag it.
- **All ZIP reading, parsing, and the database live in one Web Worker** (`workers/ingest.worker.ts`), exposed to the UI via Comlink. The main thread never unzips, parses, or runs SQL directly — it calls the worker's exposed methods.
- **Parsers are plugins.** Each lives in `parsers/<platform>/index.ts`, implements `DataParser` from `parsers/types.ts`, outputs rows validated by zod against `lib/schema.ts`, and never touches the DOM, React, or DuckDB directly.
- **All SQL lives in `lib/db/`.** UI components call typed query functions; they never contain SQL strings.
- **Memory rules:** never load an entire ZIP or an entire media file into memory as a strategy. Media entries are decompressed on demand with zip.js `getData()`, displayed via `URL.createObjectURL`, and released with `URL.revokeObjectURL` when the element unmounts. Text entries are parsed in batches; DB inserts are batched (Section 5.3).
- **Offline-complete:** every asset (DuckDB wasm/worker bundles, fonts, icons) is self-hosted under `public/`. No CDN references anywhere. The deployed app must work with Wi-Fi off after first load.
- **Arabic-first correctness:** all message/text rendering uses `dir="auto"`; mojibake repair (Section 6.2) is applied to all Instagram-sourced strings.
- **UI stack is fixed:** Tailwind + shadcn/ui + recharts. No additional UI or state libraries.

## 3. Stack & repository layout

Install with npm (latest stable of each; the installed version's types are authoritative per Rule 1):

- `next` (v15), `react`, `typescript`, `tailwindcss`
- `@zip.js/zip.js` — random-access ZIP reading
- `@duckdb/duckdb-wasm` — in-browser SQL
- `comlink` — worker RPC
- `zod` — boundary validation
- `recharts` — charts
- `write-excel-file` — formatted spreadsheet export (xlsx)
- dev: `vitest`
- shadcn/ui via `npx shadcn@latest init` (then `add` components as needed)

```
exodus/
├─ app/                     # / (landing), /dashboard, /wrapped
├─ components/              # views + shadcn/ui
├─ lib/
│  ├─ db/                   # duckdb init + all query functions
│  ├─ schema.ts             # normalized types + zod schemas
│  └─ text.ts               # mojibake fix, tokenizer, stopwords
├─ parsers/
│  ├─ types.ts              # DataParser interface (Section 4)
│  ├─ registry.ts
│  ├─ instagram/index.ts
│  └─ whatsapp/index.ts
├─ workers/ingest.worker.ts # Comlink-exposed: ingest + query
├─ fixtures/                # generated synthetic exports (committed)
├─ samples/                 # real exports (GITIGNORED — never commit)
├─ scripts/generate-fixture.ts
├─ public/duckdb/           # self-hosted duckdb-wasm bundles
├─ SPEC.md  PROGRESS.md  README.md  CONTRIBUTING.md  LICENSE
```

## 4. Parser plugin contract (exact code for `parsers/types.ts`)

```ts
import type { ZipEntryMap } from "../lib/zip";
import type { NormalizedRow } from "../lib/schema";

export interface ParserProgress {
  done: number;            // rows emitted so far
  label: string;           // "Parsing messages…"
}

export interface DataParser {
  id: string;              // "instagram"
  displayName: string;     // "Instagram"
  /** Return true iff this parser recognizes the archive from entry paths alone. */
  detect(entryPaths: string[]): boolean;
  /** Read entries via the map, emit normalized rows in batches of <= 2000. */
  parse(
    entries: ZipEntryMap,
    emit: (batch: NormalizedRow[]) => Promise<void>,
    progress: (p: ParserProgress) => void
  ): Promise<void>;
}
```

`ZipEntryMap` (defined in `lib/zip.ts`) wraps zip.js: `paths(): string[]`, `readText(path): Promise<string>`, `readBlob(path): Promise<Blob>`. Parsers see nothing else. `registry.ts` exports `parsers: DataParser[]` and `detectParser(paths): DataParser | null` (first match wins; exactly one may match a given fixture — enforced by test).

## 5. Data model

### 5.1 Normalized rows (`lib/schema.ts`, zod-validated)

```ts
type NormalizedRow =
  | { table: "messages"; platform: string; conversation: string; sender: string;
      sent_at_ms: number; text: string | null; media_ref: string | null }
  | { table: "media"; platform: string; zip_path: string;
      kind: "image" | "video" | "audio" | "other"; taken_at_ms: number | null;
      conversation: string | null }
  | { table: "events"; platform: string; kind: string; occurred_at_ms: number;
      payload: string /* JSON string */ };
```

### 5.2 DuckDB DDL (created on worker init)

```sql
CREATE TABLE messages(platform VARCHAR, conversation VARCHAR, sender VARCHAR,
  sent_at TIMESTAMP, text VARCHAR, media_ref VARCHAR);
CREATE TABLE media(platform VARCHAR, zip_path VARCHAR, kind VARCHAR,
  taken_at TIMESTAMP, conversation VARCHAR);
CREATE TABLE events(platform VARCHAR, kind VARCHAR, occurred_at TIMESTAMP, payload VARCHAR);
```

Convert `*_ms` to TIMESTAMP at insert time (e.g. `to_timestamp(ms / 1000.0)` — verify the exact function against DuckDB docs bundled in the package or a quick query test, per Rule 1).

### 5.3 Ingest pattern

In the worker, buffer emitted rows per table and insert every ≤2000 rows with
**prepared `INSERT` statements** (batched parameters). Do **not** use DuckDB
`read_json` / remote extensions under the app CSP — those attempt network
downloads. Never row-by-row `INSERT` statements in a loop.

### 5.4 Worker surface (Comlink-exposed)

```ts
interface IngestApi {
  ingest(file: File, onProgress: (p: IngestProgress) => void): Promise<IngestSummary>;
  query<T>(name: QueryName, params?: unknown): Promise<T>;   // named queries only, defined in lib/db/queries.ts
  readMediaBlob(zipPath: string): Promise<Blob>;
  exportTable(table: "messages" | "media" | "events", format: "csv" | "json"): Promise<Blob>;
}
```

Callbacks passed through Comlink must be wrapped with `Comlink.proxy` — verify in comlink's types/readme.

## 6. Parser specifications

### 6.1 Fixture is authoritative

`scripts/generate-fixture.ts` (run with `npx tsx`, dev-dependency `tsx`) writes:

- `fixtures/demo-instagram.zip` — structure mimicking a real Instagram JSON export:
  - `your_instagram_activity/messages/inbox/<thread_slug>/message_1.json` (3 threads; one thread also has `message_2.json` to force pagination handling). Shape: `{ participants: [{name}], messages: [{ sender_name, timestamp_ms, content?, photos?: [{uri, creation_timestamp}] }], title, thread_path }`.
  - matching photo files at the `uri` paths (tiny valid JPEGs)
  - `connections/followers_and_following/followers_1.json` using the `string_list_data` shape
  - `personal_information/personal_information.json`
  - Messages must be a bilingual Arabic/English mix, ~1,500 messages total across 3 senders, timestamps spread over 2 years including a burst of 02:00–04:00 messages (so Wrapped has a "3am era" to find), and include strings written as **mojibake** (see 6.2) exactly as Instagram emits them.
- `fixtures/demo-whatsapp.zip` — a `_chat.txt` mixing both timestamp formats below, multiline messages, `<Media omitted>`, and U+200E marks.
- `fixtures/manifest.json` — exact expected counts (messages per thread, media count, event count, per-sender counts). **Parser tests assert against this manifest**, so generator and tests can never drift apart.

### 6.2 Instagram parser

- `detect`: any path starts with `your_instagram_activity/` (tolerant of a wrapping root folder).
- Parse every `messages/inbox/*/message_*.json`; conversation = thread folder name; rows for each message; `photos` entries become `media` rows and set `media_ref`.
- Followers/following files become `events` rows (`kind: "follower"` etc.).
- **Mojibake repair (critical for Arabic):** Instagram JSON encodes UTF-8 bytes as Latin-1 escapes. Implement `fixMojibake(s: string): string` in `lib/text.ts` that reinterprets the string's char codes as Latin-1 bytes and decodes as UTF-8 (`TextDecoder`). Required unit test: `fixMojibake("Ù…Ø±Ø­Ø¨Ø§") === "مرحبا"`. Apply to every string field from Instagram files. Must be a no-op on already-clean ASCII/Arabic text (test that too).

### 6.3 WhatsApp parser

- `detect`: a root-level `_chat.txt` (or `*.txt` whose first line matches a pattern below) and no Instagram markers.
- Support both line formats, via two regexes tried in order:
  - iOS: `[1/15/24, 10:32:07 PM] Name: message`
  - Android: `15/01/2024, 22:32 - Name: message`
- Lines not matching either pattern are continuations → append to previous message text with `\n`.
- Strip U+200E/U+200F before matching. `<Media omitted>` / `image omitted` variants → `media` row with `kind` inferred, message `text: null`, `media_ref` set. System lines (no `Name:` segment) → `events` rows (`kind: "system"`).
- Conversation name = chat file name; date parsing must be explicit about day/month order per format (document the assumption in a comment; ambiguous dates like 03/04 follow the format's locale convention).

## 7. Phases — tasks, acceptance criteria, gates

Gate for every phase: `npm run typecheck && npm run test && npm run build` all green (real output pasted) and `PROGRESS.md` updated. Commit or push only when the user explicitly asks.

**Phase 0 — Scaffold & constraints.** Create the Next.js app (TypeScript, Tailwind, App Router), `output: 'export'` + `images.unoptimized`, strict tsconfig, vitest config, scripts: `dev`, `build`, `typecheck` (`tsc --noEmit`), `test`. Add `.cursor/rules/exodus.mdc` with Section 2 verbatim. Copy DuckDB wasm + worker bundles from `node_modules/@duckdb/duckdb-wasm/dist/` into `public/duckdb/` (add an npm `postinstall` or a documented script). Create `PROGRESS.md`, `README.md` stub, MIT `LICENSE`, `.gitignore` including `samples/`. Add deploy headers for both targets — `vercel.json` and `public/_headers` — with:
`Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src blob:; worker-src 'self' blob:; font-src 'self'`
(`'unsafe-inline'` for script is required by Next's static-export bootstrap; `connect-src 'self'` is the load-bearing guarantee — never widen it.) **Accept:** fresh clone → install → gate passes; `npm run build` emits `out/`.

**Phase 1 — Fixture generator.** Implement Section 6.1 exactly, including `manifest.json`. **Accept:** `npm run fixtures` regenerates both ZIPs deterministically (seeded RNG); a vitest opens each ZIP with zip.js and asserts entry counts match the manifest.

**Phase 2 — Zip layer, worker, detection.** `lib/zip.ts` (ZipEntryMap over zip.js `BlobReader`), `workers/ingest.worker.ts` skeleton with Comlink (`new Worker(new URL(...), { type: "module" })`), DuckDB init from `public/duckdb` with DDL from 5.2, `parsers/types.ts` + `registry.ts` with stub `detect`s. Landing page with working dropzone + "Try a synthetic export" button (fetches `/demo-instagram.zip` from public — copy fixture there at build) that both hand a `File` to the worker; progress overlay UI wired to worker callbacks. **Accept:** dropping either fixture logs correct platform detection and streams progress ticks; wrong-platform ZIP shows a friendly "not recognized" error state.

**Phase 3 — Instagram parser.** Section 6.2 + unit tests against the manifest (message counts per thread, media count, sender counts, mojibake cases, pagination across `message_1/2.json`). **Accept:** all manifest assertions pass; `detect` precision test passes (Instagram fixture matches only the Instagram parser).

**Phase 4 — Ingest to DB + first views.** Batched inserts (5.3), `IngestSummary` (row counts, elapsed ms), `lib/db/queries.ts` with named queries: `conversationList`, `messagesPage(conversation, before, limit)`, `counts`. `/dashboard` with sidebar (Messages, Media, Activity, Wrapped, Export) and a virtualized/paginated message reader with `dir="auto"` bubbles. **Accept:** dropping `demo-instagram.zip` on `/` lands on `/dashboard` showing the exact manifest message count in ≤10s on a mid-range laptop; Arabic renders correctly (no mojibake on screen).

**Phase 5 — Search + media + activity.** `search(term)` query using case-insensitive `LIKE` across `messages.text` (grouped by conversation, with snippets); media gallery reading blobs lazily via `readMediaBlob` with an IntersectionObserver and `revokeObjectURL` on unmount; Activity view charting `events` over time (recharts). **Accept:** searching an Arabic word and an English word from the fixture both return the manifest-known hits; scrolling the gallery keeps memory flat (verify in DevTools, note the observation in PROGRESS.md); no revoke leaks (audit the component).

**Phase 6 — Wrapped.** Named queries + a `/wrapped` sequence for: total messages; total media; active date range; top 5 contacts; messages-by-hour histogram (call out the 02:00–04:00 peak as "your 3am era"); busiest single day; top 20 words (tokenizer in `lib/text.ts`: split on whitespace/punctuation, lowercase Latin, filter a committed English + Arabic stopword list, min length 2); first message ever (text, date, conversation); longest daily-activity streak. All numbers formatted with `Intl.NumberFormat`. **Accept:** every stat on the fixture matches values independently computable from `manifest.json` (add tests for word-count and histogram queries at the SQL layer).

**Phase 7 — WhatsApp parser + export-out.** Section 6.3 + tests (both formats, continuations, media-omitted, RTL marks). `exportTable` producing CSV and JSON blobs via DuckDB `COPY ... TO` into a registered virtual file read back as a buffer (confirm the copy/read-back API names in the installed types), wired to an Export view with download buttons. `CONTRIBUTING.md`: "Write a parser in 3 steps" referencing `parsers/types.ts`. **Accept:** WhatsApp fixture ingests with manifest-correct counts; exported CSV of `messages` re-opens in a spreadsheet with correct Arabic (UTF-8 BOM included).

**Phase 8 — Polish, PWA, ship.** Landing per the agreed wireframe (hero, dropzone, synthetic-export button, trust badges) including a live "network requests: N" badge driven by `PerformanceObserver` resource entries; PWA `manifest.webmanifest` + minimal service worker precaching the app shell and `public/duckdb` (skip if it destabilizes anything — note in PROGRESS.md); keyboard focus states and alt text pass; README with screenshots, architecture summary, and one-command run; verify the deployed preview shows zero CSP violations in console and works with Wi-Fi off after load. **Accept:** Lighthouse installable-PWA check passes (or documented skip); full gate; final manual checklist below all ticked.

## 8. Final definition of done

- [ ] Both fixtures ingest with manifest-exact counts; all tests green
- [ ] Wi-Fi off after load: browse, search, media, Wrapped, export all work
- [ ] DevTools Network tab shows zero requests after initial load (except same-origin assets)
- [ ] Arabic text correct everywhere; `dir="auto"` on all user-content elements
- [ ] No `any`, no `@ts-ignore`, no TODOs in committed code
- [ ] Every view has loading/empty/error states; a corrupted ZIP produces a friendly error, not a blank screen
- [ ] `git clone` → `npm i` → `npm run fixtures` → `npm run dev` works on a clean machine
- [ ] Public repo has LICENSE, README, CONTRIBUTING, and honest PROGRESS.md

## 9. Never do

No servers or external requests. No CDN assets. No analytics or telemetry of any kind. No committing anything from `samples/`. No new dependencies without asking. No claiming a gate passed without output. No coding a third platform before Phases 0–8 are done.
