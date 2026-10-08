/**
 * Turns a built profile into the thing the app actually reads: production-shaped claims, projected by the SAME
 * `projectActiveClaimsToPayload` the consumer API uses, plus the editorial fields (good to know, parking text, warnings).
 *
 * This writes nothing. It is what a venue would look like once its proposed facts were approved and published as claims,
 * so the app can be shown that state without a production write. Nothing a person has not decided is ever "approved" in
 * the real system: `view: 'approved'` is a stated assumption for the demonstration, `view: 'auto'` is what needs no one.
 */
const path = require('node:path');
const root = path.join(__dirname, '..', '..', '..');
const { projectActiveClaimsToPayload } = require(path.join(root, 'server/enrichment/_lib/claims-store.js'));
const { PROJECTED_RULES } = require(path.join(root, 'server/enrichment/_lib/venue-rules.js'));
const { rulesFor } = require('./rules.cjs');

/** profile fact (section.key) -> claim field key and the value the claim carries. */
const CLAIM_MAP = {
  'toilets.toilets': ['familyFacilities.toilets', 'yes'],
  'toilets.babyChanging': ['familyFacilities.babyChanging', 'yes'],
  'toilets.accessibleToilet': ['accessibility.accessibleToilet', 'yes'],
  'toilets.changingPlaces': ['accessibility.changingPlaces', 'yes'],
  'food.cafe': ['familyFacilities.cafe', 'yes'],
  'food.picnic': ['familyFacilities.picnicArea', 'yes'],
  'play.playground': ['familyFacilities.playground', 'yes'],
  'play.natureplay': ['familyFacilities.playground', 'yes'],
  'transport.blueBadge': ['accessibility.accessibleParking', 'yes'],
  'access.wheelchair': ['accessibility.wheelchairAccessible', 'yes'],
  'access.sensory': ['sendInfo.sensoryFriendlySessions', 'yes'],
  'access.relaxed': ['sendInfo.sensoryFriendlySessions', 'yes'],
};

const addDays = (iso, n) => new Date(new Date(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
const LIFETIME = { facility: 30, other: 90 };

function accepted(profile, view) {
  return profile.facts.filter((f) => f.status === 'verified' || (view === 'approved' && f.status === 'review' && !f.held));
}

function claimsFor(profile, view) {
  const claims = [];
  const push = (fieldKey, valueJson, f) =>
    claims.push({
      fieldKey, valueJson, status: 'active', confidence: 'high', approvedBy: view === 'approved' ? 'pilot-review:assumed' : 'pilot-gate:auto',
      sourceUrl: f.evidence.url, evidenceExcerpt: f.evidence.quote, checkedAt: f.evidence.readAt,
      validUntil: addDays(f.evidence.readAt, /^(familyFacilities|accessibility|pushchair)/.test(fieldKey) ? LIFETIME.facility : LIFETIME.other),
    });
  const facts = accepted(profile, view);
  for (const f of facts) {
    const key = `${f.sec}.${f.key}`;
    if (CLAIM_MAP[key] && f.value !== 'adjacent') push(...CLAIM_MAP[key], f);
    if (key === 'transport.parking') {
      push('familyFacilities.parking', f.value === 'no' ? 'no' : 'yes', f);
      const fee = facts.find((g) => g.sec === 'transport' && g.key === 'parkingFee') ?? (f.text && /£/.test(f.text) ? f : null);
      if (f.value !== 'no' && fee) push('familyFacilities.freeParking', 'no', fee);
    }
  }
  // Pushchair suitability is a rating of the ground, so it is stated only where a page describes the ground: a positive pushchair
  // statement is "good"; mud, steep or uneven paths make it "mixed"; otherwise it is left unknown. A RULE (Discover: no pushchairs in
  // play areas) is not a rating of the ground, and the app's "mixed" wording ("some steps") would misdescribe it, so a rule stays a
  // good-to-know note and the rating stays unknown.
  const restrictive = facts.some((f) => ['terrain', 'steep-paths', 'steep-slopes'].includes(f.key) && f.sec !== 'transport');
  // Only a statement that pushchairs may be used (or suit the site) is positive; storage or hire existing says nothing about access.
  const positive = facts.find((f) => f.sec === 'pushchair' && ['access', 'allowed'].includes(f.key) && f.value !== 'no');
  // Venue rules (closures, restrictions, cautions) are a reviewer's structured reading of a page, and a rule can refuse a date or a
  // household, so it is applied only under the 'approved' view, as a person-approved claim. The approver below is a stated
  // assumption for this demonstration; production accepts a rule only from a `human:` approver who actually decided it.
  if (view === 'approved') {
    for (const { rule, evidence } of rulesFor(profile)) {
      const { id, text, ...rest } = rule;
      claims.push({
        fieldKey: `rules.${id}`, valueJson: { ...rest, text }, status: 'active', confidence: 'high', approvedBy: 'human:pilot-review-assumed',
        sourceUrl: evidence.url, evidenceExcerpt: evidence.quote, checkedAt: evidence.readAt, validUntil: addDays(evidence.readAt, 30),
      });
    }
  }
  if (restrictive) push('pushchairSuitability', 'mixed', facts.find((f) => ['terrain', 'steep-paths', 'steep-slopes'].includes(f.key)));
  else if (positive) push('pushchairSuitability', 'good', positive);
  return claims;
}

function editorialFor(profile, view) {
  const facts = accepted(profile, view);
  const find = (sec, key) => facts.find((f) => f.sec === sec && f.key === key);
  const extras = {};
  const parking = find('transport', 'parking');
  const blue = find('transport', 'blueBadge');
  const parts = [];
  if (parking) parts.push(parking.text);
  if (blue) parts.push(blue.text);
  if (parts.length) extras.parkingInfo = parts.join(' ');
  const gtk = facts.filter((f) => f.goodToKnow).map((f) => f.text);
  if (gtk.length) extras.goodToKnow = gtk;
  const dur = find('considerations', 'duration');
  if (dur) extras.visitDurationMinutes = Number(dur.value);
  return extras;
}

/** The metadata object the places API returns for this venue in this state. */
function metadataFor(profile, view, { baseline = [], today = '2026-10-08' } = {}) {
  const claims = claimsFor(profile, view);
  // A fresh reading replaces a stored claim for the same field; stored claims for other fields stay.
  const replaced = new Set(claims.map((c) => c.fieldKey));
  const kept = baseline.filter((c) => !replaced.has(c.fieldKey));
  const payload = projectActiveClaimsToPayload([...kept, ...claims].map((c) => ({ ...c, checkedAt: c.checkedAt ?? today })));
  return { payload, claims, allClaims: [...kept, ...claims], extras: editorialFor(profile, view) };
}

module.exports = { CLAIM_MAP, claimsFor, editorialFor, metadataFor, accepted };
