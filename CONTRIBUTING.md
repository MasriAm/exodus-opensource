# Contributing to Exodus

Exodus is intentionally small, client-side, and privacy constrained. A change
must not add a server, telemetry, external network request, CDN asset, or move
archive parsing or SQL onto the main browser thread.

## Local checks

```sh
npm install
npm run fixtures
npm run typecheck
npm run test
npm run build
```

Never add a real data export to the repository. Put private samples in
`samples/`, which is ignored, and reduce discoveries to synthetic fixture data
before sharing them.

## Write a parser in 3 steps

1. **Implement the contract.** Add `parsers/<platform>/index.ts` and implement
   `DataParser` from `parsers/types.ts`. Detection must use archive paths (or a
   minimal text signature), and parsing must read only through `ZipEntryMap`.
2. **Normalize and validate.** Emit batches of at most 2,000 `NormalizedRow`
   values from `lib/schema.ts`. Validate every row with the zod schemas before
   it crosses the parser boundary. Parsers must not import React, DuckDB, or DOM
   APIs.
3. **Register and prove it.** Add the parser to `parsers/registry.ts`, generate a
   deterministic synthetic export, and test detection precision, row totals,
   pagination, malformed input, and platform-specific text encoding.

All SQL belongs in `lib/db/`. User-authored text must render with `dir="auto"`,
and Instagram strings must pass through the mojibake repair helper.
