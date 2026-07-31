import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Uint8ArrayWriter, ZipWriter, TextReader } from "@zip.js/zip.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES_DIR = resolve(PROJECT_ROOT, "fixtures");

async function generateFacebookFixture() {
  await mkdir(FIXTURES_DIR, { recursive: true });

  const zipWriter = new ZipWriter(new Uint8ArrayWriter());
  const fixedDate = new Date("2025-01-01T00:00:00.000Z");

  const profileData = {
    profile_v2: [
      {
        name: {
          full_name: "Yousef Demo (Facebook)",
        }
      }
    ]
  };

  const messagesData = {
    participants: [{ name: "Yousef Demo (Facebook)" }, { name: "Sara" }],
    messages: [
      {
        sender_name: "Yousef Demo (Facebook)",
        timestamp_ms: Date.now() - 86400000 * 2,
        content: "Hello from Facebook Wrapped test!",
      },
      {
        sender_name: "Sara",
        timestamp_ms: Date.now() - 86400000,
        content: "Let's see if this parses correctly.",
      }
    ],
    title: "Sara",
    thread_path: "inbox/sara",
  };

  await zipWriter.add(
    "profile_information/profile_information.json",
    new TextReader(JSON.stringify(profileData, null, 2)),
    { lastModDate: fixedDate }
  );

  await zipWriter.add(
    "your_facebook_activity/messages/inbox/sara/message_1.json",
    new TextReader(JSON.stringify(messagesData, null, 2)),
    { lastModDate: fixedDate }
  );

  const zipBytes = await zipWriter.close();
  const outputPath = resolve(FIXTURES_DIR, "demo-facebook.zip");
  
  await writeFile(outputPath, zipBytes);
  console.log(`Generated Facebook fixture at ${outputPath}`);
}

generateFacebookFixture().catch(console.error);
