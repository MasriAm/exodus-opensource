/**
 * Mirrors the DuckDB `json` extension into `public/duckdb/extensions` so the
 * browser never talks to extensions.duckdb.org (CSP `connect-src 'self'`).
 *
 * The files are committed, so this only downloads when something is missing.
 * The DuckDB version is read from the wasm build itself, keeping the mirrored
 * path in sync with whatever the runtime will request.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NODE_RUNTIME,
  VoidLogger,
  createDuckDB,
} from "@duckdb/duckdb-wasm/blocking";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distribution = join(
  projectRoot,
  "node_modules",
  "@duckdb",
  "duckdb-wasm",
  "dist",
);
const destinationRoot = join(projectRoot, "public", "duckdb", "extensions");
const PLATFORMS = ["wasm_eh", "wasm_mvp"];
const EXTENSIONS = ["json"];

async function duckdbVersion() {
  const bundles = {
    mvp: {
      mainModule: join(distribution, "duckdb-mvp.wasm"),
      mainWorker: join(distribution, "duckdb-browser-mvp.worker.js"),
    },
    eh: {
      mainModule: join(distribution, "duckdb-eh.wasm"),
      mainWorker: join(distribution, "duckdb-browser-eh.worker.js"),
    },
  };
  const database = await createDuckDB(bundles, new VoidLogger(), NODE_RUNTIME);
  await database.instantiate();
  database.open({});
  const connection = database.connect();
  try {
    const rows = connection.query("SELECT version() AS version").toArray();
    return String(rows[0]?.version ?? "");
  } finally {
    connection.close();
    database.reset();
  }
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Real extension WASM is hundreds of KB; tiny stubs are treated as missing. */
async function usableExtension(path) {
  if (!(await exists(path))) {
    return false;
  }
  const { stat } = await import("node:fs/promises");
  const info = await stat(path);
  return info.size > 50_000;
}

const version = await duckdbVersion();
if (!version.startsWith("v")) {
  throw new Error(`Unexpected DuckDB version string: ${version}`);
}

let downloaded = 0;
let present = 0;
for (const platform of PLATFORMS) {
  for (const extension of EXTENSIONS) {
    const directory = join(destinationRoot, version, platform);
    const file = join(directory, `${extension}.duckdb_extension.wasm`);
    if (await usableExtension(file)) {
      present += 1;
      continue;
    }
    const url = `https://extensions.duckdb.org/${version}/${platform}/${extension}.duckdb_extension.wasm`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not download ${url}: ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength < 50_000) {
      throw new Error(
        `Downloaded ${url} looks truncated (${bytes.byteLength} bytes).`,
      );
    }
    await mkdir(directory, { recursive: true });
    await writeFile(file, bytes);
    downloaded += 1;
  }
}

console.log(
  `DuckDB ${version} extensions ready (${present} cached, ${downloaded} downloaded).`,
);
