/**
 * Official opening hours for the ten pilot venues: PROPOSED structured readings of the `opening.hours` item in each profile.
 *
 * The profile item holds the evidence (page, quote, date). This file holds the reviewer's structured reading of it: which days,
 * which times, which season, which part of the venue. It is the part a person must confirm, because it can contradict the
 * provider's hours (London Zoo's 4pm close from 24 October; Mudchute open on Mondays; Gunnersbury's 7am-to-dusk gates against
 * Google's "24 hours"). Applied only under the 'approved' view, as person-approved `hours.<id>` claims.
 */
const fs = require('node:fs');
const path = require('node:path');

const ALL = [0, 1, 2, 3, 4, 5, 6];
const SPECS = {
  'babylon-park-london': [
    { id: 'weekdays', scope: 'venue', days: [1, 2, 3, 4, 5], open: '10:00', close: '21:00' },
    { id: 'saturday', scope: 'venue', days: [6], open: '10:00', close: '22:00' },
    { id: 'sunday', scope: 'venue', days: [0], open: '10:00', close: '21:00' },
  ],
  'battersea-park': [
    { id: 'park-gates', scope: 'venue', days: ALL, open: '08:00', close: null, closeText: 'dusk' },
  ],
  'discover-childrens-story-centre': [
    { id: 'daily', scope: 'venue', days: ALL, open: '10:00', close: '17:00' },
  ],
  'gunnersbury-park': [
    { id: 'park', scope: 'venue', days: ALL, open: '07:00', close: null, closeText: 'dusk' },
    { id: 'museum', scope: 'area', area: 'Museum', days: [2, 3, 4, 5, 6, 0], open: '10:00', close: '16:30' },
  ],
  'horniman-museum-and-gardens': [
    { id: 'museum', scope: 'venue', days: ALL, open: '10:00', close: '17:30' },
    { id: 'gardens', scope: 'area', area: 'Gardens', days: [1, 2, 3, 4, 5, 6], open: '07:15', close: '18:30' },
    { id: 'gardens-sunday', scope: 'area', area: 'Gardens', days: [0], open: '08:00', close: '18:30' },
  ],
  'london-zoo': [
    { id: 'until-23-oct', scope: 'venue', days: ALL, until: '2026-10-23', open: '10:00', close: '17:00', lastEntry: '16:00' },
    { id: 'from-24-oct', scope: 'venue', days: ALL, from: '2026-10-24', until: '2027-02-12', open: '10:00', close: '16:00', lastEntry: '15:00' },
  ],
  'mudchute-park-and-farm': [
    { id: 'farm', scope: 'venue', days: ALL, open: '09:00', close: '16:00' },
  ],
  'natural-history-museum': [
    { id: 'daily', scope: 'venue', days: ALL, open: '10:00', close: '17:50', lastEntry: '17:30' },
  ],
  'raf-museum-london': [
    { id: 'daily', scope: 'venue', days: ALL, open: '10:00', close: '17:00', lastEntry: '16:30' },
  ],
  'science-museum': [
    { id: 'daily', scope: 'venue', days: ALL, open: '10:00', close: '18:00' },
  ],
};

const PROFILES_DIR = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
let slugById = null;
function slug(profile) {
  if (!slugById) {
    slugById = new Map(fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json'))
      .map((f) => [JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, f), 'utf8')).id, f.replace(/\.json$/, '')]));
  }
  return slugById.get(profile.id) ?? '';
}

/** The proposed rules for a built profile, each bound to its `opening.hours` item. Nothing is produced without a usable fact. */
function hoursFor(profile) {
  const fact = profile.facts.find((f) => f.sec === 'opening' && f.key === 'hours');
  if (!fact || !(fact.status === 'verified' || fact.status === 'review') || fact.held || !fact.evidence) return [];
  return (SPECS[slug(profile)] ?? []).map((spec) => ({ rule: spec, fact: 'opening.hours', status: fact.status, evidence: fact.evidence }));
}

module.exports = { SPECS, hoursFor };

if (require.main === module) {
  let total = 0;
  const all = {};
  for (const file of fs.readdirSync(PROFILES_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const profile = JSON.parse(fs.readFileSync(path.join(PROFILES_DIR, file), 'utf8'));
    const got = hoursFor(profile);
    if (got.length !== (SPECS[file.replace(/\.json$/, '')] ?? []).length) throw new Error(`${file}: hours spec without a usable opening.hours item`);
    all[profile.id] = { name: profile.name, rules: got };
    total += got.length;
  }
  if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify(all, null, 1));
  console.log(`${total} proposed official-hours readings across ${Object.keys(all).length} venues`);
}
