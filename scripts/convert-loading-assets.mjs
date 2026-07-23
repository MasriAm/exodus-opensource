/**
 * Convert loading GIFs in loadinganimations/ to lean animated WebP under public/assets/.
 * Keeps the 1080px GIF originals in-repo; serves ~420px WebP at quality 35.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "loadinganimations");
const OUT_DIR = path.join(ROOT, "public", "assets");
const NAMES = ["dusting", "scroll", "cauldron"];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  let totalBefore = 0;
  let totalAfter = 0;

  for (const name of NAMES) {
    const src = path.join(SRC_DIR, `${name}.gif`);
    const dest = path.join(OUT_DIR, `${name}.webp`);
    if (!fs.existsSync(src)) {
      console.warn(`skip missing ${src}`);
      continue;
    }
    await sharp(src, { animated: true, pages: -1 })
      .resize({
        width: 420,
        height: 420,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 35,
        alphaQuality: 40,
        effort: 6,
        loop: 0,
        smartSubsample: true,
      })
      .toFile(dest);

    const before = fs.statSync(src).size;
    const after = fs.statSync(dest).size;
    totalBefore += before;
    totalAfter += after;
    console.log(
      `${name}: ${Math.round(before / 1024)}KB → ${Math.round(after / 1024)}KB`,
    );
  }

  const captionsSrc = path.join(SRC_DIR, "captions.json");
  const captionsDest = path.join(OUT_DIR, "captions.json");
  if (fs.existsSync(captionsSrc) && fs.statSync(captionsSrc).size > 0) {
    const raw = JSON.parse(fs.readFileSync(captionsSrc, "utf8"));
    for (const name of NAMES) {
      if (raw.loading?.[name]) {
        raw.loading[name].path = `/assets/${name}.webp`;
      }
    }
    fs.writeFileSync(captionsDest, `${JSON.stringify(raw, null, 2)}\n`);
    console.log("wrote public/assets/captions.json with /assets/*.webp paths");
  }

  console.log(
    `TOTAL: ${Math.round(totalBefore / 1024)}KB → ${Math.round(totalAfter / 1024)}KB (${Math.round((100 * totalAfter) / Math.max(1, totalBefore))}%)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
