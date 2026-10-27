// Turns product photos into same-size transparent WebP files that the site picks
// up automatically.
//
//   node scripts/cutout-products.mjs              -> writes src/assets/products/
//   node scripts/cutout-products.mjs <outDir> --preview   (review first)
//
// Inputs (<name> is the product slug, or the shared `image` name in products.json):
//   photos/originals/<name>.jpg  black-background photo; the background is removed here
//   photos/cutouts/<name>.png    a cut-out made by hand (transparent background); used
//                                as is, and takes priority over the original
// Both folders live outside public/ so they are never deployed.
//
// Background removal: starting from the image border, flood-fill every near-black
// pixel connected to the edge, so dark parts *inside* a product (a black lid) are
// kept. Small specks are dropped, the mask edge is softened and the black fringe is
// removed from edge pixels.
//
// Same size: every product is trimmed, then placed on an identical 800x1000 canvas
// (the card's 4:5 frame), scaled to fill it with equal margins and standing on the
// same baseline, so products line up across the grid.
//
// Photos on a white/grey background (MANUAL_CUTOUT) cannot be cut automatically:
// their white lids match the background. Cut those by hand (e.g. remove.bg) and save
// the transparent PNG as photos/cutouts/<name>.png, then rerun this script.
import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SOURCE_DIR = 'photos/originals';
const CUTOUT_DIR = 'photos/cutouts';
const DEFAULT_OUT_DIR = 'src/assets/products';
const DARK_MAX = 28; // max(r, g, b) at or below this is background black
const MIN_PIECE = 0.005; // drop pieces smaller than 0.5% of the largest (keeps loose beans)
const CANVAS = { width: 800, height: 1000 }; // same 4:5 shape as the product card
const MARGIN_Y = 0.06; // empty space above and below, as a share of the canvas height
const MARGIN_X = 0.03; // smaller side margin gives wide products (Waferz box) more room
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

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Trims empty space, then centers the product on the shared canvas, bottom-aligned. */
async function toCanvas(transparentImage) {
  const marginY = Math.round(CANVAS.height * MARGIN_Y);
  const marginX = Math.round(CANVAS.width * MARGIN_X);
  const product = await sharp(transparentImage)
    .trim({ threshold: 1 })
    .resize({
      width: CANVAS.width - 2 * marginX,
      height: CANVAS.height - 2 * marginY,
      fit: 'inside',
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  return sharp({
    create: { ...CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([
    {
      input: product.data,
      left: Math.round((CANVAS.width - product.info.width) / 2),
      top: CANVAS.height - marginY - product.info.height,
    },
  ]);
}

/** Preview: each product in a card-shaped sand frame, as it appears on the site. */
async function contactSheet(outDir, names) {
  const card = { width: 240, height: 300 };
  const gap = 20;
  const cols = 4;
  const rows = Math.ceil(names.length / cols);
  const composites = await Promise.all(
    names.map(async (name, n) => ({
      input: await sharp({ create: { ...card, channels: 3, background: '#efe4cf' } })
        .composite([{ input: await sharp(path.join(outDir, `${name}.webp`)).resize(card).png().toBuffer() }])
        .png()
        .toBuffer(),
      left: gap + (n % cols) * (card.width + gap),
      top: gap + Math.floor(n / cols) * (card.height + gap),
    })),
  );
  await sharp({
    create: {
      width: gap + cols * (card.width + gap),
      height: gap + rows * (card.height + gap),
      channels: 3,
      background: '#fbf6ec',
    },
  })
    .composite(composites)
    .png()
    .toFile(path.join(outDir, '_contact-sheet.png'));
}

const imageName = (file) => file.replace(/\.[^.]+$/, '');
const listImages = async (dir) =>
  existsSync(dir) ? (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)) : [];

const [outDir = DEFAULT_OUT_DIR, flag] = process.argv.slice(2);
await mkdir(outDir, { recursive: true });

const manual = new Map((await listImages(CUTOUT_DIR)).map((f) => [imageName(f), f]));
const originals = new Map((await listImages(SOURCE_DIR)).map((f) => [imageName(f), f]));
const names = [...new Set([...originals.keys(), ...manual.keys()])].sort();

const done = [];
for (const name of names) {
  let transparent;
  let source;
  if (manual.has(name)) {
    source = path.join(CUTOUT_DIR, manual.get(name));
    transparent = await sharp(source).ensureAlpha().png().toBuffer();
  } else if (MANUAL_CUTOUT.has(name)) {
    console.log(`${name}: skipped, needs a manual cut-out in ${CUTOUT_DIR}/${name}.png`);
    continue;
  } else {
    source = path.join(SOURCE_DIR, originals.get(name));
    transparent = await cutout(originals.get(name));
  }
  const image = await toCanvas(transparent);
  const out = await image.webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(path.join(outDir, `${name}.webp`));
  console.log(`${source} -> ${name}.webp  ${out.width}x${out.height}  ${Math.round(out.size / 1024)} KB`);
  done.push(name);
}

if (flag === '--preview') {
  await contactSheet(outDir, done);
  console.log(`Contact sheet: ${path.join(outDir, '_contact-sheet.png')}`);
}
