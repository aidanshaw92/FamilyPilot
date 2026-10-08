/**
 * The pilot profile contract and the mechanical acceptance gate.
 *
 * A profile is a list of FACTS. An author (a person or an AI reading with a person's review) writes each fact with the
 * venue's own sentence. This file decides, by rules and not by judgement, which facts may be accepted without a person and
 * which must wait for one. Nothing here reads the network, a database or a model.
 *
 * Author statuses:  fact | hypothesis | unknown
 * Built statuses:   verified   - passed every gate; may be shown without a person
 *                   review     - the sentence is real, but a gate says a person must decide before it is shown
 *                   hypothesis - a reasonable inference; never shown as a fact
 *                   unknown    - nothing on the pages read says; shown as "not confirmed"
 */
const SECTIONS = ['activities', 'pushchair', 'toilets', 'transport', 'food', 'play', 'access', 'opening', 'pricing', 'considerations'];

/** Reading dates older than this need a fresh reading before anything is auto-accepted. */
const MAX_READING_AGE_DAYS = 14;

/** Facts a plain, positive, unqualified sentence from the venue's own page may establish without a person. */
const AUTO_KEYS = new Set([
  'opening.hours',
  'toilets.toilets', 'toilets.babyChanging', 'toilets.accessibleToilet', 'toilets.changingPlaces', 'toilets.babyFeeding',
  'food.cafe', 'food.picnic',
  'play.playground', 'play.softplay', 'play.natureplay',
  'pushchair.storage',
  'transport.station', 'transport.bus', 'transport.parking', 'transport.blueBadge', 'transport.entrances',
  'considerations.duration', 'considerations.supervision',
]);

/** Wording that makes a sentence conditional, temporary or dated: a person decides whether it still holds. */
const HEDGE = /\b(currently|temporar\w*|until|unavailable|out of order|closed for|closure|refurbish\w*|may be|may close|may not|sometimes|subject to|planned|from [0-9]{1,2} [A-Z][a-z]+|building works|essential building)\b/i;

const norm = (s) => String(s ?? '')
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/ /g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/** The words of a fact's evidence: one sentence, or several joined when the fact rests on more than one on the same page. */
const quoted = (fact) => (Array.isArray(fact.q) ? fact.q.join(' ') : String(fact.q ?? ''));

function daysBetween(a, b) {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/**
 * Decide one fact. `page` is the page the quote was found on ({url, title, readAt}). Returns the built status and, for a
 * review, every reason a person is needed (a reviewer sees these next to the sentence).
 */
function gate(fact, page, today) {
  const reasons = [];
  const key = `${fact.sec}.${fact.key}`;
  if (daysBetween(page.readAt, today) > MAX_READING_AGE_DAYS) reasons.push(`page read more than ${MAX_READING_AGE_DAYS} days ago`);
  // A plain statement that something exists for children, with no age attached, asks nothing of a person. Naming an age does.
  const plainActivity = fact.sec === 'activities' && !fact.ages;
  if (!AUTO_KEYS.has(key) && !plainActivity) {
    if (fact.sec === 'activities') reasons.push('says who a place is for (drives suitability)');
    else if (fact.sec === 'pricing') reasons.push('a price or a free-entry claim (drives cost)');
    else if (fact.sec === 'access') reasons.push('an accessibility claim (high impact)');
    else reasons.push('not a fact type that may be accepted without a person');
  }
  if (fact.v === 'no') reasons.push('a negative claim (can exclude a venue)');
  if (HEDGE.test(quoted(fact))) reasons.push('conditional, temporary or dated wording');
  if (fact.scope === 'area') reasons.push('applies to part of the venue');
  if (fact.conflict) reasons.push(`conflicts with ${fact.conflict}`);
  if (quoted(fact).length < 25) reasons.push('sentence too short to stand on its own');
  return reasons.length === 0 ? { status: 'verified', reasons } : { status: 'review', reasons };
}

module.exports = { SECTIONS, AUTO_KEYS, HEDGE, MAX_READING_AGE_DAYS, norm, gate, daysBetween };
