import { expect, test } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = resolve(process.cwd(), '../api');

test('deployable API files stay within the function budget and export handlers', () => {
  const entries = readdirSync(api, { recursive: true })
    .map(String).filter((file) => /\.[cm]?[jt]s$/.test(file));
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.length).toBeLessThanOrEqual(12);
  for (const entry of entries) {
    expect(typeof require(resolve(api, entry)), entry).toBe('function');
  }
});
