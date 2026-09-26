import { describe, expect, it } from 'vitest';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  buildCommonPathCandidates,
  mergePageCandidates,
} = require('../../../server/enrichment/_lib/source-discovery');
const { findRelevantLinks } = require('../../../server/enrichment/_lib/html-text-extractor');
const {
  classifySubjectScope,
  isEligibleScope,
  nameTokens,
  SUBJECT_SCOPES,
} = require('../../../server/enrichment/_lib/source-identity');
const { reviewEvidence, eligibleFact } = require('../../../server/enrichment/_lib/trusted-evidence');
const { buildEvidenceBundle } = require('../../../server/enrichment/_lib/evidence-extractor');

/**
 * P0 Venue Source Integrity — Phase 2: reproduce the defect before fixing it.
 *
 * Production serves facility facts read off a DIFFERENT venue's page. Tate Britain and Tate Modern
 * each serve three facts from the Tate Liverpool page; the South Kensington V&A serves a toilets
 * fact from the Wedgwood Collection in Stoke-on-Trent.
 *
 * Root cause, in one line: `findRelevantLinks` scoped the crawl with
 *
 *     if (resolved.hostname !== base.hostname) continue;
 *
 * bounded by HOST, never by VENUE -- and 16 domains carry more than one catalogue venue.
 *
 * This file began as characterisation, pinning what the code did wrong. The assertions below are
 * the same cases INVERTED by the fix, so the behaviour change is legible in the diff rather than
 * asserted in a commit message. Everything is driven by the real crawl production performed,
 * replayed from a checksummed corpus, so none of it rests on a fixture invented to make a point.
 *
 * The governing principle, set by the product owner: unknown is preferable to confidently wrong.
 * Withheld evidence is never marked false and never deleted.
 */

const CORPUS_DIR = path.join(__dirname, '../../../docs/snapshots/venue-source-integrity-2026-09-26');

type CrawlRow = { venue: string; venueWebsite: string; sourceUrl: string; pageTitle: string };

function loadCrawlScope(): CrawlRow[] {
  const raw = fs.readFileSync(path.join(CORPUS_DIR, 'crawl-scope.txt'), 'utf8');
  return raw
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line !== '')
    .map((line: string) => {
      // The page title may itself contain the separator ("... | Tate"), so split only the first
      // three fields and keep the remainder intact.
      const parts = line.split('|');
      if (parts.length < 4) throw new Error(`crawl-scope: expected at least 4 fields, got ${parts.length}`);
      const [venue, venueWebsite, sourceUrl, ...titleParts] = parts;
      return { venue, venueWebsite, sourceUrl, pageTitle: titleParts.join('|').trim() };
    });
}

const CRAWL = loadCrawlScope();

/** Path of a URL, lowercased, no query, no trailing slash. */
const pathOf = (url: string) =>
  String(url).split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '').toLowerCase();

describe('the crawl corpus is the one production actually produced', () => {
  it('replays byte-for-byte from the checksummed snapshot', () => {
    const raw = fs.readFileSync(path.join(CORPUS_DIR, 'crawl-scope.txt'), 'utf8');
    expect(crypto.createHash('md5').update(raw.replace(/\n$/, '')).digest('hex'))
      .toBe('727f04b3837545b1c6d0c1ead63f4f09');
    expect(CRAWL).toHaveLength(48);
    // Every row carries the title the page gives itself. That matters: it is the signal the
    // pipeline already stores and has never once consulted.
    expect(CRAWL.every((r) => r.pageTitle !== '')).toBe(true);
  });
});

/** The catalogue as the fix consumes it, built from the real websites in the corpus. */
const CATALOGUE = [...new Map(
  CRAWL.map((r) => [r.venue, { familypilotPlaceId: r.venue, name: r.venue, website: r.venueWebsite }]),
).values()];

const venueOf = (name: string) => CATALOGUE.find((v) => v.familypilotPlaceId === name)!;
const scopeOf = (venue: string, sourceUrl: string, pageTitle: string | null = null) =>
  classifySubjectScope({ sourceUrl, pageTitle, venue: venueOf(venue), catalogue: CATALOGUE });

describe('FIXED 1: candidate pages are rooted at the venue, not the origin', () => {
  it('asks tate.org.uk only under /visit/tate-britain when crawling Tate Britain', () => {
    const candidates = buildCommonPathCandidates('https://www.tate.org.uk/visit/tate-britain', 20)
      .map((c: { url: string }) => c.url);
    expect(candidates).toContain('https://www.tate.org.uk/visit/tate-britain/accessibility');
    // The organisation-level guesses that produced 315 of the 835 stored rows are gone.
    expect(candidates).not.toContain('https://www.tate.org.uk/visit');
    expect(candidates).not.toContain('https://www.tate.org.uk/accessibility');
    expect(candidates.every((u: string) => u.includes('/visit/tate-britain/'))).toBe(true);
  });

  it('leaves a venue that owns its whole host exactly as it was', () => {
    // 128 of 134 venues are in this shape, so the fix must be inert for them.
    const candidates = buildCommonPathCandidates('https://www.horniman.ac.uk/', 20)
      .map((c: { url: string }) => c.url);
    expect(candidates).toContain('https://www.horniman.ac.uk/visit');
    expect(candidates).toContain('https://www.horniman.ac.uk/accessibility');
  });
});

describe('FIXED 2: link-following is scoped to the venue', () => {
  const tateNav = `
    <a href="/visit/tate-britain">Tate Britain</a>
    <a href="/visit/tate-modern">Tate Modern</a>
    <a href="/visit/tate-liverpool">Tate Liverpool</a>
    <a href="/visit/accessibility">Accessibility</a>
  `;

  it('still discovers the sibling link, and refuses to queue it', () => {
    // The anchor is genuinely on the page; the fix is a decision, not blindness.
    expect(findRelevantLinks(tateNav, 'https://www.tate.org.uk/visit/tate-britain', 30)
      .map((l: { url: string }) => l.url)).toContain('https://www.tate.org.uk/visit/tate-modern');

    const { pages, reserveCandidates, diagnostics } = mergePageCandidates(
      'https://www.tate.org.uk/visit/tate-britain', [], tateNav, 5,
      { venue: venueOf('Tate Britain'), catalogue: CATALOGUE },
    );
    const queued = [...pages, ...reserveCandidates].map((p: { url: string }) => p.url);
    expect(queued).not.toContain('https://www.tate.org.uk/visit/tate-modern');
    expect(diagnostics.linksRejectedAsOtherVenue.map((r: { url: string }) => r.url))
      .toContain('https://www.tate.org.uk/visit/tate-modern');
  });

  it('still fetches a non-catalogue sibling, so the evidence exists to audit and withhold', () => {
    // Tate Liverpool is not a catalogue venue, so discovery cannot prove it foreign. It is fetched
    // and then withheld on recorded provenance -- retained, not condemned.
    const { pages, reserveCandidates } = mergePageCandidates(
      'https://www.tate.org.uk/visit/tate-britain', [], tateNav, 5,
      { venue: venueOf('Tate Britain'), catalogue: CATALOGUE },
    );
    expect([...pages, ...reserveCandidates].map((p: { url: string }) => p.url))
      .toContain('https://www.tate.org.uk/visit/tate-liverpool');
    expect(scopeOf('Tate Britain', 'https://www.tate.org.uk/visit/tate-liverpool').scope)
      .toBe('sibling_unverified');
  });

  it('is inert when no venue context is supplied, so callers migrate one at a time', () => {
    const { diagnostics } = mergePageCandidates(
      'https://www.tate.org.uk/visit/tate-britain', [], tateNav, 5,
    );
    expect(diagnostics.linksRejectedAsOtherVenue).toEqual([]);
  });
});

describe('FIXED 3: the three named failures cannot support a claim', () => {
  it.each([
    ['Tate Britain', 'https://www.tate.org.uk/visit/tate-liverpool', 'Tate Liverpool + RIBA North | Tate'],
    ['Tate Modern', 'https://www.tate.org.uk/visit/tate-liverpool', 'Tate Liverpool + RIBA North | Tate'],
    ['Victoria and Albert Museum', 'https://www.vam.ac.uk/wedgwood/visit', 'Visit V&A Wedgwood Collection'],
  ])('%s cannot be supported by %s', (venue, sourceUrl, pageTitle) => {
    const verdict = scopeOf(venue as string, sourceUrl as string, pageTitle as string);
    expect(isEligibleScope(verdict.scope)).toBe(false);
  });

  it('withholds rather than condemns: the verdict is unestablished, not false', () => {
    const verdict = scopeOf('Tate Britain', 'https://www.tate.org.uk/visit/tate-liverpool',
      'Tate Liverpool + RIBA North | Tate');
    expect(verdict.scope).toBe('sibling_unverified');
    expect(SUBJECT_SCOPES).toContain(verdict.scope);
    // There is no "false", "invalid" or "rejected" state. The page may be perfectly good; we
    // simply cannot place it, and a later shared/operator model is expected to recover much of it.
    expect(SUBJECT_SCOPES).not.toContain('false');
    expect(SUBJECT_SCOPES).not.toContain('invalid');
  });
});

describe('FIXED 4: legitimate evidence keeps working', () => {
  it('every own-subtree page in the real crawl stays eligible', () => {
    const own = CRAWL.filter((r) => isEligibleScope(scopeOf(r.venue, r.sourceUrl, r.pageTitle).scope));
    // 16 own-subtree plus the 3 RMG venue-named accessibility pages.
    expect(own).toHaveLength(19);
    expect(own.filter((r) => pathOf(r.sourceUrl).startsWith(pathOf(r.venueWebsite)))).toHaveLength(16);
  });

  it("keeps a venue's own deeper page", () => {
    expect(scopeOf('Flip Out Watford',
      'https://www.flipout.co.uk/locations/watford/frequently-asked-questions',
      'Frequently Asked Questions About Flip Out Watford | FAQs').scope).toBe('venue_own_subtree');
  });

  it('keeps the RMG per-venue accessibility pages, which name the venue in URL and title', () => {
    for (const [venue, url, title] of [
      ['Cutty Sark', 'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark',
        'Accessibility at Cutty Sark | Royal Museums Greenwich'],
      ['National Maritime Museum', 'https://www.rmg.co.uk/plan-your-visit/accessibility-national-maritime-museum',
        'Accessibility at the National Maritime Museum | Royal Museums Greenwich'],
      ["Queen's House", 'https://www.rmg.co.uk/plan-your-visit/accessibility-queens-house',
        "Accessibility at the Queen's House | Royal Museums Greenwich"],
    ]) {
      const verdict = scopeOf(venue, url, title);
      expect([venue, verdict.scope]).toEqual([venue, 'venue_named_page']);
      expect(isEligibleScope(verdict.scope)).toBe(true);
    }
  });

  it('withholds the RMG organisation-wide page, which names no single venue', () => {
    expect(scopeOf('Cutty Sark', 'https://www.rmg.co.uk/plan-your-visit/facilities-access',
      'Accessibility at Royal Museums Greenwich | Royal Museums Greenwich').scope)
      .toBe('sibling_unverified');
  });
});

describe('FIXED 5: title corroboration cannot manufacture identity on its own', () => {
  it('refuses a page whose title names the venue but whose URL does not', () => {
    // The whole failure mode this guards: a nav blurb or a cross-link mentioning the venue must
    // not be able to launder an unrelated page into trusted venue evidence.
    const verdict = scopeOf('Cutty Sark', 'https://www.rmg.co.uk/plan-your-visit/facilities-access',
      'Accessibility at Cutty Sark | Royal Museums Greenwich');
    expect(verdict.scope).toBe('sibling_unverified');
    expect(isEligibleScope(verdict.scope)).toBe(false);
  });

  it('refuses a page whose URL names the venue but whose title does not', () => {
    expect(scopeOf('Cutty Sark', 'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark', null).scope)
      .toBe('sibling_unverified');
    expect(scopeOf('Cutty Sark', 'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark',
      'Plan Your Visit to Royal Museums Greenwich').scope).toBe('sibling_unverified');
  });

  it('refuses a page that names two catalogue venues at once', () => {
    expect(scopeOf('Cutty Sark',
      'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark-and-queens-house',
      "Accessibility at Cutty Sark and the Queen's House").scope).toBe('sibling_unverified');
  });

  it('can only ever promote, never demote', () => {
    // A title claiming a different venue cannot take away a structural own-subtree verdict; the
    // text rule is one-directional by construction, so a matching mistake cannot cause leakage.
    expect(scopeOf('Tate Britain', 'https://www.tate.org.uk/visit/tate-britain',
      'Tate Liverpool + RIBA North | Tate').scope).toBe('venue_own_subtree');
  });
});

describe('FIXED 6: adversarial cases on shared domains', () => {
  it('a duplicate catalogue row sharing one website does not reject the whole site', () => {
    // wbstudiotour.co.uk really does carry two catalogue rows with the identical website. A naive
    // "is this under another venue's site?" rule rejects every page of it for both venues.
    const duplicates = [
      { familypilotPlaceId: 'hp', name: 'Harry Potter Studio', website: 'https://www.wbstudiotour.co.uk/' },
      { familypilotPlaceId: 'wb', name: 'Warner Bros. Studio Tour London', website: 'https://www.wbstudiotour.co.uk/' },
    ];
    for (const venue of duplicates) {
      const verdict = classifySubjectScope({
        sourceUrl: 'https://www.wbstudiotour.co.uk/plan-your-visit/facilities/',
        pageTitle: 'Facilities', venue, catalogue: duplicates,
      });
      expect([venue.familypilotPlaceId, verdict.scope]).toEqual([venue.familypilotPlaceId, 'venue_own_subtree']);
    }
  });

  it('a nested venue inside a parent venue belongs to the nested one', () => {
    // Horniman Museum's website is the bare origin; the Butterfly House is a catalogue venue
    // beneath it. The more specific site must win in both directions.
    const horniman = [
      { familypilotPlaceId: 'museum', name: 'Horniman Museum and Gardens', website: 'https://www.horniman.ac.uk/' },
      { familypilotPlaceId: 'butterfly', name: 'Horniman Butterfly House', website: 'http://www.horniman.ac.uk/visit/displays/butterfly-house' },
    ];
    const asMuseum = classifySubjectScope({
      sourceUrl: 'https://www.horniman.ac.uk/visit/displays/butterfly-house',
      venue: horniman[0], catalogue: horniman,
    });
    expect(asMuseum.scope).toBe('other_catalogue_venue');
    expect(asMuseum.ownedBy).toBe('butterfly');

    const asButterfly = classifySubjectScope({
      sourceUrl: 'https://www.horniman.ac.uk/visit/displays/butterfly-house',
      venue: horniman[1], catalogue: horniman,
    });
    expect(asButterfly.scope).toBe('venue_own_subtree');

    // And the museum keeps its own general pages.
    expect(classifySubjectScope({
      sourceUrl: 'https://www.horniman.ac.uk/plan-your-visit/',
      venue: horniman[0], catalogue: horniman,
    }).scope).toBe('venue_own_subtree');
  });

  it('an operator page above the venue is recorded as such, and still withheld', () => {
    const verdict = scopeOf('Tate Britain', 'https://www.tate.org.uk/visit', 'Plan Your Visit | Tate');
    expect(verdict.scope).toBe('organisation_ancestor');
    // Applicability to this specific venue is not established, so it fails closed for now.
    expect(isEligibleScope(verdict.scope)).toBe(false);
  });

  it('an off-host page owned by another catalogue venue is still caught', () => {
    const cat = [
      { familypilotPlaceId: 'a', name: 'Venue A', website: 'https://a.example/' },
      { familypilotPlaceId: 'b', name: 'Venue B', website: 'https://b.example/site' },
    ];
    expect(classifySubjectScope({ sourceUrl: 'https://b.example/site/faq', venue: cat[0], catalogue: cat }).scope)
      .toBe('other_catalogue_venue');
  });

  it('a missing website or URL fails closed rather than defaulting to trusted', () => {
    const cat = [{ familypilotPlaceId: 'a', name: 'Venue A', website: null }];
    expect(classifySubjectScope({ sourceUrl: 'https://a.example/x', venue: cat[0], catalogue: cat }).scope)
      .toBe('sibling_unverified');
    expect(classifySubjectScope({ sourceUrl: null, venue: { familypilotPlaceId: 'a', website: 'https://a.example/' }, catalogue: cat }).scope)
      .toBe('sibling_unverified');
  });

  it('every row of the real crawl lands in a declared scope', () => {
    for (const row of CRAWL) {
      expect(SUBJECT_SCOPES).toContain(scopeOf(row.venue, row.sourceUrl, row.pageTitle).scope);
    }
  });
});

describe('FIXED 7: the publication gate fails closed on unestablished provenance', () => {
  const fact = (sourceUrl: string) => ({
    field: 'toilets', value: 'yes', confidence: 'high',
    evidenceText: 'Toilets are available on the ground floor near the entrance.',
    sourceUrl, sourceType: 'visitor_info', retrievedAt: new Date().toISOString(),
  });
  const bundle = (sourceUrl: string, subjectScope: string | null) => ({
    venueId: 'v', sourceStatus: 'official_website', pagesChecked: 1, cacheHits: 0,
    facts: [fact(sourceUrl)],
    sources: [{
      url: sourceUrl, sourceType: 'visitor_info', fetchStatus: 'ok',
      retrievedAt: new Date().toISOString(), subjectScope, facts: [fact(sourceUrl)],
    }],
  });

  it('publishes a fact whose page is the venue\'s own', () => {
    const review = reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-britain', 'venue_own_subtree'));
    expect(review.eligible).toBe(true);
    expect(review.payload.familyFacilities.toilets).toBe('yes');
  });

  it('refuses the same fact when the page is another catalogue venue\'s', () => {
    const review = reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-modern', 'other_catalogue_venue'));
    expect(review.eligible).toBe(false);
    expect(review.reason).toBe('withheld_source_identity_unestablished');
    expect(review.withheld).toEqual([{
      field: 'familyFacilities.toilets',
      sourceUrl: 'https://www.tate.org.uk/visit/tate-modern',
      subjectScope: 'other_catalogue_venue',
    }]);
  });

  it('refuses it when the relationship was never established', () => {
    expect(reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-liverpool', 'sibling_unverified')).eligible)
      .toBe(false);
  });

  it('refuses it on a row stored before provenance existed, rather than assuming the best', () => {
    // Every one of the 835 rows already in production has a null scope. Null must fail closed.
    expect(reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-liverpool', null)).eligible).toBe(false);
    expect(eligibleFact(fact('https://x.example/p'), bundle('https://x.example/p', null))).toBe(false);
  });

  it('records what it withheld instead of silently dropping it', () => {
    const review = reviewEvidence(bundle('https://www.vam.ac.uk/wedgwood/visit', 'sibling_unverified'));
    expect(review.withheld).toHaveLength(1);
    expect(review.withheld[0].subjectScope).toBe('sibling_unverified');
  });

  /**
   * The one place enforcement is deliberately off. `reconcileSourceClaims` DISPUTES live claims,
   * and `familypilot-automatic-enrichment` runs every minute, so enforcing there would repair
   * production within the hour with nobody having approved it. Repair is Phase 6.
   */
  it('leaves reconciliation unenforced, so a deploy cannot silently repair production', () => {
    expect(reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-liverpool', null),
      { enforceSubjectScope: false }).eligible).toBe(true);
    const autoApprove = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/auto-approve.js'), 'utf8');
    expect(autoApprove).toContain('reviewEvidence(bundle, {enforceSubjectScope:false})');
  });
});

describe('FIXED 8: provenance survives every boundary it crosses', () => {
  /**
   * Found by the existing auto-approve suite while implementing this, and worth its own test
   * because of how it failed. `buildEvidenceBundle` rebuilds each source from a fixed list of
   * keys, so it silently dropped `subjectScope` -- and because the gate fails closed, the effect
   * was that EVERY fact became ineligible, invisibly, for a reason nothing reported. Losing
   * provenance at a reshape boundary is the original defect in miniature.
   */
  it('buildEvidenceBundle carries subjectScope through the reshape', () => {
    const bundle = buildEvidenceBundle('v', [{
      url: 'https://example.org/visit', sourceType: 'visitor_info', fetchStatus: 'ok',
      retrievedAt: '2026-09-26T00:00:00Z', subjectScope: 'venue_own_subtree',
      subjectScopeReason: 'under_own_website', facts: [],
    }], 'official_website');
    expect(bundle.sources[0].subjectScope).toBe('venue_own_subtree');
    expect(bundle.sources[0].subjectScopeReason).toBe('under_own_website');
  });

  it('a source that never carried one reads as null, not as absent', () => {
    const bundle = buildEvidenceBundle('v', [{
      url: 'https://example.org/visit', sourceType: 'visitor_info', fetchStatus: 'ok',
      retrievedAt: '2026-09-26T00:00:00Z', facts: [],
    }], 'official_website');
    expect(bundle.sources[0].subjectScope).toBeNull();
    expect(isEligibleScope(bundle.sources[0].subjectScope)).toBe(false);
  });

  it('the evidence store round-trips the scope it was given', () => {
    const store = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/evidence-store.js'), 'utf8');
    expect(store).toContain('subject_scope: record.subjectScope');
    expect(store).toContain('subjectScope: row.subject_scope');
  });

  it('the pipeline classifies before it stores, not after', () => {
    const pipeline = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/evidence-pipeline.js'), 'utf8');
    expect(pipeline).toContain('classifySubjectScope');
    expect(pipeline).toContain('subjectScope: scope.scope');
    // A cached row predating the column must be reclassified, never inherited as null.
    expect(pipeline).toContain('cached.subjectScope');
  });
});

describe('FIXED 9: only discriminating words count as a venue name', () => {
  /**
   * `nameTokens` keeps words of four characters or more. Short words carry no identifying weight,
   * and requiring them would block legitimate pages: "The Regent's Park" would demand that a page
   * contain "the" and "s" as well as "regent" and "park". A mutation dropping the threshold to one
   * character survived the suite until this test existed.
   */
  it('drops articles and possessive fragments from a venue name', () => {
    expect(nameTokens("The Regent's Park")).toEqual(['regent', 'park']);
    expect(nameTokens("Queen's House")).toEqual(['queen', 'house']);
  });

  it('promotes a page the venue owns despite the name containing short words', () => {
    const cat = [{ familypilotPlaceId: 'rp', name: "The Regent's Park", website: 'https://www.royalparks.org.uk/visit/parks/regents-park-primrose-hill' }];
    expect(classifySubjectScope({
      sourceUrl: 'https://www.royalparks.org.uk/parks/regents-park',
      pageTitle: "Regent's Park | The Royal Parks",
      venue: cat[0], catalogue: cat,
    }).scope).toBe('venue_named_page');
  });

  it('a name with no discriminating word can never promote anything', () => {
    // Failing to promote is the safe direction, so an unusable name withholds rather than guesses.
    const cat = [{ familypilotPlaceId: 'x', name: 'The Inn', website: 'https://host.example/a/b' }];
    expect(nameTokens('The Inn')).toEqual([]);
    expect(classifySubjectScope({
      sourceUrl: 'https://host.example/c/the-inn', pageTitle: 'The Inn', venue: cat[0], catalogue: cat,
    }).scope).toBe('sibling_unverified');
  });

  it('another venue only blocks promotion when named as strongly as this one', () => {
    /**
     * Found by an independent SQL count disagreeing with this module, 153 against 145. Accepting
     * either signal made the exclusion a veto: Burgess Park's OWN council page, titled "Burgess
     * Park | Southwark Council", was withheld because "Southwark Park" is in the catalogue and its
     * two tokens turned up across the title.
     */
    const cat = [
      { familypilotPlaceId: 'burgess', name: 'Burgess Park', website: 'https://www.southwark.gov.uk/parks-and-open-spaces/parks/burgess-park' },
      { familypilotPlaceId: 'southwark', name: 'Southwark Park', website: 'https://www.southwark.gov.uk/parks-and-open-spaces/parks/southwark-park' },
    ];
    expect(classifySubjectScope({
      sourceUrl: 'https://www.southwark.gov.uk/culture-and-sport/parks-and-open-spaces/find-park/burgess-park',
      pageTitle: 'Burgess Park | Southwark Council', venue: cat[0], catalogue: cat,
    }).scope).toBe('venue_named_page');

    // And a page that genuinely names both, in both places, is still withheld.
    expect(classifySubjectScope({
      sourceUrl: 'https://www.southwark.gov.uk/parks/burgess-park-and-southwark-park',
      pageTitle: 'Burgess Park and Southwark Park | Southwark Council', venue: cat[0], catalogue: cat,
    }).scope).toBe('sibling_unverified');
  });
});

describe('FIXED 10: promotion cannot reach across hosts or be vetoed by a vaguer name', () => {
  /**
   * Both found by replaying all 223 active claims through this module and comparing the result
   * with an independently written SQL port. The two disagreed on four claims; each disagreement
   * was a real defect in one implementation, not a rounding difference.
   */
  it('refuses to promote a page on a different host, however well it names the venue', () => {
    // Heartwood Forest's site is a subdomain; the Woodland Trust's main site carries a page titled
    // "Heartwood Forest - Visiting Woods - Woodland Trust". Naming alone, across hosts, is exactly
    // the open-web similarity matching that must not be able to manufacture venue identity.
    const cat = [{ familypilotPlaceId: 'hw', name: 'Heartwood Forest', website: 'https://heartwood.woodlandtrust.org.uk/' }];
    const verdict = classifySubjectScope({
      sourceUrl: 'https://www.woodlandtrust.org.uk/visiting-woods/woods/heartwood-forest/',
      pageTitle: 'Heartwood Forest - Visiting Woods - Woodland Trust',
      venue: cat[0], catalogue: cat,
    });
    expect(verdict.scope).toBe('sibling_unverified');
    expect(verdict.reason).toBe('different_host');
  });

  it('ignores a catalogue venue whose name is less specific than this one', () => {
    /**
     * "London Eye" reduces to the single token `london`, because `eye` is under the length
     * threshold. That token appears in London Fields' own council page, so the exclusion vetoed
     * three of its claims. A name whose tokens are a subset of this venue's describes the same
     * text more weakly; it is not a competing claim to it.
     */
    const cat = [
      { familypilotPlaceId: 'lf', name: 'London Fields', website: 'https://hackney.gov.uk/london-fields' },
      { familypilotPlaceId: 'eye', name: 'London Eye', website: 'https://www.londoneye.com/' },
      { familypilotPlaceId: 'zoo', name: 'London Zoo', website: 'https://www.londonzoo.org/' },
    ];
    expect(classifySubjectScope({
      sourceUrl: 'https://www.hackney.gov.uk/libraries-parks-and-leisure/parks-and-green-spaces/parks-list/london-fields',
      pageTitle: 'London Fields | Hackney Council', venue: cat[0], catalogue: cat,
    }).scope).toBe('venue_named_page');
  });

  it('still blocks a genuinely competing name of equal specificity', () => {
    const cat = [
      { familypilotPlaceId: 'cs', name: 'Cutty Sark', website: 'https://www.rmg.co.uk/cutty-sark' },
      { familypilotPlaceId: 'qh', name: "Queen's House", website: 'https://www.rmg.co.uk/queens-house' },
    ];
    expect(classifySubjectScope({
      sourceUrl: 'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark-and-queens-house',
      pageTitle: "Accessibility at Cutty Sark and the Queen's House", venue: cat[0], catalogue: cat,
    }).scope).toBe('sibling_unverified');
  });
});
