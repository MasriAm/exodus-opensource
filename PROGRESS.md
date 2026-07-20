# Exodus Progress

## Phase 0 — Scaffold & constraints

Status: complete

Built:

- Next.js 15 App Router scaffold with TypeScript, Tailwind CSS, and shadcn/ui.
- Static-export configuration with unoptimized images and strict TypeScript.
- Vitest configuration and Phase 0 constraint tests.
- Same-origin DuckDB WebAssembly asset copy script and npm postinstall hook.
- Persistent architecture rules and restrictive deployment CSP headers.
- Project README, MIT license, and private-sample ignore rule.

Verification:

- A clean `npm ci` completed and the postinstall copied all four DuckDB assets.
- `npm run typecheck` passed.
- `npm run test` passed: 1 test file and 3 tests.
- `npm run build` passed with Next.js 15.5.20.
- `npm run lint` passed.
- The static export was emitted to `out/`.

Pending:

- Phases 1–8 remain unstarted.

Notes:

- `npm audit` reports two moderate findings from the PostCSS version pinned
  inside Next.js 15.5.20 (GHSA-qx2v-qp2m-jg93). npm's suggested force fix
  would replace Next.js with 9.3.3, so it was not applied.

Deviations:

- None.
