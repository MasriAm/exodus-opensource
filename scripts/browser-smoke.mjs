import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const APP_URL = process.env.EXODUS_SMOKE_URL ?? "http://localhost:4173";
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
          result.exceptionDetails.text,
      );
    }
    return result.result?.value;
  };

  return { socket, send, evaluate, browserErrors };
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
        await writeFile(
          join(SCREENSHOT_DIRECTORY, `${name}.png`),
          Buffer.from(screenshot.data, "base64"),
        );
      };

      await waitFor("the landing page", async () =>
        evaluate(
          `document.readyState === "complete" &&
           document.body.innerText.includes("Try synthetic export")`,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 700));
      await captureScreenshot("landing");

      const clickedDemo = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.includes("Try synthetic export"),
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!clickedDemo) {
        throw new Error("The synthetic-export button was not found.");
      }

      await waitFor("Instagram ingest and dashboard navigation", async () =>
        evaluate(
          `location.pathname === "/dashboard" &&
           document.body.innerText.includes("1,500 messages")`,
        ),
      );
      await waitFor("the first conversation page", async () =>
        evaluate(`document.body.innerText.includes("Load earlier messages")`),
      );
      await captureScreenshot("dashboard");

      const openedSearch = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Search",
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!openedSearch) {
        throw new Error("The dashboard Search view was not found.");
      }

      await waitFor("the search form", async () =>
        evaluate(`Boolean(document.querySelector('input[type="search"], input[placeholder*="Search"]'))`),
      );
      await evaluate(`
        (() => {
          const input = document.querySelector('input[type="search"], input[placeholder*="Search"]');
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(input, "ذكريات");
          input?.dispatchEvent(new Event("input", { bubbles: true }));
          input?.form?.requestSubmit();
        })()
      `);
      await waitFor("Arabic search results", async () =>
        evaluate(`document.body.innerText.includes("267 matches")`),
      );
      await evaluate(`
        (() => {
          const input = document.querySelector('input[type="search"], input[placeholder*="Search"]');
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          )?.set;
          setter?.call(input, "reclaim");
          input?.dispatchEvent(new Event("input", { bubbles: true }));
          input?.form?.requestSubmit();
        })()
      `);
      await waitFor("English search results", async () =>
        evaluate(`document.body.innerText.includes("180 matches")`),
      );

      await evaluate(`
        (() => {
          const originalRevoke = URL.revokeObjectURL.bind(URL);
          window.__exodusRevokedObjectUrls = 0;
          URL.revokeObjectURL = (url) => {
            window.__exodusRevokedObjectUrls += 1;
            originalRevoke(url);
          };
        })()
      `);
      const openedMedia = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Media",
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!openedMedia) {
        throw new Error("The dashboard Media view was not found.");
      }
      await waitFor("lazy local media", async () =>
        evaluate(
          `document.body.innerText.includes("Media gallery") &&
           Boolean(document.querySelector('img[src^="blob:"]'))`,
        ),
      );
      await evaluate(`window.scrollTo(0, document.body.scrollHeight)`);
      await waitFor("offscreen media URL revocation", async () =>
        evaluate(`window.__exodusRevokedObjectUrls > 0`),
      );
      await evaluate(`window.scrollTo(0, 0)`);

      const openedActivity = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Activity",
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!openedActivity) {
        throw new Error("The dashboard Activity view was not found.");
      }
      await waitFor("the activity chart", async () =>
        evaluate(
          `document.body.innerText.includes("Account activity") &&
           Boolean(document.querySelector("svg"))`,
        ),
      );

      const openedExport = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Export",
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!openedExport) {
        throw new Error("The dashboard Export view was not found.");
      }
      await waitFor("the export controls", async () =>
        evaluate(`document.body.innerText.includes("Take back a clean copy")`),
      );
      const startedExport = await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("article button")].find(
            (candidate) => candidate.textContent?.trim() === "CSV",
          );
          button?.click();
          return Boolean(button);
        })()
      `);
      if (!startedExport) {
        throw new Error("The messages CSV export button was not found.");
      }
      const exportPath = await waitFor("the UTF-8 CSV download", async () => {
        const filenames = await readdir(downloadDirectory);
        const filename = filenames.find((name) => name.endsWith(".csv"));
        return filename ? join(downloadDirectory, filename) : null;
      });
      const csv = await readFile(exportPath);
      if (csv[0] !== 0xef || csv[1] !== 0xbb || csv[2] !== 0xbf) {
        throw new Error("The messages CSV is missing its UTF-8 BOM.");
      }
      if (!csv.toString("utf8").includes("عمر")) {
        throw new Error("The messages CSV did not preserve Arabic text.");
      }

      const openedWrapped = await evaluate(`
        (() => {
          const link = document.querySelector('a[href="/wrapped"]');
          link?.click();
          return Boolean(link);
        })()
      `);
      if (!openedWrapped) {
        throw new Error("The Wrapped navigation link was not found.");
      }
      await waitFor("Wrapped statistics", async () =>
        evaluate(
          `location.pathname === "/wrapped" &&
           document.body.innerText.includes("1,500 messages. One story.") &&
           document.body.innerText.includes("462") &&
           document.body.innerText.includes("731") &&
           document.body.innerText.includes("family_group")`,
        ),
      );
      await captureScreenshot("wrapped");

      const returnedHome = await evaluate(`
        (() => {
          const link = document.querySelector('a[aria-label="Exodus home"]');
          link?.click();
          return Boolean(link);
        })()
      `);
      if (!returnedHome) {
        throw new Error("The Exodus home link was not found.");
      }
      await waitFor("the landing page after Wrapped", async () =>
        evaluate(
          `location.pathname === "/" &&
           Boolean(document.querySelector('input[type="file"]'))`,
        ),
      );
      await evaluate(`
        (async () => {
          const response = await fetch("/demo-whatsapp.zip");
          if (!response.ok) {
            throw new Error("WhatsApp demo fetch failed");
          }
          const file = new File(
            [await response.blob()],
            "demo-whatsapp.zip",
            { type: "application/zip" },
          );
          const transfer = new DataTransfer();
          transfer.items.add(file);
          const input = document.querySelector('input[type="file"]');
          Object.defineProperty(input, "files", {
            configurable: true,
            value: transfer.files,
          });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        })()
      `);
      await waitFor("WhatsApp ingest and archive replacement", async () =>
        evaluate(
          `location.pathname === "/dashboard" &&
           document.body.innerText.includes("6 messages")`,
        ),
      );
      await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Media",
          );
          button?.click();
        })()
      `);
      await waitFor("WhatsApp omitted-media placeholders", async () =>
        evaluate(
          `document.body.innerText.match(
             /Media was omitted from the WhatsApp export\\./g,
           )?.length === 2`,
        ),
      );

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

      await evaluate(`
        (() => {
          const link = document.querySelector('a[aria-label="Exodus home"]');
          link?.click();
        })()
      `);
      await waitFor("the cached landing page", async () =>
        evaluate(
          `location.pathname === "/" &&
           document.body.innerText.includes("Try synthetic export")`,
        ),
      );
      await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.includes("Try synthetic export"),
          );
          button?.click();
        })()
      `);
      await waitFor("offline cached Instagram ingest", async () =>
        evaluate(
          `location.pathname === "/dashboard" &&
           document.body.innerText.includes("1,500 messages")`,
        ),
      );
      await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "Export",
          );
          button?.click();
        })()
      `);
      await waitFor("offline export controls", async () =>
        evaluate(`document.body.innerText.includes("Take back a clean copy")`),
      );
      await evaluate(`
        (() => {
          const button = [...document.querySelectorAll("article button")].find(
            (candidate) => candidate.textContent?.trim() === "JSON",
          );
          button?.click();
        })()
      `);
      const jsonExportPath = await waitFor("the offline JSON download", async () => {
        const filenames = await readdir(downloadDirectory);
        const filename = filenames.find((name) => name.endsWith(".json"));
        return filename ? join(downloadDirectory, filename) : null;
      });
      const jsonExport = JSON.parse(await readFile(jsonExportPath, "utf8"));
      if (
        !Array.isArray(jsonExport) ||
        jsonExport.length !== 1_500 ||
        !JSON.stringify(jsonExport).includes("عمر")
      ) {
        throw new Error("The offline JSON export did not preserve all messages.");
      }
      await evaluate(`
        (() => {
          const link = document.querySelector('a[href="/wrapped"]');
          link?.click();
        })()
      `);
      await waitFor("offline Wrapped statistics", async () =>
        evaluate(
          `location.pathname === "/wrapped" &&
           document.body.innerText.includes("1,500 messages. One story.")`,
        ),
      );

      if (browserErrors.length > 0) {
        throw new Error(
          `Browser errors were reported:\n${browserErrors.join("\n")}`,
        );
      }
      console.log(
        "Browser smoke passed: both ingests, search, media, exports, Wrapped, PNG, and offline mode.",
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
