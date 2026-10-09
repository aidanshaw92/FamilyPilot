import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readiness } = require('../../scripts/pilot/readiness.cjs');
const { gate, AUTO_KEYS } = require('../../scripts/pilot/profile-lib.cjs');

type Fact = { sec: string; key: string; status: string; kind?: string; minMonths?: number; maxMonthsExclusive?: number };
const v = (sec: string, key: string, extra: Partial<Fact> = {}): Fact => ({ sec, key, status: 'verified', ...extra });
const r = (sec: string, key: string, extra: Partial<Fact> = {}): Fact => ({ sec, key, status: 'review', ...extra });

/** The least a venue needs to be recommendation-ready: hours, cost, a way there, something for children, a toilet. */
const CORE: Fact[] = [
  v('opening', 'hours'),
  v('pricing', 'free'),
  v('transport', 'station'),
  v('activities', 'play', { kind: 'provision' }),
  v('toilets', 'toilets'),
];

describe('readiness: the three levels', () => {
  it('a venue with the core and nothing optional is recommendation-ready', () => {
    const out = readiness(CORE);
    expect(out.level).toBe('recommendation-ready');
    expect(out.missing).toEqual([]);
  });

  it('an unknown optional facility never excludes (cafe, playground, pushchair, accessibility)', () => {
    const withUnknowns = [...CORE, { sec: 'food', key: 'cafe', status: 'unknown' }, { sec: 'play', key: 'playground', status: 'unknown' }, { sec: 'access', key: 'wheelchair', status: 'unknown' }, { sec: 'pushchair', key: 'terrain', status: 'unknown' }];
    const out = readiness(withUnknowns);
    expect(out.level).toBe('recommendation-ready');
    expect(out.limitations).toEqual(['food.cafe', 'play.playground', 'access.wheelchair', 'pushchair.terrain']);
  });

  it('activity and logistics are separate requirements: neither stands in for the other', () => {
    const noActivity = CORE.filter((f) => f.sec !== 'activities');
    expect(readiness(noActivity).level).toBe('discoverable');
    expect(readiness(noActivity).missing).toEqual(['childActivity']);
    const noLogistics = CORE.filter((f) => f.sec !== 'toilets' && f.sec !== 'transport');
    expect(readiness(noLogistics).missing).toEqual(['gettingThere', 'familyEssentials']);
  });

  it('a play facility is something for children to do; a bare toilet is not', () => {
    const withPlayground = [...CORE.filter((f) => f.sec !== 'activities'), v('play', 'playground')];
    expect(readiness(withPlayground).level).toBe('recommendation-ready');
    expect(readiness([...CORE.filter((f) => f.sec !== 'activities'), v('toilets', 'babyChanging')]).missing).toEqual(['childActivity']);
  });

  it('the cost of getting in must be established; a child concession or an add-on price alone is not it', () => {
    const concessionOnly = [...CORE.filter((f) => f.sec !== 'pricing'), v('pricing', 'under3'), v('pricing', 'addons')];
    expect(readiness(concessionOnly).missing).toEqual(['cost']);
  });

  it('the provider layer can supply opening hours, and nothing else', () => {
    const noHours = CORE.filter((f) => f.sec !== 'opening');
    expect(readiness(noHours).level).toBe('discoverable');
    expect(readiness(noHours, { layerA: { hours: true } }).level).toBe('recommendation-ready');
  });

  it('only accepted facts count: hypotheses and unknowns never do, and a fact awaiting a person counts only if approved', () => {
    const waiting = [v('opening', 'hours'), r('pricing', 'free'), v('transport', 'station'), r('activities', 'play', { kind: 'provision' }), v('toilets', 'toilets')];
    expect(readiness(waiting, { view: 'auto' }).level).toBe('discoverable');
    expect(readiness(waiting, { view: 'approved' }).level).toBe('recommendation-ready');
    const hypothesis = [...CORE.filter((f) => f.sec !== 'pricing'), { sec: 'pricing', key: 'free', status: 'hypothesis' }];
    expect(readiness(hypothesis, { view: 'approved' }).missing).toEqual(['cost']);
  });
});

describe('readiness: highly personalised', () => {
  const PRACTICAL: Fact[] = [v('pushchair', 'storage'), v('toilets', 'babyChanging'), v('food', 'cafe'), v('access', 'wheelchair')];
  const aged = (min: number, max: number, kind = 'provision'): Fact => v('activities', `a${min}-${max}-${kind}`, { kind, minMonths: min, maxMonthsExclusive: max });

  it('needs age-specific activity evidence across two age bands, plus practical detail', () => {
    const facts = [...CORE, ...PRACTICAL, aged(0, 36), aged(36, 84)];
    expect(readiness(facts).level).toBe('highly-personalised');
  });

  it('one age band, or no age at all, stays recommendation-ready', () => {
    expect(readiness([...CORE, ...PRACTICAL, aged(0, 36)]).level).toBe('recommendation-ready');
    expect(readiness([...CORE, ...PRACTICAL]).level).toBe('recommendation-ready');
  });

  it('a programme alone cannot make a venue highly personalised (it names a child but may not run on the day)', () => {
    const facts = [...CORE, ...PRACTICAL, aged(0, 36, 'programme'), aged(36, 84, 'programme')];
    expect(readiness(facts).personalisation.anyAgedProvision).toBe(false);
    expect(readiness(facts).level).toBe('recommendation-ready');
  });

  it('thin practical detail stays recommendation-ready however good the activity evidence', () => {
    const facts = [...CORE, aged(0, 36), aged(36, 84)];
    expect(readiness(facts).personalisation.practicalGroups).toBeLessThan(4);
    expect(readiness(facts).level).toBe('recommendation-ready');
  });

  it('child price terms are required; a paid venue with no child terms is not highly personalised', () => {
    const noChildPrice = [...CORE.filter((f) => f.sec !== 'pricing'), v('pricing', 'paid'), ...PRACTICAL, aged(0, 36), aged(36, 84)];
    expect(readiness(noChildPrice).level).toBe('recommendation-ready');
    expect(readiness([...noChildPrice, v('pricing', 'under3')]).level).toBe('highly-personalised');
  });
});

describe('acceptance gate: what may be accepted without a person', () => {
  const page = { url: 'https://example.org/visit', readAt: '2026-10-08' };
  const today = '2026-10-08';
  const base = { sec: 'toilets', key: 'babyChanging', v: 'yes', q: 'Baby changing facilities are available in these toilets.' };

  it('accepts a plain, positive, current facility sentence', () => {
    expect(gate(base, page, today).status).toBe('verified');
  });
  it('sends a negative claim to a person (it can exclude a venue)', () => {
    expect(gate({ ...base, sec: 'transport', key: 'parking', v: 'no', q: 'We do not have parking facilities on-site and parking is limited.' }, page, today).status).toBe('review');
  });
  it('sends conditional, temporary or dated wording to a person', () => {
    expect(gate({ ...base, q: 'The baby changing room is currently closed for refurbishment until spring.' }, page, today).status).toBe('review');
  });
  it('always sends prices, accessibility claims and age-bearing activity claims to a person', () => {
    expect(gate({ ...base, sec: 'pricing', key: 'free', q: 'Admission to all areas of the Museum is free, and donations are welcome.' }, page, today).status).toBe('review');
    expect(gate({ ...base, sec: 'access', key: 'wheelchair', q: 'The museum and gardens are both wheelchair friendly with accessible toilets.' }, page, today).status).toBe('review');
    expect(gate({ ...base, sec: 'activities', key: 'garden', ages: [36, 84], q: 'a must-visit for 3 to 6 year olds, The Garden play gallery' }, page, today).status).toBe('review');
  });
  it('accepts a plain activity that names no age', () => {
    expect(gate({ ...base, sec: 'activities', key: 'playground', q: 'Perfect for young aviators, our free playground features mini models of aircraft.' }, page, today).status).toBe('verified');
  });
  it('sends a fact that conflicts with another source, or covers only part of the venue, to a person', () => {
    expect(gate({ ...base, conflict: 'the provider hours' }, page, today).status).toBe('review');
    expect(gate({ ...base, scope: 'area' }, page, today).status).toBe('review');
  });
  it('sends a page read more than 14 days ago to a person', () => {
    expect(gate(base, { ...page, readAt: '2026-09-20' }, today).status).toBe('review');
  });
  it('keeps the auto-accept list to plain facilities, hours, transport and house rules', () => {
    for (const key of AUTO_KEYS) expect(key).not.toMatch(/^(pricing|access)\./);
  });
});

describe('the ten pilot profiles', () => {
  const dir = join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  const profiles = files.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

  it('there are ten, with distinct venue ids', () => {
    expect(profiles.length).toBe(10);
    expect(new Set(profiles.map((p: { id: string }) => p.id)).size).toBe(10);
  });

  it('no fact is an error, and every fact that states something carries the venue\'s own sentence, address and reading date', () => {
    for (const p of profiles) {
      for (const f of p.facts) {
        expect(f.status, `${p.name} ${f.sec}.${f.key}`).not.toBe('error');
        if (f.status === 'verified' || f.status === 'review') {
          expect(f.evidence?.quote?.length, `${p.name} ${f.sec}.${f.key}`).toBeGreaterThanOrEqual(25);
          expect(f.evidence.url).toMatch(/^https:\/\//);
          expect(f.evidence.readAt).toMatch(/^2026-\d\d-\d\d$/);
        }
      }
    }
  });

  it('a fact sent to a person says why; a verified fact never carries a negative value or a review reason', () => {
    for (const p of profiles) {
      for (const f of p.facts) {
        if (f.status === 'review') expect(f.reviewReasons?.length, `${p.name} ${f.sec}.${f.key}`).toBeGreaterThan(0);
        if (f.status === 'verified') {
          expect(f.value, `${p.name} ${f.sec}.${f.key}`).not.toBe('no');
          expect(f.reviewReasons).toBeUndefined();
        }
      }
    }
  });

  it('a hypothesis or an unknown is never shown as a fact: it has no verified status and no pricing "free" claim', () => {
    for (const p of profiles) {
      for (const f of p.facts) {
        if (f.status === 'hypothesis' || f.status === 'unknown') expect(['hypothesis', 'unknown']).toContain(f.status);
      }
    }
    const battersea = profiles.find((p: { name: string }) => p.name === 'Battersea Park');
    const free = battersea.facts.find((f: { sec: string; key: string }) => f.sec === 'pricing' && f.key === 'free');
    expect(free.status).toBe('hypothesis');
  });
});
