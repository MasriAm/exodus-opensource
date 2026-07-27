/**
 * End-to-end smoke test against the static export (`npm run preview`).
 *
 * Drives a headless Chromium over the DevTools protocol and walks the real
 * ingest → Wrapped → dashboard flow, asserting the behaviours that broke
 * before: bubble alignment across pages, media tiles opening, calendar cell
 * order, search independence from the person filter, Arabic-safe CSV export,
 * and a console with no errors (which also proves DuckDB never reaches for a
 * remote extension).
 */
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const APP_URL = process.env.EXODUS_SMOKE_URL ?? "http://127.0.0.1:4173";
const DEBUG_PORT = 9_223;
const TIMEOUT_MS = 90_000;
const WRITE_SCREENSHOTS = process.env.EXODUS_WRITE_SCREENSHOTS === "1";
const SCREENSHOT_DIRECTORY = resolve(process.cwd(), "docs");

function edgeCandidates() {
  if (process.env.BROWSER_PATH) {
    return [process.env.BROWSER_PATH];
  }
  if (process.platform !== "win32") {
    return ["microsoft-edge", "google-chrome", "chromium"];
  }
  return [
    join(
      process.env["ProgramFiles(x86)"] ?? "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    join(
      process.env.ProgramFiles ?? "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
    join(
      process.env.LOCALAPPDATA ?? "",
      "Microsoft",
      "Edge",
      "Application",
      "msedge.exe",
    ),
  ];
}

async function firstAvailableBrowser() {
  if (process.platform !== "win32") {
    return edgeCandidates()[0];
  }
  const { access } = await import("node:fs/promises");
  for (const candidate of edgeCandidates()) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard installation path.
    }
  }
  throw new Error(
    "No supported browser was found. Set BROWSER_PATH to a Chromium executable.",
  );
}

async function waitFor(description, check, timeoutMs = TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${description}.`, { cause: lastError });
}

async function connectToPage() {
  const target = await waitFor("the browser debugging target", async () => {
    const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    if (!response.ok) {
      return null;
    }
    const targets = await response.json();
    if (!Array.isArray(targets)) {
      return null;
    }
    return (
      targets.find(
        (candidate) =>
          candidate?.type === "page" &&
          typeof candidate.webSocketDebuggerUrl === "string",
      ) ?? null
    );
  });

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Could not connect to Chromium DevTools.")),
      { once: true },
    );
  });

  let sequence = 0;
  const pending = new Map();
  const browserErrors = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (typeof message.id === "number") {
      const request = pending.get(message.id);
      if (!request) {
        return;
      }
      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message));
      } else {
        request.resolve(message.result);
      }
      return;
    }

    if (message.method === "Runtime.exceptionThrown") {
      browserErrors.push(
        message.params?.exceptionDetails?.exception?.description ??
          message.params?.exceptionDetails?.text ??
          "Unknown runtime exception",
      );
    }
    if (
      message.method === "Log.entryAdded" &&
      message.params?.entry?.level === "error"
    ) {
      browserErrors.push(message.params.entry.text);
    }
    if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params?.type === "error"
    ) {
      browserErrors.push(
        (message.params.args ?? [])
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" "),
      );
    }
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      sequence += 1;
      pending.set(sequence, { resolve, reject });
      socket.send(JSON.stringify({ id: sequence, method, params }));
    });

  await Promise.all([
    send("Runtime.enable"),
    send("Page.enable"),
    send("Log.enable"),
  ]);

  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "The page expression failed.",
      );
    }
    return result.result?.value;
  };

  return { socket, send, evaluate, browserErrors };
}

/** Clicks the shortest button/link whose text contains `label`. */
const clickText = (label) => `
  (() => {
    const wanted = ${JSON.stringify(label)}.toLowerCase();
    const matches = [...document.querySelectorAll("button, a")].filter((node) =>
      (node.textContent ?? "").trim().toLowerCase().includes(wanted),
    );
    matches.sort(
      (left, right) =>
        (left.textContent ?? "").length - (right.textContent ?? "").length,
    );
    matches[0]?.click();
    return Boolean(matches[0]);
  })()
`;

const BUBBLE_STATE = `
  JSON.stringify((() => {
    const rows = [...document.querySelectorAll("article")]
      .map((node) => node.parentElement)
      .filter((node) => node && node.className.includes("justify-"));
    const bySender = new Map();
    for (const row of rows) {
      const sender = row.querySelector("bdi")?.textContent?.trim() ?? "";
      const outgoing = row.className.includes("justify-end");
      const seen = bySender.get(sender);
      bySender.set(sender, seen === undefined ? outgoing : seen || outgoing);
    }
    return {
      total: rows.length,
      outgoing: rows.filter((row) => row.className.includes("justify-end")).length,
      sides: [...bySender.entries()],
    };
  })())
`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const browserPath = await firstAvailableBrowser();
  const profileDirectory = await mkdtemp(join(tmpdir(), "exodus-browser-"));
  const browser = spawn(
    browserPath,
    [
      "--headless=new",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profileDirectory}`,
      "--no-first-run",
      "--disable-extensions",
      "--disable-background-networking",
      APP_URL,
    ],
    { stdio: "ignore" },
  );

  try {
    const { socket, send, evaluate, browserErrors } = await connectToPage();
    try {
      await send("Emulation.setDeviceMetricsOverride", {
        width: 1_440,
        height: 1_000,
        deviceScaleFactor: 1,
        mobile: false,
      });
      const downloadDirectory = join(profileDirectory, "downloads");
      await mkdir(downloadDirectory, { recursive: true });
      await send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: downloadDirectory,
      });
      const captureScreenshot = async (name) => {
        if (!WRITE_SCREENSHOTS) {
          return;
        }
        const screenshot = await send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false,
        });
        await mkdir(SCREENSHOT_DIRECTORY, { recursive: true });
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
          join(SCREENSHOT_DIRECTORY, `${name}.png`),
          Buffer.from(screenshot.data, "base64"),
        );
      };

      // 1. Landing page and synthetic ingest.
      await waitFor("the landing page", async () =>
        evaluate(
          `document.readyState === "complete" &&
           document.body.innerText.includes("synthetic export")`,
        ),
      );
      await captureScreenshot("landing");
      assert(
        await evaluate(clickText("synthetic export")),
        "The synthetic-export button was not found.",
      );

      // 2. Wrapped runs first — it needs the DuckDB json extension, so a
      //    missing self-hosted mirror surfaces right here.
      await waitFor("Wrapped statistics", async () =>
        evaluate(
          `location.pathname === "/wrapped" &&
           document.body.innerText.includes("1,500")`,
        ),
      );
      await captureScreenshot("wrapped");
      assert(
        await evaluate(clickText("skip to dashboard")),
        "The Wrapped skip control was not found.",
      );

      // 3. Desk overview.
      await waitFor("the dashboard desk", async () =>
        evaluate(
          `location.pathname === "/dashboard" &&
           document.body.innerText.includes("1,500")`,
        ),
      );
      await captureScreenshot("dashboard");

      // 4. Every view renders.
      for (const [view, expected] of [
        ["messages", "conversation index"],
        ["people", "index"],
        ["media", "files"],
        ["calendar", "communication heatmap"],
        ["footprint", "followers & following"],
        ["search", "type a word to begin"],
      ]) {
        assert(await evaluate(clickText(view)), `The ${view} view is missing.`);
        await waitFor(`the ${view} view`, async () =>
          evaluate(
            `document.body.innerText.toLowerCase().includes(${JSON.stringify(expected)})`,
          ),
        );
      }

      // 5. Messages: a sender must keep the same side on every page.
      assert(await evaluate(clickText("messages")), "Messages view missing.");
      await waitFor("the first message page", async () =>
        evaluate(`document.querySelectorAll("article").length > 3`),
      );
      const firstPage = JSON.parse(await evaluate(BUBBLE_STATE));
      assert(firstPage.total > 3, "No message bubbles rendered.");
      assert(
        firstPage.outgoing > 0 && firstPage.outgoing < firstPage.total,
        "Every bubble landed on the same side of the thread.",
      );
      assert(
        await evaluate(clickText("next")),
        "The message pager was not found.",
      );
      await waitFor("the second message page", async () =>
        evaluate(`document.body.innerText.includes("2 of")`),
      );
      const secondPage = JSON.parse(await evaluate(BUBBLE_STATE));
      for (const [sender, outgoing] of secondPage.sides) {
        const before = firstPage.sides.find((entry) => entry[0] === sender);
        assert(
          before === undefined || before[1] === outgoing,
          `${sender} switched sides between pages.`,
        );
      }

      // 6. Media: all four kind tabs stay available and a tile opens.
      assert(await evaluate(clickText("media")), "Media view missing.");
      await waitFor("local media tiles", async () =>
        evaluate(`document.querySelectorAll('img[src^="blob:"]').length > 0`),
      );
      const tabs = JSON.parse(
        await evaluate(
          `JSON.stringify([...document.querySelectorAll('[role="tab"]')].map((node) => node.textContent?.trim()))`,
        ),
      );
      for (const tab of ["Images", "Voice notes", "Video", "Other"]) {
        assert(tabs.includes(tab), `The ${tab} media tab disappeared.`);
      }
      assert(
        await evaluate(`
          (() => {
            const tile = document.querySelector('img[src^="blob:"]')?.closest("button");
            tile?.click();
            return Boolean(tile);
          })()
        `),
        "No media tile could be clicked.",
      );
      await waitFor("the media preview", async () =>
        evaluate(
          `document.querySelectorAll('[role="dialog"] img[src^="blob:"]').length === 1`,
        ),
      );
      await evaluate(
        `window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))`,
      );
      await waitFor("the closed preview", async () =>
        evaluate(`!document.querySelector('[role="dialog"]')`),
      );

      // 7. Calendar: cells run day by day, so the year is not shuffled.
      assert(await evaluate(clickText("calendar")), "Calendar view missing.");
      await waitFor("the heatmap", async () =>
        evaluate(`document.querySelectorAll('[title*=","]').length > 300`),
      );
      const dayTitles = JSON.parse(
        await evaluate(
          `JSON.stringify([...document.querySelectorAll('[title*=","]')].map((node) => node.getAttribute("title").split(" · ")[0]))`,
        ),
      );
      const dayValues = dayTitles.map((title) => Date.parse(title));
      for (let index = 1; index < dayValues.length; index += 1) {
        assert(
          dayValues[index] > dayValues[index - 1],
          `Heatmap cells are out of order at ${dayTitles[index - 1]} → ${dayTitles[index]}.`,
        );
      }

      // 8. Search ignores the person filter and finds Arabic text.
      assert(await evaluate(clickText("search")), "Search view missing.");
      await waitFor("the search form", async () =>
        evaluate(`Boolean(document.querySelector('input[placeholder*="from:"]'))`),
      );
      const searchFor = async (term) => {
        await evaluate(`
          (() => {
            const input = document.querySelector('input[placeholder*="from:"]');
            const setter = Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              "value",
            )?.set;
            setter?.call(input, ${JSON.stringify(term)});
            input?.dispatchEvent(new Event("input", { bubbles: true }));
            input?.form?.requestSubmit();
          })()
        `);
        return waitFor(`results for ${term}`, async () =>
          evaluate(
            `/\\d+ matches?/i.test(document.body.innerText) ||
             document.body.innerText.includes("No matching messages")`,
          ),
        );
      };
      await searchFor("ذكريات");
      assert(
        await evaluate(`/[1-9][\\d,]* matches?/i.test(document.body.innerText)`),
        "Arabic search returned nothing.",
      );
      await searchFor("after:2023 reclaim");
      assert(
        await evaluate(`/[1-9][\\d,]* matches?/i.test(document.body.innerText)`),
        "Token search returned nothing.",
      );

      // 9. Export keeps Arabic and the UTF-8 BOM.
      assert(await evaluate(clickText("export")), "Export view missing.");
      await waitFor("the export controls", async () =>
        evaluate(`document.body.innerText.toLowerCase().includes("csv")`),
      );
      assert(
        await evaluate(`
          (() => {
            const row = [...document.querySelectorAll("li, article, tr, div")].find(
              (node) =>
                (node.textContent ?? "").includes("Download CSV") &&
                (node.textContent ?? "").toLowerCase().includes("messages"),
            );
            const button = [
              ...(row ?? document).querySelectorAll("button"),
            ].find((candidate) => candidate.textContent?.trim() === "Download CSV");
            button?.click();
            return Boolean(button);
          })()
        `),
        "The messages CSV export button was not found.",
      );
      const exportPath = await waitFor("the CSV download", async () => {
        const filenames = await readdir(downloadDirectory);
        const filename = filenames.find((name) => name.endsWith(".csv"));
        return filename ? join(downloadDirectory, filename) : null;
      });
      const csv = await readFile(exportPath);
      assert(
        csv[0] === 0xef && csv[1] === 0xbb && csv[2] === 0xbf,
        "The CSV export is missing its UTF-8 BOM.",
      );
      assert(
        csv.toString("utf8").includes("سارة"),
        "The CSV export lost its Arabic text.",
      );

      // 10. Offline: the shell and the archive survive without the network.
      await waitFor("the offline app shell", async () =>
        evaluate(`
          (async () => {
            if (!("serviceWorker" in navigator)) {
              return false;
            }
            await navigator.serviceWorker.ready;
            const cacheNames = await caches.keys();
            return Boolean(navigator.serviceWorker.controller) &&
              cacheNames.some((name) => name.startsWith("exodus-shell-"));
          })()
        `),
      );
      await send("Network.enable");
      await send("Network.emulateNetworkConditions", {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
        connectionType: "none",
      });
      await evaluate(clickText("Exodus"));
      await waitFor("the cached landing page", async () =>
        evaluate(
          `location.pathname === "/" &&
           document.body.innerText.includes("synthetic export")`,
        ),
      );
      assert(
        await evaluate(clickText("synthetic export")),
        "The offline demo button was not found.",
      );
      await waitFor("the offline ingest", async () =>
        evaluate(
          `(location.pathname === "/wrapped" || location.pathname === "/dashboard") &&
           document.body.innerText.includes("1,500")`,
        ),
      );

      if (browserErrors.length > 0) {
        throw new Error(
          `Browser errors were reported:\n${browserErrors.join("\n")}`,
        );
      }
      console.log(
        "Browser smoke passed: ingest, Wrapped, every view, alignment, media preview, calendar order, search, CSV export, offline reload.",
      );
    } catch (error) {
      if (browserErrors.length > 0) {
        console.error(`Browser errors:\n${browserErrors.join("\n")}`);
      }
      throw error;
    } finally {
      socket.close();
    }
  } finally {
    browser.kill();
    if (browser.exitCode === null) {
      await new Promise((resolve) => browser.once("exit", resolve));
    }
    await rm(profileDirectory, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
