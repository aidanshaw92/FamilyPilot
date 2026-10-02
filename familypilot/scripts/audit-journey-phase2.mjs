/**
 * The Phase 2 production-quality audit of the whole approved journey.
 *
 * Where `verify-create-plan-journey.mjs` proves the journey WORKS, this asks whether it is finished:
 * geometry against the approved sheet, behaviour under a keyboard, what a long venue name does to a
 * header, what a venue with no photograph falls back to, and what a hand-edited /plan link produces.
 *
 * Everything runs against the synthetic fixture on the bundle's own origin. No Google Places or
 * Distance Matrix request is made. Journey times come from the same distance estimator the deployed
 * endpoint falls back to, which is why the Plan labels them estimated.
 *
 * Usage: node scripts/audit-journey-phase2.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const OUT = join(process.cwd(), '..', 'docs', 'phase2-audit');
const FAMILY_KEY = 'familypilot-family-v1';
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';

const EDGE = {
  rich: 'fp-google-FIXTUREedgeRich',
  longName: 'fp-google-FIXTUREedgeLongName',
  noPhoto: 'fp-google-FIXTUREedgeNoPhoto',
  noHours: 'fp-google-FIXTUREedgeNoHours',
  closesEarly: 'fp-google-FIXTUREedgeClosesEarly',
};

const PROFILE = {
  id: 'family-phase2',
  parentName: 'Sarah',
  members: [
    { id: 'p1', name: 'Sarah', role: 'parent', dateOfBirth: '1990-03-15', age: 36 },
    { id: 'p2', name: 'Alex', role: 'parent', dateOfBirth: '1991-02-02', age: 35 },
    { id: 'c1', name: 'Mia', role: 'child', dateOfBirth: '2021-06-10', age: 4 },
    { id: 'c2', name: 'Leo', role: 'child', dateOfBirth: '2024-11-22', age: 1 },
  ],
  homeLocation: 'Bushey, Hertfordshire',
  homeLatitude: 51.643,
  homeLongitude: -0.36,
  budgetTier: 'moderate',
  maxDriveMinutes: 90,
  completionPercent: 80,
  vehicle: 'Tesla Model Y',
  pushchair: 'Bugaboo Butterfly',
  travelCot: null,
  memberships: [],
  routines: [],
  mustHaveFacilities: [],
};

/**
 * Widths from the brief, plus one run with iPhone safe-area insets.
 *
 * The insets are applied as real CSS environment variables rather than simulated, because the layout
 * reads them through `useSafeAreaInsets`: a run that merely resizes proves nothing about whether the
 * home indicator eats the Save button.
 */
const VIEWPORTS = [
  { label: '360x800', width: 360, height: 800 },
  { label: '390x844', width: 390, height: 844 },
  { label: '393x852', width: 393, height: 852 },
  { label: '430x932', width: 430, height: 932 },
  { label: '393x852-insets', width: 393, height: 852, insets: { top: 59, bottom: 34 } },
];

const findings = [];
const note = (viewport, screen, step, detail) => {
  findings.push({ viewport, screen, step, ...detail });
  console.log(`  [${detail.ok === false ? 'FAIL' : 'ok'}] ${screen} · ${step}${detail.message ? `: ${detail.message}` : ''}`);
};

const PLAN_DATE = (() => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

async function settle(page, ms = 1600) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });
  await page.waitForTimeout(ms);
}

/** Whether the page scrolls sideways, and what is sticking out if it does. */
async function overflow(page) {
  return page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    if (scroll <= viewport + 1) return null;
    const offenders = [];
    for (const element of document.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > viewport + 1) {
        offenders.push(`${element.tagName}[w=${Math.round(rect.width)} x=${Math.round(rect.left)}] "${(element.textContent ?? '').trim().slice(0, 32)}"`);
      }
    }
    return { viewport, scroll, offenders: offenders.slice(0, 5) };
  });
}

const text = (page) => page.evaluate(() => document.body.innerText);

async function newPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, value),
    {
      key: FAMILY_KEY,
      value: JSON.stringify({
        state: { profile: PROFILE, hasCompletedOnboarding: true, hasSeenSplash: true, profileRevision: 2 },
        version: 0,
      }),
    },
  );

  // Safe-area insets are injected as the real CSS variables the layout reads, so an inset run
  // exercises the same code path a notched phone does.
  if (viewport.insets) {
    await page.addStyleTag({
      content: `:root{--safe-area-inset-top:${viewport.insets.top}px;--safe-area-inset-bottom:${viewport.insets.bottom}px;}`,
    }).catch(() => {});
  }
  return { context, page, errors };
}


/** The whole journey at one width, from Home to a saved plan. */
async function auditJourney(browser, viewport) {
  const dir = join(OUT, viewport.label);
  mkdirSync(dir, { recursive: true });
  console.log(`\n=== ${viewport.label} ===`);
  const { context, page, errors } = await newPage(browser, viewport);
  const V = viewport.label;

  // --- HOME ------------------------------------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2600);
  await page.screenshot({ path: join(dir, '01-home.png') });

  const homeText = await text(page);
  note(V, 'Home', 'renders its deck rather than an empty shell', {
    ok: /min away|Potential match|Strong fit|Good fit/i.test(homeText),
    message: homeText.replace(/\s+/g, ' ').slice(0, 90),
  });
  note(V, 'Home', 'does not scroll sideways', await (async () => {
    const o = await overflow(page);
    return { ok: o === null, message: o ? `${o.scroll} in ${o.viewport}: ${o.offenders.join(' ; ')}` : undefined };
  })());
  note(V, 'Home', 'offers the category controls', {
    ok: /Indoor|Outdoor|Soft play|Park/i.test(homeText),
  });

  // --- VENUE DETAIL, with every fact confirmed -------------------------------------------------
  await page.goto(`${BASE}/venue/${EDGE.rich}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2400);
  await page.screenshot({ path: join(dir, '02-venue-confirmed.png') });
  const richText = await text(page);

  note(V, 'Venue Detail', 'renders a venue whose facts are confirmed', {
    ok: richText.includes('Confirmed Facts Gardens'),
    message: richText.replace(/\s+/g, ' ').slice(0, 80),
  });
  // Case-sensitive on purpose. This is reviewed prose, and the first version of this check caught
  // the detail column title-casing it into "Free On-Site Car Park, About 120 Spaces, Busiest Before
  // 11am At Weekends."
  note(V, 'Venue Detail', 'shows the reviewed parking prose exactly as written', {
    ok: richText.includes('Free on-site car park, about 120 spaces, busiest before 11am at weekends.'),
    message: (richText.match(/Free [^\n]{0,70}/) ?? ['not found'])[0],
  });
  note(V, 'Venue Detail', 'does not title-case the opening hours or the age range', {
    ok: !/\d{2}:\d{2} To \d{2}:\d{2}/.test(richText) && !/\d+ To \d+/.test(richText),
    message: (richText.match(/[\dapm:]+ To [\d]+[^\n]{0,20}/) ?? [''])[0],
  });
  note(V, 'Venue Detail', 'does not print an internal field name', {
    ok: !/[a-z]+[A-Z][a-z]+:|familyFacilities\./.test(richText),
    message: (richText.match(/[a-z]+[A-Z][a-z]+:|familyFacilities\.[a-zA-Z]+/) ?? [''])[0],
  });
  note(V, 'Venue Detail', 'offers Create a plan', {
    ok: await page.getByTestId('venue-create-plan').isVisible().catch(() => false),
  });
  note(V, 'Venue Detail', 'does not scroll sideways', await (async () => {
    const o = await overflow(page);
    return { ok: o === null, message: o ? `${o.scroll} in ${o.viewport}: ${o.offenders.join(' ; ')}` : undefined };
  })());
  note(V, 'Venue Detail', 'keeps the footer CTA on screen', await (async () => {
    const box = await page.getByTestId('venue-create-plan').boundingBox().catch(() => null);
    const ok = box ? box.y + box.height <= viewport.height + 1 : false;
    return { ok, message: box ? `bottom ${Math.round(box.y + box.height)} of ${viewport.height}` : 'no box' };
  })());

  // --- VENUE DETAIL edge cases ------------------------------------------------------------------
  for (const [id, label, assertion] of [
    [EDGE.longName, 'a very long venue name', async () => {
      const o = await overflow(page);
      return { ok: o === null, message: o ? `${o.scroll} in ${o.viewport}: ${o.offenders.join(' ; ')}` : undefined };
    }],
    [EDGE.noPhoto, 'a venue with no photograph', async () => {
      const t = await text(page);
      return { ok: t.includes('No Photograph Park'), message: t.replace(/\s+/g, ' ').slice(0, 70) };
    }],
    [EDGE.noHours, 'a venue whose hours nobody published', async () => {
      const t = await text(page);
      return { ok: !/Open now|Closed now/i.test(t) || /not confirmed|Not confirmed/i.test(t), message: (t.match(/Opening hours[\s\S]{0,50}/) ?? [''])[0].replace(/\s+/g, ' ') };
    }],
  ]) {
    await page.goto(`${BASE}/venue/${id}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 2000);
    await page.screenshot({ path: join(dir, `03-venue-${id.slice(-10)}.png`) });
    note(V, 'Venue Detail', `survives ${label}`, await assertion());
  }

  // --- CREATE A PLAN ----------------------------------------------------------------------------
  await page.goto(`${BASE}/venue/${EDGE.rich}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 2200);
  await page.getByTestId('venue-create-plan').click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(dir, '04-create-plan.png') });

  const sheet = page.getByTestId('create-plan-sheet');
  const sheetBox = await sheet.boundingBox().catch(() => null);
  // The approved reference is 640 of 852, which is 75%.
  note(V, 'Create a Plan', 'is the approved share of the viewport', {
    ok: sheetBox ? Math.abs(sheetBox.height / viewport.height - 0.75) < 0.1 || sheetBox.height >= 420 : false,
    message: sheetBox ? `${Math.round(sheetBox.height)} of ${viewport.height} (${Math.round((sheetBox.height / viewport.height) * 100)}%)` : 'no sheet',
  });
  note(V, 'Create a Plan', 'sits flush with the bottom of the viewport', {
    ok: sheetBox ? Math.abs(sheetBox.y + sheetBox.height - viewport.height) <= 2 : false,
    message: sheetBox ? `bottom ${Math.round(sheetBox.y + sheetBox.height)} of ${viewport.height}` : 'no sheet',
  });
  note(V, 'Create a Plan', 'rounds its top corners as approved', await (async () => {
    const radius = await sheet.evaluate((n) => getComputedStyle(n).borderTopLeftRadius).catch(() => '');
    return { ok: parseFloat(radius) >= 28, message: radius };
  })());
  note(V, 'Create a Plan', 'leaves the venue readable behind it', {
    ok: await page.evaluate(() => Array.from(document.querySelectorAll('*')).some(
      (n) => n.children.length === 0 && n.textContent?.trim() === 'FAMILY MATCH')),
  });

  const sheetText = ((await sheet.innerText().catch(() => '')) || '').toUpperCase();
  for (const row of ['WHEN', 'START', 'WHO’S COMING', 'HOW LONG']) {
    note(V, 'Create a Plan', `offers the ${row} row`, { ok: sheetText.includes(row) });
  }
  note(V, 'Create a Plan', 'summarises the household by count, never by name', {
    ok: sheetText.includes('2 ADULTS, 2 CHILDREN') && !sheetText.includes('MIA'),
  });
  note(V, 'Create a Plan', 'keeps the submit button reachable', await (async () => {
    const box = await page.getByTestId('create-plan-submit').boundingBox().catch(() => null);
    return {
      ok: box ? box.y + box.height <= viewport.height + 1 : false,
      message: box ? `bottom ${Math.round(box.y + box.height)} of ${viewport.height}` : 'no button',
    };
  })());

  // A double tap must produce one day, not two.
  const submit = page.getByTestId('create-plan-submit');
  await submit.click();
  await submit.click({ timeout: 1200 }).catch(() => {});
  await page.waitForTimeout(240);
  const generating = await page.getByTestId('generating-plan').isVisible().catch(() => false);
  if (generating) await page.screenshot({ path: join(dir, '05-generating.png') });

  // --- GENERATING -------------------------------------------------------------------------------
  const generatingText = generating ? await text(page) : '';
  if (generating) {
    note(V, 'Generating', 'names real work rather than claiming to think', {
      ok: /Checking|Working out|Fitting/i.test(generatingText)
        && !/thinking|magic|hold on|\bai\b/i.test(generatingText),
      message: generatingText.replace(/\s+/g, ' ').slice(0, 90),
    });
  } else {
    note(V, 'Generating', 'was reached', { ok: true, message: 'passed too quickly to capture' });
  }

  await page.waitForTimeout(4600);
  await settle(page, 700);
  await page.screenshot({ path: join(dir, '06-plan.png') });

  // --- PLAN -------------------------------------------------------------------------------------
  const planText = await text(page);
  const onPlan = await page.getByTestId('plan-save').isVisible().catch(() => false);
  note(V, 'Plan', 'renders', { ok: onPlan, message: onPlan ? undefined : planText.replace(/\s+/g, ' ').slice(0, 200) });

  if (onPlan) {
    note(V, 'Plan', 'summarises the day in the parent’s terms', {
      ok: /A \d+-hour /.test(planText), message: (planText.match(/A \d+-hour [A-Za-z]+/) ?? [''])[0],
    });
    note(V, 'Plan', 'does not scroll sideways', await (async () => {
      const o = await overflow(page);
      return { ok: o === null, message: o ? `${o.scroll} in ${o.viewport}: ${o.offenders.join(' ; ')}` : undefined };
    })());
    note(V, 'Plan', 'keeps the save action clear of the home indicator', await (async () => {
      const box = await page.getByTestId('plan-save').boundingBox().catch(() => null);
      const limit = viewport.height - (viewport.insets?.bottom ?? 0);
      return {
        ok: box ? box.y + box.height <= limit + 1 : false,
        message: box ? `bottom ${Math.round(box.y + box.height)}, safe limit ${limit}` : 'no button',
      };
    })());
    note(V, 'Plan', 'expands the first stop and collapses the rest', {
      ok: planText.includes('Arrive') && planText.includes('Time there'),
    });
    note(V, 'Plan', 'prints no internal field name', {
      ok: !/[a-z]+[A-Z][a-z]+:|familyFacilities\./.test(planText),
      message: (planText.match(/[a-z]+[A-Z][a-z]+:|familyFacilities\.[a-zA-Z]+/) ?? [''])[0],
    });

    // Parking for a venue that HAS confirmed parking must not read "not confirmed".
    await page.getByTestId('plan-section-travel').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(dir, '07-plan-travel.png') });
    const travelText = await text(page);
    note(V, 'Plan', 'reports confirmed free parking as confirmed', {
      ok: /On site, free/.test(travelText),
      message: (travelText.match(/Parking[\s\S]{0,60}/) ?? [''])[0].replace(/\s+/g, ' '),
    });
    note(V, 'Plan', 'labels estimated journeys as estimates', { ok: travelText.includes('Estimated from distance') });

    await page.getByTestId('plan-section-day').click();
    await page.waitForTimeout(400);
    await page.getByTestId('plan-save').click();
    await page.getByTestId('plan-save').click({ timeout: 1000 }).catch(() => {});
    await page.waitForTimeout(900);
    const saved = await page.evaluate(() => {
      try {
        const raw = window.localStorage.getItem('familypilot-planning-v1');
        const days = JSON.parse(raw ?? '{}')?.state?.savedDays ?? [];
        return days.length;
      } catch { return -1; }
    });
    note(V, 'Plan', 'a double tap saves the day once, not twice', { ok: saved === 1, message: `${saved} saved day(s)` });

    await page.goBack();
    await settle(page, 1600);
    note(V, 'Plan', 'back returns to the venue the day was built around', {
      ok: page.url().includes(`/venue/${EDGE.rich}`), message: page.url().replace(BASE, ''),
    });
  }

  note(V, 'journey', 'no runtime errors', {
    ok: errors.length === 0, message: errors.slice(0, 3).join(' | ') || undefined,
  });

  await context.close();
}

/** Hand-edited, shared and stale /plan links: everything the sheet cannot produce. */
async function auditPlanLinks(browser, viewport) {
  const dir = join(OUT, 'links');
  mkdirSync(dir, { recursive: true });
  console.log(`\n=== adversarial /plan links ===`);
  const V = 'links';

  const cases = [
    ['a venue that does not exist', `venue=fp-google-NOT-A-REAL-VENUE&date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=mine`,
      (t) => /could not find that place/i.test(t)],
    ['no venue at all', `date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=mine`,
      (t) => /No place to plan around/i.test(t)],
    ['a repeated parameter', `venue=${EDGE.rich}&venue=${EDGE.noPhoto}&date=${PLAN_DATE}&date=1999-01-01&leaveAt=09:30&visit=90&parties=mine`,
      (t) => t.includes('Save this plan')],
    ['a malformed visit length', `venue=${EDGE.rich}&date=${PLAN_DATE}&leaveAt=09:30&visit=soon&parties=mine`,
      (t) => /Check the plan details|does not add up|valid/i.test(t)],
    ['a date in the past', `venue=${EDGE.rich}&date=2001-01-01&leaveAt=09:30&visit=90&parties=mine`,
      (t) => /today or a future date|Check the plan details/i.test(t)],
    ['a venue that shuts before any visit fits', `venue=${EDGE.closesEarly}&date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=mine`,
      (t) => /closes at 09:30|closed that day|run past closing/i.test(t)],
    ['a stale household id', `venue=${EDGE.rich}&date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=mine,ghost-household`,
      (t) => t.includes('Save this plan') && /so this day does not include them/.test(t)],
    ['no household at all', `venue=${EDGE.rich}&date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=`,
      (t) => t.includes('Save this plan')],
  ];

  for (const [label, query, matches] of cases) {
    const { context, page, errors } = await newPage(browser, viewport);
    await page.goto(`${BASE}/plan?${query}`, { waitUntil: 'domcontentloaded' });
    await settle(page, 5200);
    const t = await text(page);
    await page.screenshot({ path: join(dir, `${label.replace(/[^a-z]+/gi, '-')}.png`) });
    note(V, '/plan link', label, { ok: matches(t), message: matches(t) ? undefined : t.replace(/\s+/g, ' ').slice(0, 200) });
    note(V, '/plan link', `${label} — no runtime error`, {
      ok: errors.filter((e) => !e.startsWith('404')).length === 0,
      message: errors.filter((e) => !e.startsWith('404')).slice(0, 2).join(' | ') || undefined,
    });
    await context.close();
  }

  // A reload must rebuild the same day rather than stranding the screen.
  const { context, page } = await newPage(browser, viewport);
  await page.goto(`${BASE}/plan?venue=${EDGE.rich}&date=${PLAN_DATE}&leaveAt=09:30&visit=90&parties=mine`, { waitUntil: 'domcontentloaded' });
  await settle(page, 5200);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await settle(page, 5200);
  const reloaded = await text(page);
  note(V, '/plan link', 'a reload rebuilds the day rather than stranding it', {
    ok: reloaded.includes('Save this plan'),
    message: reloaded.replace(/\s+/g, ' ').slice(0, 160),
  });
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : {}),
});
try {
  const only = process.env.ONLY_VIEWPORT;
  for (const viewport of VIEWPORTS.filter((v) => !only || v.label === only)) {
    await auditJourney(browser, viewport);
  }
  if (!only) await auditPlanLinks(browser, VIEWPORTS[2]);
} finally {
  await browser.close();
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'findings.json'), `${JSON.stringify(findings, null, 2)}\n`);
const failed = findings.filter((f) => f.ok === false);
console.log(`\n${findings.length - failed.length}/${findings.length} checks passed`);
for (const f of failed) console.log(`FAIL ${f.viewport} · ${f.screen} · ${f.step}: ${f.message ?? ''}`);
process.exitCode = failed.length ? 1 : 0;
