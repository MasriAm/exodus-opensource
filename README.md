# Exodus

Exodus is a local-first, zero-knowledge web app for privately exploring Big
Tech data exports. Archive processing and analysis run entirely in the browser;
uploaded data never leaves the device.

This repository currently contains the Phase 0 application scaffold and its
privacy constraints. Data ingestion is implemented in later phases described
in `SPEC.md`.

## Development

```sh
npm install
npm run dev
```

`npm install` copies the DuckDB WebAssembly and browser worker bundles into
`public/duckdb` so they are served from the same origin.

Run the full quality gate with:

```sh
npm run typecheck
npm run test
npm run build
```

The production build is a static export written to `out/`.

## License

MIT
