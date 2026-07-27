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
    if (await exists(file)) {
      present += 1;
      continue;
    }
    const url = `https://extensions.duckdb.org/${version}/${platform}/${extension}.duckdb_extension.wasm`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not download ${url}: ${response.status}`);
    }
    await mkdir(directory, { recursive: true });
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    downloaded += 1;
  }
}

console.log(
  `DuckDB ${version} extensions ready (${present} cached, ${downloaded} downloaded).`,
);
