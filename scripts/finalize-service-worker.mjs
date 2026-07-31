import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = resolve(projectRoot, "out");
const serviceWorkerPath = resolve(outputDirectory, "sw.js");

async function outputFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await outputFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files;
}

function browserPath(filePath) {
  return relative(outputDirectory, filePath).split(sep).join("/");
}

function routeUrls(relativePath) {
  const encodedPath = `/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
  const urls = [encodedPath];

  if (relativePath === "index.html") {
    urls.push("/");
  } else if (relativePath.endsWith(".html")) {
    const route = `/${relativePath.slice(0, -".html".length)}`;
    urls.push(route, `${route}/`);
  }
  return urls;
}

const files = (await outputFiles(outputDirectory)).filter((filePath) => {
  const path = browserPath(filePath);
  // Skip flight/RSC payloads (*.txt) — caching them breaks soft navigation.
  return path !== "sw.js" && path !== "_headers" && !path.endsWith(".txt");
});
const descriptors = await Promise.all(
  files.map(async (filePath) => ({
    path: browserPath(filePath),
    size: (await stat(filePath)).size,
  })),
);
descriptors.sort((left, right) => left.path.localeCompare(right.path, "en"));

const urls = [
  ...new Set(descriptors.flatMap(({ path }) => routeUrls(path))),
].sort((left, right) => left.localeCompare(right, "en"));
const buildHash = createHash("sha256")
  .update(JSON.stringify(descriptors))
  .digest("hex")
  .slice(0, 12);

const source = await readFile(serviceWorkerPath, "utf8");
const withManifest = source.replace(
  /\/\* PRECACHE_START \*\/[\s\S]*?\/\* PRECACHE_END \*\//,
  `/* PRECACHE_START */\n${urls
    .map((url) => `  ${JSON.stringify(url)},`)
    .join("\n")}\n  /* PRECACHE_END */`,
);
const finalized = withManifest.replaceAll("__BUILD_HASH__", buildHash);

if (finalized === source || finalized.includes("__BUILD_HASH__")) {
  throw new Error("The service-worker precache markers could not be finalized.");
}

await writeFile(serviceWorkerPath, finalized, "utf8");
console.log(
  `Finalized service worker ${buildHash} with ${urls.length} local assets.`,
);
