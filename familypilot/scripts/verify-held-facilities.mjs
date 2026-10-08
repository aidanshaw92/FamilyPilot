/**
 * Playground, accessible toilet and wheelchair access on Venue Detail, in a real browser against the local fixture (zero
 * spend: every provider host is aborted and fails the run).
 *
 * The server already served these three approved facts and no screen drew them: 55 of the 134 London destinations held
 * at least one, and for 13 they were the ONLY confirmed facts, so the page read "Not confirmed yet" for everything. This
 * opens three synthetic venues at three phone widths, for two families:
 *
 *   Playground Only Park      the Diana Memorial Playground case: a playground, no ages stated
 *   Access Facts Museum       an accessible toilet, and the venue's own "not wheelchair accessible"
 *   Confirmed Facts Gardens   everything confirmed (a playground with stated ages)
 *
 * and checks that the confirmed rows are drawn with their honest wording, that "ages not stated" is said where it is
 * true, that wheelchair access is only listed as unknown for a family with a child who uses a wheelchair or mobility
 * aid, that a confirmed "not accessible" reaches that family's Family Fit as a concern, and that nothing overflows.
 *
 * Usage: node scripts/verify-held-facilities.mjs [baseUrl]   (serve first: node scripts/serve-places-fixture.mjs 4174 dist)
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4174';
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const LIVE_PROVIDER = /(^|\.)(googleapis|googleusercontent|google|gstatic|ggpht|overpass-api|openstreetmap|tfl\.gov)\.[a-z.]+$|overpass/i;
const WIDTHS = [360, 393, 430];

const member = (over) => ({ dateOfBirth: '', dobKnown: true, ...over });
const seedFor = (members) => ({
  state: {
    profile: {
      id: 'family-held', parentName: 'Aidan', familyName: 'Shaw',
      members: [member({ id: 'p1', name: 'Aidan', role: 'parent', dateOfBirth: '1990-01-01', age: 36 }), ...members],
      homeLocation: 'Bushey', homeLatitude: 51.643, homeLongitude: -0.36, completionPercent: 80,
      memberships: [], routines: [], mustHaveFacilities: [],
    },
    hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 1,
  },
  version: 0,
});
const FAMILIES = {
  walking: seedFor([member({ id: 'c1', name: 'Sloane', role: 'child', dateOfBirth: '2019-03-01', age: 7, mobility: ['walks'] })]),
  wheelchair: seedFor([member({ id: 'c1', name: 'Quillon', role: 'child', dateOfBirth: '2018-03-01', age: 8, mobility: ['mobility-aid'] })]),
};

const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? `: ${detail}` : ''}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -- ${detail}` : ''}`);
};

const browser = await chromium.launch({ headless: true, ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}) });
const blocked = [];

async function open(family, width, venueId) {
  const context = await browser.newContext({ viewport: { width, height: 860 }, deviceScaleFactor: 2 });
  await context.route('**/*', (route) => {
    const host = new URL(route.request().url()).hostname;
    if (LIVE_PROVIDER.test(host)) { blocked.push(host); return route.abort(); }
    return route.continue().catch(() => {});
  });
  await context.addInitScript((s) => window.localStorage.setItem('familypilot-family-v1', JSON.stringify(s)), FAMILIES[family]);
  const page = await context.newPage();
  await page.goto(`${BASE}/venue/${venueId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="family-essentials"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const essentials = await page.locator('[data-testid="family-essentials"]').first().innerText();
  const body = await page.evaluate(() => document.body.innerText);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  await context.close();
  return { essentials: essentials.replace(/\s+/g, ' '), body: body.replace(/\s+/g, ' '), overflow };
}

for (const width of WIDTHS) {
  const tag = `${width}`;
  const playground = await open('walking', width, 'fp-google-FIXTUREedgePlaygroundOnly');
  check(`${tag} Playground Only Park: the playground row is drawn`, /Playground\s*On site, ages not stated/.test(playground.essentials), playground.essentials);
  check(`${tag} Playground Only Park: no longer "Not confirmed yet" for everything`, !/^Not confirmed yet/.test(playground.essentials), playground.essentials);
  check(`${tag} Playground Only Park: a walking family is not told about wheelchair access`, !/wheelchair/i.test(playground.essentials), playground.essentials);
  check(`${tag} Playground Only Park: the playground is not said to suit Sloane`, !/(Good|Excellent) (fit )?for Sloane/.test(playground.body));
  check(`${tag} Playground Only Park: no sideways scroll`, playground.overflow <= 0, `${playground.overflow}px`);

  const access = await open('walking', width, 'fp-google-FIXTUREedgeAccess');
  check(`${tag} Access Facts Museum: accessible toilet drawn`, /Accessible toilet\s*On site/.test(access.essentials), access.essentials);
  check(`${tag} Access Facts Museum: "not accessible" drawn, never hidden`, /Wheelchair access\s*Not accessible/.test(access.essentials), access.essentials);

  const accessAid = await open('wheelchair', width, 'fp-google-FIXTUREedgeAccess');
  check(`${tag} Access Facts Museum, child with a mobility aid: Family Fit raises it`, /not wheelchair accessible/i.test(accessAid.body), accessAid.body.slice(0, 300));
  check(`${tag} Access Facts Museum, child with a mobility aid: no sideways scroll`, accessAid.overflow <= 0, `${accessAid.overflow}px`);

  const playgroundAid = await open('wheelchair', width, 'fp-google-FIXTUREedgePlaygroundOnly');
  check(`${tag} Playground Only Park, child with a mobility aid: wheelchair access listed as still to confirm`, /wheelchair access/i.test(playgroundAid.essentials), playgroundAid.essentials);

  const rich = await open('walking', width, 'fp-google-FIXTUREedgeRich');
  check(`${tag} Confirmed Facts Gardens: playground with stated ages reads "On site"`, /Playground\s*On site(?!, ages)/.test(rich.essentials), rich.essentials);
}

check('no provider host was contacted', blocked.length === 0, blocked.join(', '));
await browser.close();
console.log(failures.length ? `${failures.length} FAILED` : 'all passed');
process.exit(failures.length ? 1 : 0);
