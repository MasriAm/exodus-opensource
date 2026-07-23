import { describe, expect, it } from "vitest";

import {
  countResourceOrigins,
  isCrossOriginResource,
} from "../lib/network-origin";

describe("network origin classification", () => {
  const page = "http://127.0.0.1:3000/";

  it("treats same-origin assets as local", () => {
    expect(isCrossOriginResource("/_next/static/chunk.js", page)).toBe(false);
    expect(
      isCrossOriginResource("http://127.0.0.1:3000/duckdb/duckdb-mvp.wasm", page),
    ).toBe(false);
    expect(isCrossOriginResource("blob:http://127.0.0.1:3000/abc", page)).toBe(
      false,
    );
  });

  it("treats third-party URLs as external", () => {
    expect(
      isCrossOriginResource("https://cdn.example.com/tracker.js", page),
    ).toBe(true);
    expect(
      isCrossOriginResource("https://fonts.googleapis.com/css", page),
    ).toBe(true);
  });

  it("counts local vs external resources", () => {
    expect(
      countResourceOrigins(
        [
          "http://127.0.0.1:3000/app.js",
          "http://127.0.0.1:3000/app.css",
          "https://evil.example/x.js",
        ],
        page,
      ),
    ).toEqual({ local: 2, external: 1 });
  });
});
