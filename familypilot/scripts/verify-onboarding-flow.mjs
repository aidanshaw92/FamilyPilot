/**
 * Drives the real onboarding, in a browser, for the family shapes the personalisation brief names, and
 * asserts what each parent's answers become: the stored profile, and one tap further, what Venue Detail
 * now says about THAT family. It is the end-to-end proof that every question has a consumer.
 *
 *   - one baby, one toddler, one older child, baby + toddler, toddler + older child, and a mixed family
 *     whose children differ in mobility and routines
 *   - the naps-and-feeds step exists only when a child is young enough to be asked
 *   - drive time and budget are not asked, and keep the defaults every consumer expects
 *   - the date of birth boxes reject an impossible, a future and a too-old date with a specific message
 *   - nothing is stored that the parent did not enter (no invented date of birth, no unasked answers)
 *
 * Fixture only: the home town resolves through the fixture's stubbed /api/planning/location, and the
 * venue is the fixture's "Confirmed Facts Gardens" (recommended ages 2 to 10). No live Google or
 * Overpass call is possible.
 *
 * Usage: node scripts/verify-onboarding-flow.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = {
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
};
const BASE = process.argv[2] ?? 'http://localhost:4173';
const VENUE = 'fp-google-FIXTUREedgeRich';
const NOW = new Date('2026-10-02T09:00:00.000Z');

const KIDS = {
  baby: { kind: 'baby', name: 'Poppy', dob: ['12', '02', '2026'], mobility: ['Buggy', 'Baby carrier'] },
  toddler: { kind: 'toddler', name: 'Theo', dob: ['15', '06', '2024'], mobility: ['Walks', 'Buggy'] },
  older: { kind: 'older', name: 'Mia', dob: ['20', '03', '2018'], mobility: ['Walks'] },
  aid: { kind: 'older', name: 'Ada', dob: ['03', '09', '2019'], mobility: ['Wheelchair or mobility aid'] },
};
/** The chips each kind of child is offered, so the n-th chip with a label can be found by child order. */
const OFFERS = {
  baby: ['Baby carrier', 'Buggy', 'Wheelchair or mobility aid'],
  toddler: ['Walks', 'Buggy', 'Baby carrier', 'Wheelchair or mobility aid'],
  older: ['Walks', 'Buggy', 'Wheelchair or mobility aid'],
};

/** Every switch is turned on in the routines step; a baby's feed defaults to every 4 hours from 07:00. */
const BABY_FEEDS = ['Poppy’s feed@07:00', 'Poppy’s feed@11:00', 'Poppy’s feed@15:00', 'Poppy’s feed@19:00'];

/** What each family must end up with. `lines` are Venue Detail sentences that must appear; `absent` must not. */
const SCENARIOS = [
  {
    name: 'one baby', kids: [KIDS.baby],
    profile: { children: [{ n: 'Poppy', age: 0, am: 7, mob: ['carrier', 'buggy'] }], routines: [...BABY_FEEDS, 'Poppy’s nap@13:00'] },
    lines: ['Recommended from age 2, so Poppy is younger than that'],
    absent: [/Good for|Suits /, /Wheelchair/],
  },
  {
    name: 'one toddler', kids: [KIDS.toddler],
    profile: { children: [{ n: 'Theo', age: 2, am: null, mob: ['walks', 'buggy'] }], routines: ['Theo’s nap@13:00', 'Theo’s meal@12:00'] },
    lines: ['Good for Theo’s age (recommended for ages 2–10)'],
    absent: [/younger than that/, /Wheelchair/],
  },
  {
    name: 'one older child', kids: [KIDS.older],
    profile: { children: [{ n: 'Mia', age: 8, am: null, mob: ['walks'] }], routines: [] },
    lines: ['Good for Mia’s age (recommended for ages 2–10)'],
    absent: [/younger than that|older than that/, /home in time for/, /Wheelchair/],
    noRoutinesStep: true,
  },
  {
    name: 'baby and toddler', kids: [KIDS.baby, KIDS.toddler],
    profile: { children: [{ n: 'Poppy', age: 0, am: 7, mob: ['carrier', 'buggy'] }, { n: 'Theo', age: 2, am: null, mob: ['walks', 'buggy'] }], routines: [...BABY_FEEDS, 'Poppy’s nap@13:00', 'Theo’s nap@13:00', 'Theo’s meal@12:00'] },
    lines: ['Good for Theo’s age (recommended for ages 2–10)', 'Recommended from age 2, so Poppy is younger than that'],
    absent: [/Wheelchair/],
  },
  {
    name: 'toddler and older child', kids: [KIDS.toddler, KIDS.older],
    profile: { children: [{ n: 'Theo', age: 2, am: null, mob: ['walks', 'buggy'] }, { n: 'Mia', age: 8, am: null, mob: ['walks'] }], routines: ['Theo’s nap@13:00', 'Theo’s meal@12:00'] },
    lines: ['Suits Theo and Mia (recommended for ages 2–10)'],
    absent: [/younger than that|older than that/, /Wheelchair/],
  },
  {
    name: 'mixed needs', kids: [KIDS.baby, KIDS.older, KIDS.aid],
    profile: { children: [{ n: 'Poppy', age: 0, am: 7, mob: ['carrier', 'buggy'] }, { n: 'Mia', age: 8, am: null, mob: ['walks'] }, { n: 'Ada', age: 7, am: null, mob: ['mobility-aid'] }], routines: [...BABY_FEEDS, 'Poppy’s nap@13:00'] },
    lines: ['Good for Mia and Ada (recommended for ages 2–10)', 'Recommended from age 2, so Poppy is younger than that', 'Wheelchair and mobility-aid access isn’t confirmed here'],
    absent: [],
  },
];

const failures = [];
const check = (ok, message) => { if (!ok) { failures.push(message); console.log(`  FAIL ${message}`); } };

const browser = await chromium.launch(launchOptions);
const settle = async (page, ms = 900) => { await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(ms); };

async function newPage(width, height = 800) {
  const ctx = await browser.newContext({ viewport: { width, height }, timezoneId: 'Europe/London' });
  await ctx.clock.install({ time: NOW }); await ctx.clock.resume();
  const page = await ctx.newPage();
  return { ctx, page };
}
const next = (page) => page.getByRole('button', { name: /^(continue|see my recommendations)/i }).first();

async function startOnSetup(page) {
  await page.goto(`${BASE}/(onboarding)/setup`, { waitUntil: 'domcontentloaded' });
  await settle(page, 1800);
}
async function parentStep(page) {
  await page.getByPlaceholder('e.g. Sarah').fill('Sam');
  await page.getByPlaceholder('e.g. Mill Hill or NW7 2AB').fill('WD23 1AA');
  await next(page).click();
  await settle(page, 1200);
}
async function typeDob(page, i, dob) {
  await page.getByLabel(/day of birth/i).nth(i).fill(dob[0]);
  await page.getByLabel(/month of birth/i).nth(i).fill(dob[1]);
  await page.getByLabel(/year of birth/i).nth(i).fill(dob[2]);
}

for (const width of [360, 430]) {
  for (const scenario of SCENARIOS) {
    const { kids } = scenario;
    const label = `${width}px ${scenario.name}`;
    console.log(label);
    const { ctx, page } = await newPage(width);
    try {
      await startOnSetup(page);
      await parentStep(page);

      for (let i = 0; i < kids.length; i++) {
        if (i > 0) await page.getByRole('button', { name: /add another child/i }).click();
        await page.getByPlaceholder('e.g. Mia').nth(i).fill(kids[i].name);
        await typeDob(page, i, kids[i].dob);
      }
      await next(page).click();
      await settle(page);

      // Mobility: the options offered depend on the child's age.
      const body0 = await page.evaluate(() => document.body.innerText);
      check(new RegExp(kids.length === 1 ? `How does ${kids[0].name} get around\\?` : 'How does everyone get around\\?').test(body0), `${label}: mobility title names the child (or everyone)`);
      check(/Choose all that apply/.test(body0), `${label}: mobility says "choose all that apply"`);
      const walksOffered = await page.getByRole('button', { name: 'Walks', exact: true }).count();
      check(walksOffered === kids.filter((k) => OFFERS[k.kind].includes('Walks')).length, `${label}: "Walks" is offered only to children old enough to walk`);
      const carrierOffered = await page.getByRole('button', { name: 'Baby carrier', exact: true }).count();
      check(carrierOffered === kids.filter((k) => OFFERS[k.kind].includes('Baby carrier')).length, `${label}: "Baby carrier" is not offered to older children`);
      for (let i = 0; i < kids.length; i++) {
        for (const chip of kids[i].mobility) {
          const idx = kids.slice(0, i).filter((k) => OFFERS[k.kind].includes(chip)).length;
          await page.getByRole('button', { name: chip, exact: true }).nth(idx).click();
        }
      }
      await next(page).click();
      await settle(page);

      if (scenario.noRoutinesStep) {
        // The mobility step was the last one: onboarding is complete.
        check(!/usual days?/i.test(await page.evaluate(() => document.body.innerText)), `${label}: no naps-and-feeds step for an older child`);
      } else {
        const text = await page.evaluate(() => document.body.innerText);
        check(/usual days?/i.test(text), `${label}: naps-and-feeds step is shown`);
        check(/Does \w+ usually nap during the day\?/.test(text), `${label}: nap question names the child`);
        const switches = page.getByRole('switch');
        for (let i = 0; i < await switches.count(); i++) { await switches.nth(i).click(); await page.waitForTimeout(150); }
        await next(page).click();
      }
      await settle(page, 3500);

      const stored = await page.evaluate(() => localStorage.getItem('familypilot-family-v1'));
      const state = JSON.parse(stored).state;
      const p = state.profile;
      check(state.hasCompletedOnboarding === true, `${label}: onboarding completed`);

      const kidsOut = p.members.filter((m) => m.role === 'child');
      check(kidsOut.length === scenario.profile.children.length, `${label}: ${scenario.profile.children.length} child(ren) stored`);
      scenario.profile.children.forEach((want, i) => {
        const got = kidsOut[i];
        check(got?.name === want.n, `${label}: child ${i + 1} is ${want.n}`);
        check(got?.dobKnown === true, `${label}: ${want.n}'s date of birth is marked as entered`);
        check(got?.age === want.age && (got?.ageMonths ?? null) === want.am, `${label}: ${want.n}'s age is derived (${want.age}y, ${want.am}m)`);
        check(JSON.stringify([...(got?.mobility ?? [])].sort()) === JSON.stringify([...want.mob].sort()), `${label}: ${want.n}'s mobility is ${want.mob.join('+')}`);
      });
      const routines = (p.routines ?? []).map((r) => `${r.label}@${r.time}`).sort();
      check(JSON.stringify(routines) === JSON.stringify([...scenario.profile.routines].sort()), `${label}: routines are ${JSON.stringify(scenario.profile.routines)} (got ${JSON.stringify(routines)})`);
      check((p.routines ?? []).every((r) => kidsOut.some((k) => k.id === r.childId)), `${label}: every routine belongs to a child`);
      check(p.maxDriveMinutes === 30 && p.budgetTier === 'moderate', `${label}: drive time and budget keep their defaults (they are not asked)`);
      check(!p.pushchair, `${label}: no pushchair name is invented`);

      await page.goto(`${BASE}/venue/${VENUE}`, { waitUntil: 'domcontentloaded' });
      await settle(page, 2500);
      const venueText = await page.evaluate(() => document.body.innerText);
      for (const line of scenario.lines) check(venueText.includes(line), `${label}: Venue Detail says "${line}"`);
      for (const re of scenario.absent) check(!re.test(venueText), `${label}: Venue Detail does not say ${re}`);
      // Only a family that entered routines must not be asked for them again; an older child has none.
      if (scenario.profile.routines.length > 0) {
        check(!/Add your family.s nap and feed routine in Plans/.test(venueText), `${label}: Venue Detail does not ask for routines the parent just entered`);
      }
    } catch (error) {
      failures.push(`${label}: threw ${error.message.slice(0, 160)}`);
      console.log(`  FAIL threw ${error.message.slice(0, 160)}`);
    }
    await ctx.close();
  }
}

// The date of birth boxes, and the step that will not continue on a bad date.
{
  const { ctx, page } = await newPage(360);
  console.log('date of birth validation');
  try {
    await startOnSetup(page);
    await next(page).click();
    await page.waitForTimeout(400);
    check(/Please enter your first name/.test(await page.evaluate(() => document.body.innerText)), 'parent step asks for a first name');
    await parentStep(page);

    await next(page).click(); await page.waitForTimeout(400);
    check(/Add at least one child|Add a date of birth|Please add a name/.test(await page.evaluate(() => document.body.innerText)), 'an empty children step does not continue');

    await page.getByPlaceholder('e.g. Mia').first().fill('Theo');
    const cases = [
      [['31', '02', '2024'], 'That date doesn’t look right'],
      [['01', '01', '2030'], 'That date is in the future'],
      [['01', '01', '2000'], 'FamilyPilot plans days out for children under 18'],
    ];
    for (const [dob, message] of cases) {
      await typeDob(page, 0, dob);
      await page.waitForTimeout(250);
      check((await page.evaluate(() => document.body.innerText)).includes(message), `${dob.join('/')} says "${message}"`);
      await next(page).click(); await page.waitForTimeout(400);
      check(/Please check the date of birth/.test(await page.evaluate(() => document.body.innerText)), `${dob.join('/')} does not continue`);
    }
    await typeDob(page, 0, ['15', '06', '2024']);
    await page.waitForTimeout(250);
    check((await page.evaluate(() => document.body.innerText)).includes('Theo is 2 years 3 months'), 'a valid date shows the exact age');
  } catch (error) {
    failures.push(`validation: threw ${error.message.slice(0, 160)}`);
  }
  await ctx.close();
}

await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} onboarding check(s) failed:`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('\nonboarding flow: every check passed');
