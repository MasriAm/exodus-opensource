import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

const contentSecurityPolicy =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:; media-src blob:; worker-src 'self' blob:; font-src 'self'";

describe("Phase 0 constraints", () => {
  it("builds as a static export with unoptimized images", () => {
    expect(nextConfig.output).toBe("export");
    expect(nextConfig.images?.unoptimized).toBe(true);
  });

  it("keeps the restrictive CSP in both deployment configurations", async () => {
    const deploymentFiles = ["vercel.json", join("public", "_headers")];
    const contents = await Promise.all(
      deploymentFiles.map((file) =>
        readFile(join(process.cwd(), file), { encoding: "utf8" }),
      ),
    );

    for (const content of contents) {
      expect(content).toContain(contentSecurityPolicy);
    }
  });

  it("has the local DuckDB browser bundles", async () => {
    const assets = [
      "duckdb-mvp.wasm",
      "duckdb-eh.wasm",
      "duckdb-browser-mvp.worker.js",
      "duckdb-browser-eh.worker.js",
    ];

    await Promise.all(
      assets.map((asset) =>
        access(join(process.cwd(), "public", "duckdb", asset)),
      ),
    );
  });
});
