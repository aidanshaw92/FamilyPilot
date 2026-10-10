/**
 * Independent checks on a proposed fact, run WITHOUT trusting the person or the process that wrote it.
 *
 * A verbatim match proves only that the words are on the page. It does not prove the words are about this venue, this
 * facility, this place within the venue, or that the proposed sentence means what the quote says. These checks ask exactly
 * those questions, each from the quote and the proposal alone, so they stay valid when a pipeline or an author is wrong.
 *
 * Every check returns { id, level, detail } where level is:
 *   fail  the proposal is unsupported by its own evidence (a number that is not in the quote, a facility the quote does not
 *         mention, a page that is not on the venue's site): routed to automatic rejection, reversible by a person
 *   warn  the evidence might not mean what the proposal says (negation near the keyword, a past year, another site's name):
 *         routed to a person, individually
 *   pass  nothing found
 * A check that cannot be run on this fact (no keyword rule for its type) returns null and says nothing.
 */
const fs = require('node:fs');
const path = require('node:path');

const norm = (s) => String(s ?? '').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

/** What each fact type must mention in its own evidence. A quote about parking cannot support a toilets fact. */
const MUST_MENTION = {
  'toilets.toilets': /toilet|\bwc\b|\bloo\b|lavator|restroom/,
  'toilets.babyChanging': /chang|nappy|nappies/,
  'toilets.accessibleToilet': /toilet/,
  'toilets.changingPlaces': /changing places/,
  'toilets.babyFeeding': /feed|breast|bottle|milk|nurs/,
  'food.cafe': /caf[eé]|coffee|restaurant|kiosk|snack|\beat\b|food|canteen|kitchen|shack/,
  'food.picnic': /picnic/,
  'play.playground': /playground|play area|play space|adventure|play/,
  'play.softplay': /soft play/,
  'play.natureplay': /play/,
  'pushchair.storage': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.restriction': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.allowed': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.access': /pushchair|buggy|buggies|pram|stroller|wheelchair/,
  'pushchair.hire': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.twins': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.cloakroom': /pushchair|buggy|buggies|pram|stroller/,
  'pushchair.terrain': /path|surface|tarmac|mud|ground|terrain|uneven|flat|step|slope|hill/,
  'transport.station': /station|tube|dlr|overground|rail|underground|elizabeth line/,
  'transport.bus': /\bbus/,
  'transport.parking': /park/,
  'transport.parkingFee': /£|charge|fee|pay/,
  'transport.blueBadge': /blue badge|accessible|disabled|bay/,
  'transport.entrances': /entrance|gate|enter|door/,
  'access.wheelchair': /wheelchair|step-free|step free|\blift|ramp|accessible|mobility/,
  'access.stepFree': /step-free|step free|\blift|ramp|level|accessible/,
  'access.sensory': /sensory|relaxed|quiet|autis|\bsend\b|\bbsl\b|sign|additional needs/,
  'access.relaxed': /relaxed|quiet|sensory/,
  'considerations.duration': /hour|minute|\bmins?\b|takes|visit/,
  'considerations.supervision': /adult|accompan|supervis|parent|carer/,
};

/** Names of OTHER places that appear on a venue's own site. A quote that names one is about somewhere else until shown otherwise. */
const FOREIGN = {
  'london-zoo': ['whipsnade'],
  'science-museum': ['science and industry museum', 'national railway museum', 'manchester', 'national science and media museum', 'bradford', 'locomotion', 'shildon', 'wroughton'],
  'natural-history-museum': ['tring', 'at tring'],
  'raf-museum-london': ['cosford', 'shropshire'],
  'horniman-museum-and-gardens': [],
  'discover-childrens-story-centre': [],
  'gunnersbury-park': [],
  'mudchute-park-and-farm': [],
  'battersea-park': [],
  'babylon-park-london': [],
};

/** Words that assert more than a plain statement does. If the proposal says one and the quote does not, the proposal over-reaches. */
const STRONG = [
  ['free', /\bfree\b/], ['step-free', /step[- ]free/], ['accessible', /accessible/], ['wheelchair', /wheelchair/],
  ['throughout', /throughout/], ['all', /\ball\b/], ['every', /\bevery\b/], ['always', /\balways\b/], ['unlimited', /unlimited/],
  ['never', /\bnever\b/], ['only', /\bonly\b/], ['guaranteed', /guarantee/], ['lifts', /\blifts?\b/], ['no charge', /no charge/],
];

const NEGATION = /\b(no|not|never|without|unavailable|cannot|can't|don't|do not|isn't|aren't|closed|out of order)\b|n't\b/;

const numbersOf = (raw) => {
  const s = norm(raw).replace(/(\d),(\d{3})/g, '$1$2').replace(/\b([ap])\.m\.?/g, '$1m');
  const out = new Set();
  const times = s.matchAll(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/g);
  for (const m of times) {
    let h = Number(m[1]) % 12;
    if (m[3] === 'pm') h += 12;
    out.add(`t${h}:${m[2] ?? '00'}`);
  }
  const rest = s.replace(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/g, ' ');
  for (const m of rest.matchAll(/£\s*(\d+(?:\.\d+)?)/g)) out.add(`£${Number(m[1])}`);
  for (const m of rest.replace(/£\s*\d+(?:\.\d+)?/g, ' ').matchAll(/(\d{1,2})[:.](\d{2})\b/g)) out.add(`t${Number(m[1])}:${m[2]}`);
  for (const m of rest.replace(/£\s*\d+(?:\.\d+)?/g, ' ').replace(/(\d{1,2})[:.](\d{2})\b/g, ' ').matchAll(/\d+/g)) out.add(String(Number(m[0])));
  // Number words count too: "seven indoor rides" must come from a page that says seven (or lists seven). "one" is left out because it is
  // mostly a pronoun ("no one", "one of"); a lone "one" is not a figure anybody relies on.
  const WORDS = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, hundreds: 'hundreds', hundred: 100, thousand: 1000, thousands: 'thousands', dozens: 'dozens' };
  for (const m of s.matchAll(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|hundreds?|thousands?|dozens)\b/g)) out.add(String(WORDS[m[1]] ?? m[1]));
  return out;
};

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the their there these they this to was were will with you your we our can may also not no any all'.split(' '));
const content = (s) => new Set(norm(s).replace(/[^a-z0-9£ ]/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, '')));

/**
 * @param {object} fact   a profile fact: { sec, key, text, value, evidence: { url, quote, readAt }, status }
 * @param {object} venue  { slug, site }
 */
function runChecks(fact, venue) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });
  const quote = norm(fact.evidence?.quote);
  const text = norm(fact.text);
  const key = `${fact.sec}.${fact.key}`;
  if (!quote) return [{ id: 'has-evidence', level: 'fail', detail: 'no quote' }];

  // 1. The page is on the venue's own site.
  try {
    const host = new URL(fact.evidence.url).hostname.replace(/^www\./, '');
    const site = String(venue.site ?? '').replace(/^www\./, '');
    if (site && !(host === site || host.endsWith(`.${site}`) || site.endsWith(host))) add('own-site', 'fail', `the page is on ${host}, not on the venue's site (${site})`);
    else add('own-site', 'pass', host);
  } catch { add('own-site', 'fail', 'the evidence address is not a valid URL'); }

  // 2. The quote mentions the thing the fact is about.
  const must = MUST_MENTION[key];
  if (must) add('mentions-subject', must.test(quote) ? 'pass' : 'fail', must.test(quote) ? key : `the quote does not mention ${key.split('.')[1]}`);

  // 3. Every number, price, time and age in the proposal is in the quote.
  const q = numbersOf(fact.evidence.quote);
  const missing = [...numbersOf(fact.text)].filter((n) => !q.has(n));
  add('numbers-supported', missing.length ? 'fail' : 'pass', missing.length ? `${missing.join(', ')} appear in the proposal but not in the quote` : 'every figure is in the quote');

  // 4. The proposal does not assert more than the quote.
  const over = STRONG.filter(([, re]) => re.test(text) && !re.test(quote)).map(([w]) => w);
  add('no-over-reach', over.length ? 'warn' : 'pass', over.length ? `the proposal says ${over.join(', ')}; the quote does not` : 'no stronger words than the quote');

  // 5. Polarity: a positive fact whose quote is negated near the subject, or a negative fact whose quote has no negation.
  if (must && (fact.value === 'yes' || fact.value === 'no')) {
    const re = new RegExp(`(${NEGATION.source})\\W+(?:\\w+\\W+){0,5}?(?:${must.source})|(?:${must.source})\\W+(?:\\w+\\W+){0,5}?(${NEGATION.source})`);
    if (fact.value === 'yes') add('polarity', re.test(quote) ? 'warn' : 'pass', re.test(quote) ? 'the quote has a negation near the subject while the fact says yes' : 'no negation near the subject');
    else add('polarity', NEGATION.test(quote) ? 'pass' : 'fail', NEGATION.test(quote) ? 'a negation is in the quote' : 'the fact says no but the quote contains no negation');
  }

  // 6. The quote is not about another place.
  const foreign = (FOREIGN[venue.slug] ?? []).filter((n) => quote.includes(n));
  add('this-place', foreign.length ? 'warn' : 'pass', foreign.length ? `the quote names ${foreign.join(', ')}, which is a different place` : 'no other place named');

  // 7. Dated: a year in the past relative to the reading, or a reading older than the allowance.
  const readYear = Number(String(fact.evidence.readAt ?? '').slice(0, 4)) || new Date().getFullYear();
  const years = [...quote.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const past = years.filter((y) => y < readYear);
  add('dated', past.length ? 'warn' : 'pass', past.length ? `the quote refers to ${past.join(', ')}, before the reading` : 'no past year');

  // 8. The proposal draws on the quote: enough content words in common.
  const a = content(fact.text); const b = content(fact.evidence.quote);
  const shared = [...a].filter((w) => b.has(w)).length;
  const ratio = a.size ? shared / a.size : 1;
  add('shares-content', ratio >= 0.3 ? 'pass' : 'warn', `${Math.round(ratio * 100)}% of the proposal's content words are in the quote`);

  // 9. The proposal is not much longer than its evidence.
  const wt = text.split(' ').length; const wq = quote.split(' ').length;
  add('interpretation-size', wt > wq * 1.8 + 8 ? 'warn' : 'pass', `${wt} words proposed against ${wq} quoted`);
  return checks;
}

const worst = (checks) => (checks.some((c) => c.level === 'fail') ? 'fail' : checks.some((c) => c.level === 'warn') ? 'warn' : 'pass');

/** The site each profile belongs to, and its file name, read from the authored sources. */
function venueIndex() {
  const dir = path.join(__dirname, 'profiles');
  const out = new Map();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.cjs'))) {
    const src = require(path.join(dir, f));
    out.set(src.id, { slug: f.replace(/\.cjs$/, ''), site: src.site, name: src.name });
  }
  return out;
}

module.exports = { runChecks, worst, venueIndex, numbersOf, norm, MUST_MENTION, FOREIGN, STRONG };
