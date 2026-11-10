/**
 * Build the favicon and PWA icons from src/assets/logo.svg, the single source for the logo.
 * Replace that file and run `pnpm --filter @kaamwala/web icons` (the build also runs this).
 */
import { readFile, copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const source = resolve(root, "src/assets/logo.svg");
const out = resolve(root, "public/icons");

// sharp is already installed for the API, so the web app needs no extra dependency.
const sharp = createRequire(resolve(root, "../api/package.json"))("sharp");

const PAPER = "#FAF7F0";
const svg = await readFile(source);
await mkdir(out, { recursive: true });
await copyFile(source, resolve(out, "icon.svg"));

const render = (size) => sharp(svg, { density: 900 }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png();

await render(32).toFile(resolve(out, "favicon-32.png"));
await render(180).toFile(resolve(out, "apple-touch-icon.png"));
await render(192).toFile(resolve(out, "icon-192.png"));
await render(512).toFile(resolve(out, "icon-512.png"));

// Maskable icons need the logo inside the central safe zone.
const inner = await render(368).toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: PAPER } })
  .composite([{ input: inner, gravity: "center" }])
  .png()
  .toFile(resolve(out, "icon-maskable-512.png"));

console.log("Icons generated from src/assets/logo.svg");
