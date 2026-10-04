import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const IMAGES = join(__dirname, '..', '..', 'assets', 'images');

/** Width and height from a PNG's IHDR chunk; no image library needed. */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(join(IMAGES, file));
  expect(buf.subarray(1, 4).toString('ascii'), `${file} is a PNG`).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('brand rasters (rendered from scripts/brand/mark.mjs)', () => {
  it('ships the platform sizes', () => {
    expect(pngSize('icon.png')).toEqual({ width: 1024, height: 1024 });
    expect(pngSize('android-icon-foreground.png')).toEqual({ width: 1024, height: 1024 });
    expect(pngSize('android-icon-background.png')).toEqual({ width: 1024, height: 1024 });
    expect(pngSize('android-icon-monochrome.png')).toEqual({ width: 1024, height: 1024 });
    expect(pngSize('splash-icon.png')).toEqual({ width: 1024, height: 1024 });
    expect(pngSize('favicon.png')).toEqual({ width: 48, height: 48 });
  });

  it('keeps the app config on the brand colours', () => {
    const config = JSON.parse(readFileSync(join(__dirname, '..', '..', 'app.json'), 'utf8'));
    expect(config.expo.android.adaptiveIcon.backgroundColor).toBe('#0F4A3E');
    const splash = config.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    expect(splash[1].backgroundColor).toBe('#FBFAF7');
  });
});
