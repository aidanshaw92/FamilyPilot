#!/usr/bin/env node
/**
 * Prints the two reviewed-data blocks the pilot profiles imply, in the exact shape of the shipped modules:
 *   --activity   entries for src/data/reviewed-activity-evidence.ts
 *   --admission  entries for src/data/reviewed-admission-claims.ts
 * These are the only parts of the pilot that ship as code, so they go through a normal pull request review.
 */
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..', '..', '..', 'docs', 'pilot', 'profiles');
const profiles = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const want = process.argv[2];
const flagOf = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
// `--only-items a,b` limits the activity block to the cards a person approved; `--edits file.json` carries their edited wording (itemId -> text).
const onlyItems = flagOf('--only-items') ? new Set(flagOf('--only-items').split(',').filter(Boolean)) : null;
const textEdits = flagOf('--edits') ? JSON.parse(require('node:fs').readFileSync(flagOf('--edits'), 'utf8')) : {};
const excerpts = flagOf('--excerpts') ? JSON.parse(fs.readFileSync(flagOf('--excerpts'), 'utf8')) : {};
const notes = flagOf('--notes') ? JSON.parse(fs.readFileSync(flagOf('--notes'), 'utf8')) : {};
const itemIdOf = (p, f) => `${p.id.replace('fp-google-', '')}:${f.sec}.${f.key}`;
// Already in the shipped module from earlier reviews: do not duplicate.
const skipActivity = new Set(['fp-google-ChIJOWBQvA4FdkgRQf5iYYFF1v4:playground', 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk:baby-toddler-space', 'fp-google-ChIJ7_PV980bdkgROekbwOVWVfo:soft-play']);
const skipAdmission = new Set(['fp-google-ChIJrcFVE-YNdkgRJQPxAxaTnMY', 'fp-google-ChIJse1x6SoRdkgR83yrIhNV5gc', 'fp-google-ChIJSzwgydoDdkgRndnXVYQGXBI', 'fp-google-ChIJp8y37pgCdkgRBeRSa2iabyI', 'fp-google-ChIJJ2CD1mEddkgRAuOi9iSzBrk']);

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
if (want === '--activity') {
  for (const p of profiles) {
    for (const f of p.facts) {
      if (f.sec !== 'activities' || f.minMonths == null || !f.evidence || skipActivity.has(`${p.id}:${f.key}`)) continue;
      if (onlyItems && !onlyItems.has(itemIdOf(p, f))) continue;
      const label = textEdits[itemIdOf(p, f)] ?? f.label;
      console.log(`  {
    venueId: ${q(p.id)},
    venueName: ${q(p.name)},
    kind: ${q(f.kind)},
    minMonths: ${f.minMonths},
    maxMonthsExclusive: ${f.maxMonthsExclusive},
    label: ${q(label)},
    evidence: {
      url: ${q(f.evidence.url)},
      retrievedAt: ${q(f.evidence.readAt)},
      subjectScope: 'venue_own_subtree',
      excerpt: ${q(excerpts[itemIdOf(p, f)] ?? f.evidence.quote)},
    },
    reviewNotes: ${q(notes[itemIdOf(p, f)] ?? 'Pilot profile (docs/pilot): ' + (f.status === 'review' ? 'proposed, awaiting a person. ' : '') + (f.kind === 'provision' ? 'A permanent provision described for an age.' : 'A programme on set days; names the child but never supports Excellent.'))},
  },`);
    }
  }
} else if (want === '--admission') {
  const out = [];
  for (const p of profiles) {
    const free = p.facts.find((f) => f.sec === 'pricing' && f.key === 'free' && f.evidence && f.value === 'free');
    if (skipAdmission.has(p.id)) continue;
    if (p.name === 'London Zoo') {
      const v = p.facts.find((f) => f.sec === 'pricing' && f.key === 'variable');
      out.push({ venueId: p.id, venueName: p.name, decision: 'hold', evidence: { url: v.evidence.url, retrievedAt: v.evidence.readAt, subjectScope: 'venue_own_subtree', excerpt: v.evidence.quote },
        reviewNotes: 'Paid, and the price depends on which of four day types (off-peak weekday, standard, standard weekend, peak) the visit falls on; the page does not say which dates are which, and the pricing contract has no day-type tier. A cheapest-tier figure would understate a weekend visit, so nothing is published. Children under 3 are free.' });
      continue;
    }
    if (!free) continue;
    const conditions = {
      'Science Museum': ['A free ticket must be pre-booked', 'Wonderlab, Power Up, IMAX and the Bubble Explorers show are charged'],
      'Natural History Museum': ['A free entry ticket is recommended to guarantee entry; weekends and school holidays can be busy with a queue', 'Paid exhibitions and events are charged'],
      'Royal Air Force Museum London': ['Car parking is charged', 'Some experiences are charged'],
      'Mudchute Park and Farm': ['Donations are welcome'],
      'Horniman Museum and Gardens': ['The Aquarium, Butterfly House, Voyage to the Deep and some events are charged'],
    }[p.name] ?? [];
    out.push({
      venueId: p.id, venueName: p.name, decision: 'publish',
      pricing: { status: 'free', source: { url: free.evidence.url, checkedAt: free.evidence.readAt }, conditions, ...(p.name === 'Science Museum' ? { bookingRequired: true } : {}) },
      evidence: { url: free.evidence.url, retrievedAt: free.evidence.readAt, subjectScope: 'venue_own_subtree', excerpt: free.evidence.quote },
      reviewNotes: 'Pilot profile (docs/pilot): proposed, awaiting a person. General entry is stated as free; the charged parts are extras, listed as conditions.',
    });
  }
  console.log(out.map((e) => JSON.stringify(e, null, 2).split('\n').map((l) => '    ' + l).join('\n')).join(',\n'));
}
