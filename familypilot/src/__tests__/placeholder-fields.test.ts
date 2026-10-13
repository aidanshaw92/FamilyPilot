import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * An example in a form field must never read as something the parent already entered. "Hannah" and "NW5 1TL" in the Add a family
 * by postcode form looked like values on a real iPhone. The rule: an example is drawn in the muted placeholder ink and is worded
 * "e.g. …"; a format hint ("YYYY-MM-DD") or an instruction ("Search saved places") is not an example of an answer and may stand.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? files(rel) : /\.tsx$/.test(name) ? [rel] : [];
  });
}

/** Not examples of an answer: formats, instructions and the internal tools' vocabularies. */
const NOT_AN_EXAMPLE = new Set(['YYYY-MM-DD', 'HH:MM', 'DD', 'MM', 'YYYY', 'Optional', 'Not set', 'Choose a date', 'Choose a time', 'Search saved places', 'Area or postcode', 'Search places, or try “soft play”', 'What felt confusing or broken?', 'Anything else you\'d like us to know', 'Admin token', 'Lat', 'Lng', 'km']);

describe('example text in form fields', () => {
  it('the shared Field draws its placeholder in the muted ink, so it reads as an example', () => {
    expect(read('src/components/ui/Field.tsx')).toContain('placeholderTextColor={colors.text.tertiary}');
    expect(read('src/components/profile/TextField.tsx')).toContain('placeholderTextColor={colors.text.tertiary}');
  });

  it('every placeholder in the app is worded "e.g. …", or is a format hint or instruction (never a bare name, postcode or age)', () => {
    const bad: string[] = [];
    for (const file of [...files('app'), ...files('src')]) {
      if (file.startsWith('app/internal') || file.includes('__tests__')) continue;
      for (const m of read(file).matchAll(/placeholder="([^"]*)"/g)) {
        const text = m[1];
        if (text.startsWith('e.g. ') || NOT_AN_EXAMPLE.has(text) || text.includes('/')) continue;
        bad.push(`${file}: "${text}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('Add a family by postcode starts empty and refuses to submit without the parent’s own values', () => {
    const form = read('src/components/planning/AddFamilyByPostcode.tsx');
    expect(form).toContain("useState('')");
    expect(form).toContain('placeholder="e.g. Hannah"');
    expect(form).toContain('placeholder="e.g. NW5 1TL"');
    // The checks run on what was typed, before anything is looked up or stored.
    expect(form.indexOf("if (!label) {")).toBeLessThan(form.indexOf('locateArea('));
    expect(form.indexOf("if (!area.trim()) {")).toBeLessThan(form.indexOf('setFamily(family)'));
    expect(form).not.toMatch(/useState\('(Hannah|NW5 1TL)'\)/);
  });
});
