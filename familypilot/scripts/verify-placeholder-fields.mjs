/**
 * Add a family by postcode: the two fields are genuinely empty, their examples are muted "e.g." placeholders, and Add family does
 * not submit an example. Also: nothing is stored until the parent has typed their own values. Fixture data, a real browser.
 *
 * Usage: node scripts/verify-placeholder-fields.mjs [baseUrl] [shotDir]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = process.argv[3] ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PROFILE = { id: 'fam-h', parentName: 'Mina Test', members: [{ id: 'p1', name: 'Mina Test', role: 'parent', dateOfBirth: '1990-01-01', dobKnown: true, age: 36 }], homeLocation: 'Camden, London', homeLatitude: 51.5390, homeLongitude: -0.1420, travelCot: null, memberships: [], mustHaveFacilities: [], routines: [] };
let failed = 0;
const check = (ok, name, detail = '') => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` - ${detail}` : ''}`); if (!ok) failed += 1; };
const browser = await chromium.launch({ headless: true, ...(existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {}) });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, hasTouch: true });
const page = await ctx.newPage();
await page.addInitScript(({ f }) => { if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1'); localStorage.setItem('familypilot-family-v1', f); }, { f: JSON.stringify({ state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 }, version: 0 }) });
const stored = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('familypilot-planning-v1') ?? '{}').state?.families ?? []).length; } catch { return 0; } });
await page.goto(`${BASE}/together?view=families`, { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
await page.getByTestId('families-add-postcode').click(); await page.waitForTimeout(500);
const read = () => page.evaluate(() => ['add-family-name', 'add-family-area'].map((id) => { const el = document.querySelector(`[data-testid="${id}"]`); return { value: el.value, placeholder: el.placeholder, text: getComputedStyle(el).color, ph: getComputedStyle(el, '::placeholder').color }; }));
const [name, area] = await read();
check(name.value === '' && area.value === '', 'both fields are empty: nothing is pre-filled', `"${name.value}" / "${area.value}"`);
check(name.placeholder === 'e.g. Hannah' && area.placeholder === 'e.g. NW5 1TL', 'the examples are worded "e.g. …"', `${name.placeholder} / ${area.placeholder}`);
check(name.ph !== name.text && area.ph !== area.text, 'and drawn in a different, muted ink from typed text', `placeholder ${name.ph}, typed ${name.text}`);
const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a) => (1.05) / (lum(a) + 0.05);
check(contrast(name.ph) >= 4.5, 'the muted ink is still readable (4.5:1 on white)', contrast(name.ph).toFixed(2));
if (SHOTS) await page.screenshot({ path: `${SHOTS}/add-family-empty.png` });
// Add family with nothing typed: refused, nothing stored
await page.getByTestId('add-family-save').click(); await page.waitForTimeout(600);
check((await page.getByRole('alert').count()) >= 1 && /first name/i.test(await page.getByRole('alert').first().innerText()), 'Add family with nothing typed asks for a first name');
check((await stored()) === 0, 'and stores nothing');
// A name but no postcode
await page.getByTestId('add-family-name').fill('Sam'); await page.getByTestId('add-family-save').click(); await page.waitForTimeout(600);
check(/postcode or town/i.test(await page.getByRole('alert').first().innerText()), 'a name without a postcode asks for the postcode');
check((await stored()) === 0, 'and still stores nothing');
// Typed values are the ones used, never the examples
await page.getByTestId('add-family-area').fill('NW1 7AA'); await page.getByTestId('add-family-save').click(); await page.waitForTimeout(2500);
const families = await page.evaluate(() => JSON.parse(localStorage.getItem('familypilot-planning-v1') ?? '{}').state?.families ?? []);
check(families.length === 1 && families[0].label === 'Sam', 'the family stored is the one the parent typed, not an example', JSON.stringify(families.map((f) => f.label)));
check(!families.some((f) => /hannah/i.test(f.label) || /NW5 1TL/i.test(f.area)), 'no example value is stored');
await browser.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
