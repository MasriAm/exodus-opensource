import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = join(
  projectRoot,
  "node_modules",
  "@duckdb",
  "duckdb-wasm",
  "dist",
);
const destinationDirectory = join(projectRoot, "public", "duckdb");
const assets = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];

await mkdir(destinationDirectory, { recursive: true });
await Promise.all(
  assets.map((asset) =>
    copyFile(join(sourceDirectory, asset), join(destinationDirectory, asset)),
  ),
);

console.log(`Copied ${assets.length} DuckDB browser assets to public/duckdb.`);
