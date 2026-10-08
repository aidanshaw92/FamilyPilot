/**
 * Venue rules for the ten pilot venues: PROPOSED, each bound to the profile fact (and so the source page and quote) it comes from.
 *
 * A rule is a structured reading of something a venue says that changes a visit: a closure with dates, a pushchair restriction, a
 * step-free gap, a booking note, a caution. The profile fact holds the evidence; this file holds the reviewer's structured
 * interpretation of it (kind, where it applies, dates, whether it covers the core visit). The interpretation is the part a
 * person must confirm, because it is what lets a rule refuse a date or a household, so every spec here is a proposal until
 * approved, and under the automatic view none is applied.
 *
 * `coversCoreVisit` is a judgement, not a fact on a page. It is true only where the restriction reaches the main reason to go
 * (Discover: "we do not allow buggies and pushchairs in any of our storytelling or play areas", and the venue IS its storytelling
 * and play areas). Everywhere else it is left unset, so the rule warns and never refuses.
 */
const fs = require('node:fs');
const path = require('node:path');

const SPECS = {
  'babylon-park-london': [
    { fact: 'considerations.height', id: 'ride-height-limit', kind: 'caution', scope: 'area', area: 'Rollercoaster and drop tower' },
  ],
  'battersea-park': [
    { fact: 'considerations.cascades', id: 'cascades-restoration', kind: 'caution', scope: 'area', area: 'The Cascades' },
  ],
  'discover-childrens-story-centre': [
    { fact: 'pushchair.restriction', id: 'pushchair-play-areas', kind: 'pushchair', scope: 'area', area: 'Storytelling and play areas', coversCoreVisit: true },
    { fact: 'pushchair.twins', id: 'pushchair-exception', kind: 'caution', scope: 'venue', exceptionOf: 'pushchair-play-areas' },
    { fact: 'considerations.booking', id: 'book-ahead', kind: 'booking', scope: 'venue' },
    { fact: 'opening.hours', id: 'closed-christmas', kind: 'closure', scope: 'venue', from: '2026-12-24', until: '2026-12-26', text: 'Closed 24, 25 and 26 December.' },
    { fact: 'opening.hours', id: 'closed-new-year', kind: 'closure', scope: 'venue', from: '2026-12-31', until: '2027-01-01', text: 'Closed 31 December and 1 January.' },
  ],
  'gunnersbury-park': [
    { fact: 'opening.hours', id: 'museum-closed-mondays', kind: 'closure', scope: 'area', area: 'Museum', weekdays: [1], text: 'The museum is closed on Mondays; the park is open every day.' },
    { fact: 'considerations.dogs', id: 'no-dogs-museum', kind: 'caution', scope: 'area', area: 'Museum' },
  ],
  'horniman-museum-and-gardens': [
    { fact: 'access.steep-paths', id: 'steep-garden-paths', kind: 'caution', scope: 'area', area: 'Garden paths and Nature Trail' },
    { fact: 'opening.closure', id: 'natural-history-gallery-closed', kind: 'closure', scope: 'area', area: 'Natural History Gallery', text: 'The Natural History Gallery is closed for refurbishment.' },
    { fact: 'opening.closure', id: 'nature-gallery-closed', kind: 'closure', scope: 'area', area: 'Nature Gallery and Nature Discovery Den', until: '2027-02-05', text: 'The Nature Gallery and Nature Discovery Den are closed until 5 February 2027.' },
    { fact: 'considerations.busy-cafe', id: 'busy-cafe-lunch', kind: 'caution', scope: 'area', area: 'Café' },
  ],
  'london-zoo': [
    { fact: 'access.steep-slopes', id: 'steep-tunnel-slopes', kind: 'pushchair', scope: 'area', area: 'Slopes to the two tunnels' },
  ],
  'mudchute-park-and-farm': [
    { fact: 'considerations.monday-courtyard', id: 'courtyard-closed-mondays', kind: 'closure', scope: 'area', area: 'Main courtyard', weekdays: [1], affectsFacilities: ['toilets', 'babyChanging'] },
    { fact: 'considerations.hygiene', id: 'wash-hands-animals', kind: 'caution', scope: 'area', area: 'Animal areas' },
  ],
  'natural-history-museum': [
    { fact: 'opening.closure', id: 'closed-2026-10-09', kind: 'closure', scope: 'venue', from: '2026-10-09', until: '2026-10-09', text: 'Closed on 9 October.' },
    { fact: 'opening.closure', id: 'closed-christmas', kind: 'closure', scope: 'venue', from: '2026-12-24', until: '2026-12-26', text: 'Closed 24, 25 and 26 December.' },
    { fact: 'access.lifts-out', id: 'lifts-out-of-order', kind: 'step_free', scope: 'area', area: 'Darwin Centre and Mammals Hall lifts' },
    { fact: 'access.station-step-free', id: 'station-not-step-free', kind: 'step_free', scope: 'area', area: 'South Kensington station' },
    { fact: 'considerations.queue', id: 'weekend-queue', kind: 'caution', scope: 'venue' },
    { fact: 'considerations.booking', id: 'free-ticket-guarantees-entry', kind: 'booking', scope: 'venue' },
    { fact: 'considerations.creepy-crawlies', id: 'creepy-crawlies-closed', kind: 'closure', scope: 'area', area: 'Creepy Crawlies Gallery' },
  ],
  'raf-museum-london': [
    { fact: 'opening.theatre', id: '4d-theatre-closed', kind: 'closure', scope: 'area', area: '4D Theatre', until: '2026-12-31' },
  ],
  'science-museum': [
    { fact: 'pushchair.allowed', id: 'bulky-buggies-parked', kind: 'pushchair', scope: 'venue' },
    { fact: 'access.mezzanine', id: 'mezzanine-not-step-free', kind: 'step_free', scope: 'area', area: 'Mezzanine in Making the Modern World and Flight' },
    { fact: 'opening.hours', id: 'closed-christmas', kind: 'closure', scope: 'venue', from: '2026-12-24', until: '2026-12-26', text: 'Closed 24, 25 and 26 December.' },
    { fact: 'considerations.building-noise', id: 'building-noise', kind: 'caution', scope: 'venue' },
  ],
};

const PROFILES_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
let slugById = null;
/** The profile file name for a venue id: the key the specs above are written under. */
function slug(profile) {
  if (!slugById) {
    slugById = new Map(fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json'))
      .map((f) => [JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8')).id, f.replace(/\.json$/, '')]));
  }
  return slugById.get(profile.id) ?? '';
}
const usable = (f) => (f.status === 'verified' || f.status === 'review') && !f.held;

/**
 * The proposed rules for a built profile, each carrying its evidence. A spec whose fact is missing, unread, held or not a
 * finding (unknown, hypothesis) yields nothing: a rule never outlives the fact that justifies it.
 */
function rulesFor(profile, name = slug(profile)) {
  const out = [];
  for (const spec of SPECS[name] ?? []) {
    const [sec, key] = spec.fact.split(/\.(.+)/);
    const fact = profile.facts.find((f) => f.sec === sec && f.key === key);
    if (!fact || !usable(fact) || !fact.evidence) continue;
    const rule = {
      id: spec.id, kind: spec.kind, scope: spec.scope,
      ...(spec.area ? { area: spec.area } : {}), ...(spec.coversCoreVisit ? { coversCoreVisit: true } : {}),
      ...(spec.from ? { from: spec.from } : {}), ...(spec.until ? { until: spec.until } : {}),
      ...(spec.weekdays ? { weekdays: spec.weekdays } : {}), ...(spec.exceptionOf ? { exceptionOf: spec.exceptionOf } : {}), ...(spec.affectsFacilities ? { affectsFacilities: spec.affectsFacilities } : {}),
      text: spec.text ?? fact.text,
    };
    out.push({ rule, fact: spec.fact, status: fact.status, evidence: fact.evidence });
  }
  return out;
}

module.exports = { SPECS, rulesFor };

if (require.main === module) {
  const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
  const all = {};
  let total = 0;
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const profile = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const rules = rulesFor(profile, file.replace(/\.json$/, ''));
    const specs = (SPECS[file.replace(/\.json$/, '')] ?? []).length;
    if (rules.length !== specs) throw new Error(`${file}: ${specs - rules.length} rule spec(s) have no usable fact`);
    all[profile.id] = { name: profile.name, rules };
    total += rules.length;
  }
  if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(all, null, 1));
  console.log(`${total} proposed rules across ${Object.keys(all).length} venues`);
}
