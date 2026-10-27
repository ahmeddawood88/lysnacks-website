// Removes the solid black background from product photos and saves transparent
// WebP files that the site picks up automatically.
//
//   node scripts/cutout-products.mjs              -> writes src/assets/products/
//   node scripts/cutout-products.mjs <outDir> --preview   (review first)
//
// Input: photos/originals/<image name>.jpg, where <image name> is the product slug
// (or the shared `image` name in products.json). Originals live outside public/ so
// they are never deployed.
//
// How it works: starting from the image border, flood-fill every near-black pixel
// connected to the edge, so dark parts *inside* a product (a black lid) are kept.
// Small specks left on the background are dropped, the mask edge is softened, the
// black fringe is removed from edge pixels, and the result is trimmed, resized and
// saved as WebP with alpha. With --preview it also writes a contact sheet.
//
// Photos on a white/grey background (MANUAL_CUTOUT) cannot be cut automatically:
// their white lids match the background. Cut those by hand (e.g. remove.bg) and save
// the transparent PNG/WebP straight into src/assets/products/<image name>.webp.
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_DIR = 'photos/originals';
const DEFAULT_OUT_DIR = 'src/assets/products';
const DARK_MAX = 28; // max(r, g, b) at or below this is background black
const MIN_PIECE = 0.005; // drop pieces smaller than 0.5% of the largest (keeps loose beans)
const MAX_HEIGHT = 1000; // Astro makes smaller sizes at build time
const MANUAL_CUTOUT = new Set(['ramla-karak-chai', 'ramla-instant-saudi-coffee']);

async function cutout(file) {
  const { data, info } = await sharp(path.join(SOURCE_DIR, file))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const size = width * height;
  const isDark = (i) => Math.max(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]) <= DARK_MAX;

  // 1. Flood fill the background from the border.
  const background = new Uint8Array(size);
  const stack = [];
  const visit = (i) => {
    if (!background[i] && isDark(i)) {
      background[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < size - width) visit(i + width);
  }

  // 2. Drop tiny foreground specks (dust, JPEG noise) but keep loose beans and grains.
  const piece = new Int32Array(size).fill(-1);
  const pieceSizes = [];
  for (let start = 0; start < size; start++) {
    if (background[start] || piece[start] !== -1) continue;
    const id = pieceSizes.length;
    let count = 0;
    piece[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      count++;
      const x = i % width;
      for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i < size - width ? i + width : -1]) {
        if (j >= 0 && !background[j] && piece[j] === -1) {
          piece[j] = id;
          stack.push(j);
        }
      }
    }
    pieceSizes.push(count);
  }
  const largest = Math.max(...pieceSizes);
  for (let i = 0; i < size; i++) {
    if (piece[i] !== -1 && pieceSizes[piece[i]] < largest * MIN_PIECE) background[i] = 1;
  }

  // 3. Soft alpha mask: hard mask, slightly blurred for anti-aliased edges.
  const hard = Buffer.alloc(size);
  for (let i = 0; i < size; i++) hard[i] = background[i] ? 0 : 255;
  // extractChannel keeps the output single-channel (blur can return 3 channels otherwise).
  const alpha = await sharp(hard, { raw: { width, height, channels: 1 } })
    .blur(0.8)
    .extractChannel(0)
    .raw()
    .toBuffer();
  if (alpha.length !== size) throw new Error(`Unexpected mask size for ${file}`);

  // 4. Remove the black fringe: observed = a * color + (1 - a) * black, so color = observed / a.
  const rgba = Buffer.alloc(size * 4);
  for (let i = 0; i < size; i++) {
    const a = alpha[i] / 255;
    for (let c = 0; c < 3; c++) {
      const v = data[i * 3 + c];
      rgba[i * 4 + c] = a > 0 && a < 1 ? Math.min(255, Math.round(v / a)) : v;
    }
    rgba[i * 4 + 3] = alpha[i];
  }

  const trimmed = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .trim({ threshold: 1 })
    .png()
    .toBuffer();
  return sharp(trimmed).resize({ height: MAX_HEIGHT, withoutEnlargement: true });
}

async function contactSheet(outDir, names) {
  const cell = 300;
  const cols = 4;
  const rows = Math.ceil(names.length / cols);
  const composites = await Promise.all(
    names.map(async (name, n) => ({
      input: await sharp(path.join(outDir, `${name}.webp`))
        .resize(cell - 40, cell - 40, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer(),
      left: (n % cols) * cell + 20,
      top: Math.floor(n / cols) * cell + 20,
    })),
  );
  await sharp({
    create: { width: cols * cell, height: rows * cell, channels: 3, background: '#efe4cf' },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outDir, '_contact-sheet.png'));
}

const [outDir = DEFAULT_OUT_DIR, flag] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const done = [];
for (const file of (await readdir(SOURCE_DIR)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()) {
  const name = file.replace(/\.[^.]+$/, '');
  if (MANUAL_CUTOUT.has(name)) {
    console.log(`${file}: skipped, needs a manual cut-out (light background)`);
    continue;
  }
  const image = await cutout(file);
  const out = await image.webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(path.join(outDir, `${name}.webp`));
  console.log(`${file} -> ${name}.webp  ${out.width}x${out.height}  ${Math.round(out.size / 1024)} KB`);
  done.push(name);
}

if (flag === '--preview') {
  await contactSheet(outDir, done);
  console.log(`Contact sheet: ${path.join(outDir, '_contact-sheet.png')}`);
}
