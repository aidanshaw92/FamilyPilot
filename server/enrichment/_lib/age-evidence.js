/**
 * The AGE EVIDENCE CONTRACT: what an official statement must look like before it may be treated as a fact about who a
 * venue is for. Pure and side-effect free. Nothing here writes a claim, and nothing here is wired to publication: it
 * defines, and tests against real wording from the stored cohort, what a producer would be allowed to accept.
 *
 * Sources: only the venue's OWN pages (official website, visitor information, family, FAQ, accessibility pages),
 * fetched cleanly, about the venue itself (subject scope own subtree or named page). Parent reports, provider
 * categories, other venues' pages and the venue's category are never evidence of age.
 *
 * A statement is one of (anything else is `rejected`, with the reason):
 *
 *   door_policy        An age at which entry is refused or limited ("not admitted", "over 16s only", "minimum age 5").
 *                      Alone may exclude a venue, and only after human approval (30-day lifetime, AGE_POLICY.md).
 *   supervision_rule   A rule about when an adult must be present ("children under 8 must be accompanied"). A fact a
 *                      parent wants; it admits the child, so it can never exclude.
 *   recommended_range  The venue's own advice on ages ("the recommended age of the attraction is 6 and over"). Ranks
 *                      and explains; never excludes.
 *   facility_range     Advice for one part of the venue (a playground, a play area, a trail): shown for that part, not
 *                      as the venue's age range.
 *   qualitative        Plain-word audience ("great for toddlers"): a lead for the explanation, never a number.
 *
 * Always rejected, however age-shaped: ticket and price bands ("child 4-17 £11", "under 3s go free": a price band is
 * not suitability), programmes (workshops, classes, sessions, events, parties, camps, walks), marketing copy ("for all
 * ages", "for everyone"), job or volunteering ages, and group sizes ("20+ people").
 */
const OFFICIAL_SOURCES = new Set(['official_website', 'visitor_info', 'family_page', 'faq_page', 'accessibility_page']);
const OWN_SCOPES = new Set(['venue_own_subtree', 'venue_named_page']);

const PRICING = /(£|&pound;|\bfree\b|\bticket|\bprice|\badmission\b|\bconcession|\bdiscount|\bfee\b|\bpay(s|ing)?\b|\bmembership|\bcompanion\b|\bentitled\b|\bproof of\b|\beligib)/i;
const PROGRAMME = /\b(workshop|class(es)?|session|event|party|parties|camp|course|club|junior park ?run|story ?time|yoga|walks?|trails?|exhibition|gallery|storytelling|resources|activities|activity|costume|young people|adventure|holiday|term time|morning|afternoon|offers three|days of)\b|\b(mon|tues|wednes|thurs|fri|satur|sun)day\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+20\d\d\b|\b\d{1,2}\s?(am|pm)\b/i;
/** A sentence the extractor cut off ("aged 3 – [") is not a statement. */
const INCOMPLETE = /(?:[–-]\s*\[?\s*$|\[\s*$)/;
const FACILITY = /\b(playground|play area|play areas|play equipment|climbing|water play|skate|bmx|wheeled)\b/i;
const MARKETING = /\b(all ages|every age|any age|for everyone)\b(?!\s*\d)/i;
const GROUP = /\b\d+\s*\+\s*(people|ppl|guests|children|persons)\b|\bmin(imum)?\s+\d+\s+(ppl|people)\b|\b\d+ or more\b/i;
const JOB = /\b(volunteer|apprentice|employ|vacanc|recruit|work experience)\b/i;
const NUM = '(\\d{1,2})';

/** Clauses are judged one by one: "under 2s go free but the recommended age is 6 and over" is a price AND a recommendation. */
function clauses(text) {
  return String(text).split(/\bbut\b|\bhowever\b|\balthough\b|;|\s[–—]\s/i).map((c) => c.trim()).filter(Boolean);
}

function classifyClause(c) {
  if (INCOMPLETE.test(c)) return { kind: 'rejected', reason: 'incomplete' };
  if (JOB.test(c)) return { kind: 'rejected', reason: 'job' };
  if (GROUP.test(c)) return { kind: 'rejected', reason: 'group_size' };
  // The one place a price word may sit beside a real rule: handled by clause splitting. A clause that is about money is not evidence.
  if (PRICING.test(c) && !/\b(recommended|suitable)\b/i.test(c) && !/\bmust be accompanied\b|\bnot permitted\b|\bnot admitted\b|\brequire a paying adult\b|\bpaying adult\b/i.test(c)) return { kind: 'rejected', reason: 'pricing' };

  let m;
  // supervision: "(Children|Under 14s|Guests under the age of 5) (aged) under N must be accompanied / supervised / require a paying adult"
  if ((m = c.match(new RegExp(`(?:children|under|guests|visitors|kids)[^.]{0,30}?(?:under|aged|age of)?\\s*(?:the age of\\s*)?(?:under\\s*)?${NUM}\\s*(?:s|years?)?[^.]{0,40}?(?:must be|require|need|should be|are required to be)[^.]{0,30}?(?:accompanied|supervis|adult)`, 'i')))
    || (m = c.match(new RegExp(`(?:accompanied|supervis)[^.]{0,60}?(?:aged|under|age)\\s*${NUM}`, 'i')))
    || (m = c.match(new RegExp(`(?:aged\\s*)?${NUM}\\s*(?:-+|–|to)\\s*${NUM}[^.]{0,30}must have someone[^.]{0,30}supervis`, 'i')))) {
    return { kind: 'supervision_rule', ageYears: Number(m[2] ?? m[1]) };
  }
  // door policy: refusal or an age ceiling/floor on entry
  if ((m = c.match(new RegExp(`(?:no (?:children|kids|under)|not (?:suitable|permitted|admitted|allowed)[^.]{0,30}(?:under|below|aged))[^.]{0,20}${NUM}`, 'i')))
    || (m = c.match(new RegExp(`(?:minimum|min\\.?) age[^.]{0,15}${NUM}`, 'i')))
    || (m = c.match(new RegExp(`(?:suitable for|open to)[^.]{0,10}(?:under|over) ${NUM}s? only`, 'i')))) {
    return { kind: 'door_policy', ageYears: Number(m[1]) };
  }
  // recommended range: the venue's own advice about ages
  if ((m = c.match(new RegExp(`(?:recommended age|suitable for|recommended for|ideal for|designed for|best for)[^.]{0,40}?${NUM}\\s*(?:-|–|to|and)?\\s*${NUM}?\\s*(\\+|and over|and above|years|yrs)?`, 'i')))) {
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : null;
    const open = Boolean(m[3] && /\+|over|above/i.test(m[3]));
    if (PROGRAMME.test(c)) return { kind: 'rejected', reason: 'programme' };
    return { kind: FACILITY.test(c) ? 'facility_range' : 'recommended_range', fromYears: from, toYears: open ? null : to };
  }
  if (FACILITY.test(c) && new RegExp(`(?:children|kids)[^.]{0,30}(?:up to|under|over|aged)?\\s*${NUM}`, 'i').test(c) && !PROGRAMME.test(c.replace(FACILITY, ''))) {
    const n = c.match(new RegExp(NUM));
    return { kind: 'facility_range', fromYears: null, toYears: n ? Number(n[1]) : null };
  }
  if (MARKETING.test(c)) return { kind: 'rejected', reason: 'marketing' };
  if (/\b(suitable|great|perfect|ideal|designed)\s+for\s+(toddlers?|babies|young children|little ones|under[- ]?fives?|pre-?schoolers?|teenagers?|older children)\b/i.test(c) && !PROGRAMME.test(c)) {
    return { kind: 'qualitative' };
  }
  return { kind: 'rejected', reason: PROGRAMME.test(c) ? 'programme' : 'no_age_statement' };
}

/**
 * @param {string} text   one sentence of the venue's own page
 * @param {{sourceType:string,subjectScope:string}} ctx
 * @returns {{kind:string, reason?:string, quote:string, ageYears?:number, fromYears?:number|null, toYears?:number|null, requiresHumanApproval?:boolean}}
 */
function classifyAgeStatement(text, ctx) {
  const quote = String(text || '').replace(/&#8211;|&ndash;/g, '–').replace(/&nbsp;/g, ' ').replace(/&pound;/g, '£').replace(/\s+/g, ' ').trim();
  if (!ctx || !OFFICIAL_SOURCES.has(ctx.sourceType)) return { kind: 'rejected', reason: 'not_official_source', quote };
  if (!OWN_SCOPES.has(ctx.subjectScope)) return { kind: 'rejected', reason: 'not_about_this_venue', quote };
  if (INCOMPLETE.test(quote)) return { kind: 'rejected', reason: 'incomplete', quote };
  // Judge each clause; the most informative one wins (rules before advice before audience).
  const order = ['door_policy', 'supervision_rule', 'recommended_range', 'facility_range', 'qualitative'];
  const results = clauses(quote).map(classifyClause);
  const best = results.filter((r) => r.kind !== 'rejected').sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
  if (!best) return { ...(results[0] || { kind: 'rejected', reason: 'no_age_statement' }), quote };
  return { ...best, quote, requiresHumanApproval: best.kind === 'door_policy' };
}

module.exports = { classifyAgeStatement, OFFICIAL_SOURCES, OWN_SCOPES };
