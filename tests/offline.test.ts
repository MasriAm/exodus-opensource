import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("offline application shell", () => {
  it("declares an installable, same-origin manifest", async () => {
    const rawManifest = await readFile(
      join(process.cwd(), "public", "manifest.webmanifest"),
      "utf8",
    );
    const manifest: unknown = JSON.parse(rawManifest);

    expect(manifest).toMatchObject({
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(rawManifest).not.toMatch(/https?:\/\//);
  });

  it("precaches app routes and local database bundles", async () => {
    const serviceWorker = await readFile(
      join(process.cwd(), "public", "sw.js"),
      "utf8",
    );

    expect(serviceWorker).toContain('"/dashboard"');
    expect(serviceWorker).toContain('"/wrapped"');
    expect(serviceWorker).toContain('"/duckdb/duckdb-mvp.wasm"');
    expect(serviceWorker).toContain(
      "requestUrl.origin !== self.location.origin",
    );
    // Soft nav must bypass the SW; cached HTML for RSC kills the archive session.
    expect(serviceWorker).toContain("isAppRouterFlight");
    expect(serviceWorker).toContain('headers.get("RSC")');
  });
});
