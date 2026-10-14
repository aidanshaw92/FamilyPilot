import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What a parent waits for before the first screen, held by tests because it was bought back once and is easy to give away again:
 *
 *   - the first render waited for six Inter font files (about 2 MB) before any component mounted, so even the request for places could not start
 *   - nothing draws with two of those six weights
 *   - hashed assets were revalidated on every visit
 */
const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
}

describe('fonts', () => {
  const families = (text: string) => [...text.matchAll(/Inter_\d{3}[A-Za-z]+/g)].map((m) => m[0]);

  it('loads the four weights a parent sees, on every platform, and no others', () => {
    const native = new Set(families(read('src/design-system/fonts.ts').split('export const fontSources')[1].split('\n')[0]));
    const web = new Set(families(read('src/design-system/fonts.web.ts').split('export const fontSources')[1]));
    expect([...native].sort()).toEqual(['Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold']);
    expect([...web].sort()).toEqual([...native].sort());
  });

  it('draws with no weight it does not load', () => {
    const loaded = new Set(['Inter_400Regular', 'Inter_500Medium', 'Inter_600SemiBold', 'Inter_700Bold']);
    const used = new Map<string, string[]>();
    for (const file of [...sourceFiles('src'), ...sourceFiles('app')]) {
      if (file.endsWith('fonts.ts') || file.endsWith('fonts.web.ts')) continue;
      for (const family of families(read(file))) used.set(family, [...(used.get(family) ?? []), file]);
    }
    // the type tokens name the two heavy weights; nothing else may
    for (const [family, files] of used) {
      if (loaded.has(family)) continue;
      expect(files, `${family} is drawn with but not loaded`).toEqual(['src/design-system/tokens/typography.ts']);
    }
    const typography = read('src/design-system/tokens/typography.ts');
    const tokenUse = typography.replace(/export const fontFamily = \{[\s\S]*?\} as const;/, '');
    expect(tokenUse).not.toMatch(/fontFamily\.(extraBold|black)/);
    for (const file of [...sourceFiles('src'), ...sourceFiles('app')]) {
      if (file.endsWith('tokens/typography.ts')) continue;
      expect(read(file), file).not.toMatch(/fontFamily\.(extraBold|black)\b/);
    }
  });

  it('keeps the web fonts small, and the layout from waiting for them on the web', () => {
    const dir = 'assets/fonts/web';
    const files = readdirSync(join(root, dir)).filter((f) => f.endsWith('.woff2'));
    expect(files).toHaveLength(4);
    for (const f of files) expect(statSync(join(root, dir, f)).size, f).toBeLessThan(40 * 1024);
    expect(read('src/design-system/fonts.web.ts')).toMatch(/blocksFirstRender = false/);
    expect(read('src/design-system/fonts.ts')).toMatch(/blocksFirstRender = true/);
    const layout = read('app/_layout.tsx');
    expect(layout).toMatch(/!loaded && blocksFirstRender/);
    expect(layout).not.toMatch(/Inter_800ExtraBold|Inter_900Black/);
    expect(existsSync(join(root, dir, 'README.md'))).toBe(true);
  });
});

describe('caching', () => {
  const config = JSON.parse(readFileSync(join(root, '..', 'vercel.json'), 'utf8')) as { headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };

  it('caches hashed build output for a year and nothing else', () => {
    const rules = config.headers ?? [];
    expect(rules.map((r) => r.source).sort()).toEqual(['/_expo/static/(.*)', '/assets/(.*)']);
    for (const rule of rules) expect(rule.headers).toEqual([{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]);
  });

  it('only for files whose names carry a content hash (so a changed file is a new URL)', () => {
    const dist = join(root, 'dist');
    if (!existsSync(dist)) return; // needs a build: the CI job runs it
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
    const files = [...walk(join(dist, '_expo/static')), ...walk(join(dist, 'assets'))];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(f, 'an unhashed file under an immutable path').toMatch(/[.-][0-9a-f]{32}\.[A-Za-z0-9]+$/);
  });
});
