/**
 * The one source-type taxonomy.
 *
 * `venue_source_evidence.source_type` is constrained by migration 006 to exactly these seven
 * values, so a set defined anywhere else can only ever be a second taxonomy that drifts from the
 * rows it claims to describe -- which is how an earlier revision of the age-policy gate ended up
 * admitting `official`, `operator` and `human_verified`, none of which an evidence row can hold,
 * while excluding `visitor_info` and `family_page`, which are the pages a door policy is usually
 * printed on.
 */

/** Every value `venue_source_evidence.source_type` may hold. Mirrors migration 006's CHECK. */
const ALL_SOURCE_TYPES = new Set([
  'official_website',
  'accessibility_page',
  'visitor_info',
  'faq_page',
  'family_page',
  'council_page',
  'google_provider',
]);

/**
 * Pages the venue itself publishes. These are the sources the automatic publisher already trusts
 * (`trusted-evidence.js`), and the same set is what may stand behind a hard age gate.
 *
 * `council_page` is deliberately OUT, and it is the only judgement call here. A local authority
 * page often describes a venue the authority does not run, and its age wording is frequently a
 * summary rather than the door policy. For the one fact allowed to remove a venue from a parent's
 * results, a second-hand summary is not enough -- so a council page states a CAVEAT instead, which
 * a parent still sees. Where the council genuinely is the operator, the venue's own page under
 * that council's domain is an `official_website` and gates normally.
 *
 * `google_provider` is third-party aggregation and gates nothing.
 */
const OFFICIAL_SOURCE_TYPES = new Set([
  'official_website',
  'accessibility_page',
  'visitor_info',
  'faq_page',
  'family_page',
]);

module.exports = { ALL_SOURCE_TYPES, OFFICIAL_SOURCE_TYPES };
