import sharp from "sharp";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, "..", "public");

// Приоритет источника иконки: растр (jpg/png) → SVG.
const rasterCandidates = ["app-icon-source.jpg", "app-icon-source.png"];
const rasterSrc = rasterCandidates
  .map((f) => resolve(publicDir, f))
  .find((f) => existsSync(f));
const srcSvgPath = resolve(publicDir, "pwa-icon-source.svg");
const useRaster = Boolean(rasterSrc);

const targets = [
  { out: "icon-192.png", size: 192 },
  { out: "icon-512.png", size: 512 },
  { out: "icon-512-maskable.png", size: 512, pad: 0.12 },
  { out: "apple-touch-icon.png", size: 180 },
  { out: "favicon-32.png", size: 32 },
  { out: "favicon-16.png", size: 16 },
];

async function makeIcon(size, pad) {
  const inner = Math.round(size * (1 - pad * 2));
  const offset = Math.round((size - inner) / 2);

  let iconBuffer;
  if (useRaster) {
    iconBuffer = await sharp(rasterSrc)
      .resize(inner, inner, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    iconBuffer = await sharp(readFileSync(srcSvgPath), { density: 384 })
      .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: iconBuffer, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function generate() {
  for (const t of targets) {
    const buf = await makeIcon(t.size, t.pad ?? 0);
    await sharp(buf).toFile(resolve(publicDir, t.out));
    console.log(`  ✓ ${t.out}  (${t.size}x${t.size}${t.pad ? `, ${Math.round(t.pad * 100)}% safe area` : ""})`);
  }
}

generate().catch((e) => {
  console.error("Icon generation failed:", e);
  process.exit(1);
});
