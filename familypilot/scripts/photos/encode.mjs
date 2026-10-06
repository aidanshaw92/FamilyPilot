import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname } from 'node:path';

/**
 * Shared image handling for the photography installers. Uses `sharp`, which is not a dependency of the app: install it
 * for the run with `npm install --no-save sharp`. Nothing here is imported by the app or its tests.
 */
export function loadSharp() {
  const require = createRequire(import.meta.url);
  try {
    return require('sharp');
  } catch {
    console.error('This installer needs sharp: run `npm install --no-save sharp` in familypilot/, then try again.');
    process.exit(2);
  }
}

const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/** The file for `id` in `dir`, trying the accepted extensions, or null. */
export function findSource(dir, id, join) {
  for (const ext of EXTENSIONS) {
    const candidate = join(dir, `${id}${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export const isImageName = (name) => EXTENSIONS.includes(extname(name).toLowerCase());

/**
 * Crops to the target aspect around a focal point (never past the image), resizes to the exact pixel size, strips every
 * metadata block (EXIF, GPS, camera serial, ICC) and writes an sRGB JPEG, lowering quality until it fits the byte budget.
 *
 * Refuses a source smaller than the target: upscaling would pass the pixel check and still look soft.
 */
export async function encodeToSpec(sharp, source, { px, focal = [50, 50], quality, targetBytes, progressive = true, chroma = '4:2:0' }) {
  const [width, height] = px;
  const meta = await sharp(source).rotate().metadata();
  if (!meta.width || !meta.height) throw new Error('not a readable image');
  if (meta.width < width || meta.height < height) {
    throw new Error(`${meta.width}x${meta.height} is smaller than the ${width}x${height} this needs (a little larger is fine, smaller is not)`);
  }
  const targetAspect = width / height;
  let cropW = meta.width;
  let cropH = Math.round(meta.width / targetAspect);
  if (cropH > meta.height) {
    cropH = meta.height;
    cropW = Math.round(meta.height * targetAspect);
  }
  const left = Math.max(0, Math.min(meta.width - cropW, Math.round((focal[0] / 100) * meta.width - cropW / 2)));
  const top = Math.max(0, Math.min(meta.height - cropH, Math.round((focal[1] / 100) * meta.height - cropH / 2)));
  const base = sharp(source).rotate().extract({ left, top, width: cropW, height: cropH }).resize(width, height, { kernel: 'lanczos3' }).toColourspace('srgb');
  let best = null;
  for (let q = quality[0]; q >= quality[1]; q -= 4) {
    const buffer = await base.clone().jpeg({ quality: q, progressive, chromaSubsampling: chroma, mozjpeg: false }).toBuffer();
    best = { buffer, quality: q, source: meta, crop: { left, top, width: cropW, height: cropH } };
    if (buffer.length <= targetBytes) return best;
  }
  return best;
}
