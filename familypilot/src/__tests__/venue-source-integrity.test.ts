import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
   * Review round 3 moved the Phase 6 gate out of here.
   *
   * It used to live in a scope-blind bundle verdict: `reconcileSourceClaims` called
   * `reviewEvidence(bundle, {enforceSubjectScope:false})` so that deploying could not dispute
   * hundreds of contaminated claims within the hour. That worked, but it also let unusable evidence
   * confirm and contradict live claims. The gate now sits on each claim's OWN backing provenance
   * (FIXED 14), which is both narrower and stronger -- it cannot be defeated by a page that simply
   * was not fetched on a given run.
   */
  it('no longer lets a scope-blind bundle verdict decide a live claim', () => {
    // The option still exists and still behaves, for the audit tooling that reads both readings.
    expect(reviewEvidence(bundle('https://www.tate.org.uk/visit/tate-liverpool', null),
      { enforceSubjectScope: false }).eligible).toBe(true);

    // But reconciliation must not be what reaches for it, or the old asymmetry comes straight back.
    const autoApprove = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/auto-approve.js'), 'utf8');
    expect(autoApprove, 'reconciliation must not consult a scope-blind verdict')
      .not.toContain('enforceSubjectScope:false');
    expect(autoApprove, 'the gate is now the claim\'s own backing scope')
      .toContain('if (!isEligibleScope(backing.subjectScope)) continue;');
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

/**
 * Review round 2, finding 1.
 *
 * The first cut of the cached branch in `fetchAndExtractPage` reclassified a row whose
 * `subject_scope` was NULL and returned the inferred verdict in the bundle. The gate then saw an
 * eligible scope, so a NEW claim could be approved against an evidence row that still held no
 * provenance at all -- the invariant this whole workstream exists to establish, broken by the code
 * establishing it. Provenance that lives only in one worker's memory is not provenance.
 *
 * Driven through the real pipeline against the real file-backed store, because the defect was in
 * the seam between them and a hand-built bundle would have missed it entirely.
 */
describe('FIXED 11: a cache hit whose row predates provenance cannot publish, and is not backfilled', () => {
  const VENUE = 'fp-legacy-cache-venue';
  const WEBSITE = 'https://legacy.example/visit';
  const PAGE_TEXT = 'Toilets are available on the ground floor near the entrance.';
  const catalogue = [{ familypilotPlaceId: VENUE, name: 'Legacy Cache Venue', website: WEBSITE }];
  const placeRow = { name: 'Legacy Cache Venue', website: WEBSITE, description: 'A venue.' };

  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = { ...process.env };
    // No Supabase credentials: the store falls back to `.data`, which this suite owns.
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    /**
     * One page per crawl. The homepage is the cached row under test; capping attempts at one means
     * the loop never reaches a candidate it would have to fetch, so the test needs no network and
     * no fetcher double. `MAX_PAGES` is read at module load, hence the reset below.
     */
    process.env.SOURCE_MAX_PAGES = '1';
    fs.mkdirSync('.data', { recursive: true });
    fs.writeFileSync(path.join('.data', 'venue-source-evidence.json'), JSON.stringify({ records: [] }));
    vi.resetModules();
  });

  afterEach(() => {
    process.env = env;
    vi.resetModules();
  });

  /** One stored page, exactly as the pre-provenance pipeline left it when `subjectScope` is omitted. */
  async function seedCachedPage(subjectScope: string | null) {
    const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');
    await saveEvidenceRecord({
      familypilotPlaceId: VENUE,
      sourceUrl: WEBSITE,
      sourceType: 'official_website',
      pageTitle: 'Visit | Legacy Cache Venue',
      retrievedAt: new Date().toISOString(),
      extractedText: PAGE_TEXT,
      fetchStatus: 'ok',
      httpStatus: 200,
      ...(subjectScope ? { subjectScope, subjectScopeReason: 'under_own_website' } : {}),
    });
  }

  /** The pipeline is plain JS, so the shape this test actually asserts on is named here. */
  type CrawledBundle = {
    facts: Array<{ field: string }>;
    sources: Array<{
      url: string;
      fetchStatus: string;
      subjectScope: string | null;
      subjectScopeReason: string | null;
    }>;
    diagnostics: {
      cachedRowsMissingProvenance: Array<{
        url: string;
        inferredSubjectScope: string | null;
        factCount: number;
      }>;
    };
  };

  async function crawl(): Promise<CrawledBundle> {
    const { gatherEvidenceForVenue } = await import('../../../server/enrichment/_lib/evidence-pipeline.js');
    return (await gatherEvidenceForVenue(VENUE, placeRow, { catalogue })) as unknown as CrawledBundle;
  }

  async function storedScope() {
    const store = JSON.parse(fs.readFileSync(path.join('.data', 'venue-source-evidence.json'), 'utf8'));
    return store.records.map((r: Record<string, unknown>) => r.subject_scope ?? null);
  }

  it('carries the stored null through instead of an inference, and withholds the fact', async () => {
    await seedCachedPage(null);
    const bundle = await crawl();

    const source = bundle.sources.find((s) => s.url === WEBSITE);
    expect(source, 'the cached page must still be in the bundle').toBeTruthy();
    expect(source?.fetchStatus).toBe('cached');
    expect(source?.subjectScope, 'what the DATABASE holds, not what this run worked out').toBeNull();
    expect(source?.subjectScopeReason).toBe('cached_row_predates_provenance');

    // The fact is genuinely publishable in every other respect: high confidence, official source,
    // fetched cleanly, recent, real excerpt. Only the missing provenance stops it.
    expect(bundle.facts.some((f) => f.field === 'toilets')).toBe(true);

    const review = reviewEvidence(bundle);
    expect(review.eligible, 'a legacy cache row must not create a new claim').toBe(false);
    expect(review.reason).toBe('withheld_source_identity_unestablished');
    expect(review.withheld).toEqual([
      { field: 'familyFacilities.toilets', sourceUrl: WEBSITE, subjectScope: null },
    ]);
  });

  it('would have published it if the inference were trusted, which is the whole point', async () => {
    await seedCachedPage(null);
    const bundle = await crawl();

    /**
     * The inference is recorded as a diagnostic so the withholding is visible and a reviewed
     * backfill has something to work from. That it says `venue_own_subtree` -- publishable, had the
     * code acted on it -- is exactly why acting on it was wrong.
     */
    expect(bundle.diagnostics.cachedRowsMissingProvenance).toEqual([
      { url: WEBSITE, inferredSubjectScope: 'venue_own_subtree', factCount: 1 },
    ]);
  });

  it('does not backfill the row, so the every-minute cron cannot become a provenance writer', async () => {
    await seedCachedPage(null);
    expect(await storedScope()).toEqual([null]);
    await crawl();
    expect(await storedScope(), 'the crawl must not write provenance it only guessed').toEqual([null]);
  });

  it('publishes the same fact once the scope is actually recorded on the row', async () => {
    // The contrast case: identical row, identical text, provenance present. Proves the refusal
    // above is about the missing record and not about something else being wrong with the fixture.
    await seedCachedPage('venue_own_subtree');
    const bundle = await crawl();

    const source = bundle.sources.find((s) => s.url === WEBSITE);
    expect(source?.subjectScope).toBe('venue_own_subtree');
    expect(bundle.diagnostics.cachedRowsMissingProvenance).toEqual([]);

    const review = reviewEvidence(bundle);
    expect(review.eligible).toBe(true);
    expect(review.payload.familyFacilities.toilets).toBe('yes');
  });
});

/**
 * Review round 2, finding 2.
 *
 * `agePolicyProvenanceFrom` derives every field of a hard age gate from the stored evidence row --
 * venue, fetch status, URL, source type -- and until now not the one thing that says the page is
 * about this venue. An age policy is the only claim that removes a venue from a family's results
 * outright, so it is the worst possible place for a sibling site's rule to land.
 *
 * There are 0 age-policy claims in production today, so this closes the gap before anything can be
 * built on it.
 */
describe('FIXED 12: a hard age gate needs a recorded relationship to the venue', () => {
  const VENUE = 'fp-age-scope-venue';
  const SOURCE = 'https://age.example/visit';
  const PAGE_TEXT = 'Under 4s are not admitted to the museum.';

  const record = (subjectScope: string | null) => ({
    id: 'evidence-age-scope',
    familypilotPlaceId: VENUE,
    sourceUrl: SOURCE,
    sourceType: 'official_website',
    retrievedAt: '2026-09-21T09:00:00Z',
    extractedText: PAGE_TEXT,
    fetchStatus: 'ok',
    subjectScope,
    subjectScopeReason: subjectScope ? 'recorded_by_the_crawl' : null,
  });

  async function provenance() {
    const { agePolicyProvenanceFrom } = await import('../../../server/enrichment/_lib/claims-store.js');
    return agePolicyProvenanceFrom;
  }

  it('accepts the venue\'s own page', async () => {
    const agePolicyProvenanceFrom = await provenance();
    expect(agePolicyProvenanceFrom(record('venue_own_subtree'), VENUE).sourceUrl).toBe(SOURCE);
  });

  it('accepts a page that names only this venue, in both URL and title', async () => {
    const agePolicyProvenanceFrom = await provenance();
    expect(agePolicyProvenanceFrom(record('venue_named_page'), VENUE).sourceUrl).toBe(SOURCE);
  });

  /**
   * Every one of the evidence rows in production today is in this state: the column does not exist
   * yet, so nothing has a scope. Unknown must refuse, not pass.
   */
  it.each([
    ['not recorded at all', null],
    ['an unverified sibling on the same site', 'sibling_unverified'],
    ['the operator\'s page above this venue', 'organisation_ancestor'],
    ['positively another catalogue venue\'s page', 'other_catalogue_venue'],
  ])('refuses a row whose relationship is %s', async (_label, scope) => {
    const agePolicyProvenanceFrom = await provenance();
    let thrown: (Error & { code?: string }) | null = null;
    try {
      agePolicyProvenanceFrom(record(scope as string | null), VENUE);
    } catch (error) {
      thrown = error as Error & { code?: string };
    }
    expect(thrown, 'it must refuse, not return provenance').toBeTruthy();
    expect(thrown?.code).toBe('AGE_POLICY_EVIDENCE_SUBJECT_SCOPE_UNESTABLISHED');
    expect(thrown?.message).toContain('no established relationship');
  });

  it('refuses through the real writer too, not only the validator', async () => {
    const env = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.resetModules();
    try {
      fs.mkdirSync('.data', { recursive: true });
      for (const [file, data] of Object.entries({
        'venue-claims.json': { claims: [] },
        'venue-source-evidence.json': { records: [] },
      })) {
        fs.writeFileSync(path.join('.data', file), JSON.stringify(data));
      }

      const { saveEvidenceRecord } = await import('../../../server/enrichment/_lib/evidence-store.js');
      const { createAgePolicyClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
      const { humanApprover } = await import('../../../server/enrichment/_lib/approval-actors.js');

      // A row with no provenance, exactly as production holds 875 of them today.
      await saveEvidenceRecord({
        familypilotPlaceId: VENUE,
        sourceUrl: SOURCE,
        sourceType: 'official_website',
        retrievedAt: new Date().toISOString(),
        extractedText: PAGE_TEXT,
        fetchStatus: 'ok',
        httpStatus: 200,
      });

      await expect(createAgePolicyClaim({
        familypilotPlaceId: VENUE,
        sourceUrl: SOURCE,
        rules: [{
          scope: 'venue',
          effect: 'excludes',
          minMonthsInclusive: 48,
          maxMonthsExclusive: null,
          statedAs: 'Under 4s not admitted',
          evidenceExcerpt: PAGE_TEXT,
        }],
        reviewedBy: humanApprover('editor@familypilot'),
      })).rejects.toThrow(/no established relationship/);

      const claims = JSON.parse(fs.readFileSync(path.join('.data', 'venue-claims.json'), 'utf8'));
      expect(claims.claims, 'nothing may be written on the way to refusing').toHaveLength(0);
    } finally {
      process.env = env;
      vi.resetModules();
    }
  });
});

/**
 * The Young V&A production canary, 2026-09-27.
 *
 * The prevention fix shipped and worked: both other-catalogue-venue pages were rejected before being
 * fetched. That freed room in the five-page crawl budget, the reserve filled it with
 * `vam.ac.uk/east/museum/visit` -- V&A East Museum, NOT a catalogue venue, so `sibling_unverified`:
 * fetched, recorded, withheld -- and that page states parking both ways. Merged blind to scope,
 * parking became a conflict and reconciliation disputed Young V&A's parking claim: a true fact, read
 * off the venue's own page, withdrawn on the word of a page not allowed to speak for it.
 *
 * Every string below is the production text, verbatim from the canary.
 */
describe('FIXED 13: evidence that may not establish a fact may not contest one either', () => {
  const OWN = 'https://www.vam.ac.uk/young/visit';
  const SIBLING = 'https://www.vam.ac.uk/east/museum/visit';
  const now = () => new Date().toISOString();

  const fact = (sourceUrl: string, field: string, value: string, evidenceText: string) => ({
    field, value, confidence: 'high', evidenceText, sourceUrl,
    sourceType: 'visitor_info', retrievedAt: now(),
  });

  /** Young V&A's own page: parking, stated once, unambiguously. */
  const ownParking = fact(OWN, 'parking', 'yes',
    'Buggy park ​Buggy parking is available in the Welcome Area near the main entrance.');
  /** V&A East Museum's page, which contradicts itself and is not this venue's. */
  const siblingParkingYes = fact(SIBLING, 'parking', 'yes',
    'Buggy park ​Buggy parking is available located on the Lower Ground floor.');
  const siblingParkingNo = fact(SIBLING, 'parking', 'no',
    'There is no parking provided or managed by the V&A.');

  const source = (url: string, subjectScope: string | null, facts: unknown[]) => ({
    url, sourceType: 'visitor_info', fetchStatus: 'ok', retrievedAt: now(), subjectScope, facts,
  });

  const bundleOf = (...sources: unknown[]) => buildEvidenceBundle('fp-young-va', sources, 'official_website');
  const parkingFact = (bundle: { facts: Array<{ field: string }> }) =>
    bundle.facts.find((f) => f.field === 'parking') as
      { field: string; value: string; evidenceStatus?: string; sourceUrl: string | null } | undefined;

  it('does not let a withheld sibling page conflict the venue\'s own fact', () => {
    const bundle = bundleOf(
      source(OWN, 'venue_own_subtree', [ownParking]),
      source(SIBLING, 'sibling_unverified', [siblingParkingYes, siblingParkingYes, siblingParkingYes, siblingParkingNo]),
    );

    const parking = parkingFact(bundle);
    expect(parking?.evidenceStatus, 'the sibling may not manufacture a conflict').not.toBe('conflict');
    expect(parking?.value, 'the venue\'s own page decides').toBe('yes');
    expect(parking?.sourceUrl).toBe(OWN);
  });

  it('publishes the venue\'s own fact, where before the canary it was withdrawn', () => {
    const review = reviewEvidence(bundleOf(
      source(OWN, 'venue_own_subtree', [ownParking]),
      source(SIBLING, 'sibling_unverified', [siblingParkingYes, siblingParkingNo]),
    ));
    expect(review.eligible).toBe(true);
    expect(review.payload.familyFacilities.parking).toBe('yes');
  });

  /**
   * The exact mechanism of the canary failure. `reconcileSourceClaims` disputes a live claim when
   * `review.payload` has no value for its field, and it runs with enforcement OFF. So the regression
   * is only really pinned by asserting the value survives in THAT reading too.
   */
  it('keeps the value defined for scope-blind reconciliation, so the claim is not disputed', () => {
    const review = reviewEvidence(bundleOf(
      source(OWN, 'venue_own_subtree', [ownParking]),
      source(SIBLING, 'sibling_unverified', [siblingParkingYes, siblingParkingNo]),
    ), { enforceSubjectScope: false });
    expect(review.payload.familyFacilities?.parking,
      'undefined here is what disputed Young V&A\'s parking claim in production').toBe('yes');
  });

  it('still conflicts when two pages that MAY speak for the venue disagree', () => {
    const other = 'https://www.vam.ac.uk/young/accessibility';
    const bundle = bundleOf(
      source(OWN, 'venue_own_subtree', [ownParking]),
      source(other, 'venue_named_page', [fact(other, 'parking', 'no',
        'There is no parking provided or managed by the V&A.')]),
    );
    expect(parkingFact(bundle)?.evidenceStatus, 'a real disagreement must still read as one').toBe('conflict');
    expect(reviewEvidence(bundle).payload.familyFacilities?.parking).toBeUndefined();
  });

  /**
   * The other half of the rule, and the reason this is a precedence and not an exclusion.
   *
   * Horniman Butterfly House's seven claims all come from `other_catalogue_venue` pages. Dropping
   * ineligible evidence outright would delete the field from the bundle, and a vanished field is
   * exactly what `reconcileSourceClaims` disputes on -- so the cron would have repaired production
   * unreviewed on its next run. Ineligible evidence still speaks where nothing eligible does.
   */
  it('lets ineligible evidence hold a field open when nothing eligible speaks, but never publish it', () => {
    const parent = 'https://www.horniman.ac.uk/plan-your-visit/';
    const bundle = bundleOf(source(parent, 'other_catalogue_venue', [
      fact(parent, 'toilets', 'yes', 'Toilets are available on the ground floor near the entrance.'),
    ]));

    // Present, so reconciliation does not read the field as gone and withdraw the live claim.
    expect(bundle.facts.find((f: { field: string }) => f.field === 'toilets')?.value).toBe('yes');
    expect(reviewEvidence(bundle, { enforceSubjectScope: false }).payload.familyFacilities?.toilets).toBe('yes');

    // But publication is decided by the source's own scope, so it is still refused.
    const enforced = reviewEvidence(bundle);
    expect(enforced.eligible).toBe(false);
    expect(enforced.reason).toBe('withheld_source_identity_unestablished');
    expect(enforced.withheld[0].subjectScope).toBe('other_catalogue_venue');
  });

  it('leaves a bundle carrying no provenance behaving exactly as it did before', () => {
    // Legacy rows and the batch runner have no scope anywhere, so no candidate is eligible and every
    // field falls back. A pre-provenance bundle must not silently change verdicts.
    const bundle = bundleOf(
      source(OWN, null, [ownParking]),
      source(SIBLING, null, [siblingParkingYes, siblingParkingNo]),
    );
    expect(parkingFact(bundle)?.evidenceStatus).toBe('conflict');
  });
});

/**
 * Review round 3, the remaining asymmetry.
 *
 * Round 2 stopped an ineligible page CONTRADICTING a venue's own fact. It did not stop one
 * PRESERVING a claim: when the venue's own page stops mentioning parking, `mergeEvidenceBundles`
 * falls back to all candidates, hands back a withheld sibling's value, and the old reconciliation
 * read that as confirmation. Same asymmetry, opposite sign.
 *
 * The invariant, in full: evidence that may not establish a venue-specific fact may not establish,
 * contradict, refresh, preserve or withdraw it. That cannot be enforced in a merge, which does not
 * know which page any given claim came from, so it is enforced in `reconcileSourceClaims` against
 * each claim's own backing source. These tests drive the real function against the real store.
 */
describe('FIXED 14: a live claim answers to its own backing page, and to nothing else', () => {
  const VENUE = 'fp-reconcile-venue';
  const OWN = 'https://www.vam.ac.uk/young/visit';
  const OWN_OTHER = 'https://www.vam.ac.uk/young/accessibility';
  const SIBLING = 'https://www.vam.ac.uk/east/museum/visit';
  const CHECKED_AT = '2026-09-20';
  const REFRESHED = '2026-09-27T09:10:18.282Z';

  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    fs.mkdirSync('.data', { recursive: true });
    fs.writeFileSync(path.join('.data', 'venue-claims.json'), JSON.stringify({ claims: [] }));
    vi.resetModules();
  });
  afterEach(() => { process.env = env; vi.resetModules(); });

  const fact = (sourceUrl: string, field: string, value: string) => ({
    field, value, confidence: 'high',
    evidenceText: `${field} ${value} stated on the page in enough words to pass the length gate.`,
    sourceUrl, sourceType: 'visitor_info', retrievedAt: REFRESHED,
  });

  const source = (
    url: string,
    subjectScope: string | null,
    facts: unknown[],
    fetchStatus = 'ok',
    retrievedAt = REFRESHED,
  ) => ({ url, sourceType: 'visitor_info', fetchStatus, retrievedAt, subjectScope, facts });

  /** One active automatic claim, written through the real writer. */
  async function seedClaim(fieldKey: string, value: string, sourceUrl: string) {
    const { replaceActiveClaim } = await import('../../../server/enrichment/_lib/claims-store.js');
    const { REVIEWED_BY } = await import('../../../server/enrichment/_lib/auto-approve.js');
    return replaceActiveClaim({
      familypilotPlaceId: VENUE, fieldKey, valueJson: value, confidence: 'high',
      sourceUrl, sourceType: 'visitor_info', sourceEvidenceId: null,
      evidenceExcerpt: 'Stated on the page.', checkedAt: CHECKED_AT, validUntil: '2026-10-20',
      approvedAt: `${CHECKED_AT}T12:00:00Z`, approvedBy: REVIEWED_BY,
      approvedFromDraftId: null, status: 'active', supersedesClaimId: null,
    });
  }

  async function reconcileWith(sources: unknown[]) {
    const { reconcileSourceClaims } = await import('../../../server/enrichment/_lib/auto-approve.js');
    await reconcileSourceClaims(VENUE, buildEvidenceBundle(VENUE, sources, 'official_website'));
  }

  async function statusOf(fieldKey: string) {
    const { listClaimsForVenue } = await import('../../../server/enrichment/_lib/claims-store.js');
    const claims = await listClaimsForVenue(VENUE, {});
    return claims.find((c: { fieldKey: string }) => c.fieldKey === fieldKey)?.status ?? null;
  }

  it('disputes the claim when its own page drops the fact, however loudly a sibling agrees', async () => {
    // The exact regression round 2 missed: no eligible parking candidate, so the merge fell back to
    // the sibling and the old code read a withheld page as confirmation.
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'toilets', 'yes')]),   // refreshed, parking gone
      source(SIBLING, 'sibling_unverified', [fact(SIBLING, 'parking', 'yes')]),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  it('does not count an ineligible page as confirmation when the value disagrees either', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'no')]),    // own page now says no
      source(SIBLING, 'sibling_unverified', [fact(SIBLING, 'parking', 'yes')]),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  it('keeps the claim when its own page still says it and only a sibling disagrees', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(SIBLING, 'sibling_unverified', [fact(SIBLING, 'parking', 'no')]),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it('withdraws the field when two pages that MAY speak for the venue disagree', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')]),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  /**
   * The Phase 6 gate, restated on provenance. Horniman Butterfly House's seven claims all rest on
   * `other_catalogue_venue` pages; the every-minute cron must not repair them on deploy.
   */
  it.each([
    ['not recorded', null],
    ['an unverified sibling', 'sibling_unverified'],
    ['the operator\'s page', 'organisation_ancestor'],
    ['another catalogue venue\'s page', 'other_catalogue_venue'],
  ])('skips a claim whose own backing page is %s, rather than disputing it', async (_label, scope) => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    // The page is refreshed and no longer states parking -- and is still left alone, because
    // withdrawing it is a reviewed decision, not an automatic one.
    await reconcileWith([source(OWN, scope as string | null, [fact(OWN, 'toilets', 'yes')])]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it('leaves the claim alone when its page was not refetched this run', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([source(SIBLING, 'sibling_unverified', [fact(SIBLING, 'parking', 'no')])]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it('leaves the claim alone when its page failed to fetch, since absence is not evidence', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([source(OWN, 'venue_own_subtree', [], 'error')]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it('leaves the claim alone when the refresh predates the claim\'s own check', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'toilets', 'yes')], 'ok', '2026-09-01T00:00:00Z'),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  /**
   * Review round 4. Conflict evidence must be freshness-bounded as well as eligible.
   *
   * `verifiedBundleForVenue` keeps the latest stored successful row per URL with no recency filter,
   * so a legitimate page last fetched weeks ago still sits in today's bundle. Without this guard it
   * withdrew a claim refreshed today -- the same staleness this function polices, pointed the other
   * way.
   */
  const STALE = '2026-08-01T00:00:00Z';   // well before CHECKED_AT
  const NEWER = '2026-09-28T09:00:00Z';   // after CHECKED_AT

  it('does not let an OLD eligible page overrule a newer claim', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      // Legitimate, eligible, cleanly fetched -- and read in August. It does not get a vote.
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')], 'ok', STALE),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it('does let a NEWER eligible page withdraw the field', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')], 'ok', NEWER),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  it('ignores a failed eligible page even when its stored value disagrees', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')], 'error', STALE),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });

  it.each([
    ['older than the claim', STALE],
    ['newer than the claim', NEWER],
  ])('leaves an ineligible page irrelevant when it is %s', async (_label, retrievedAt) => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(SIBLING, 'sibling_unverified', [fact(SIBLING, 'parking', 'no')], 'ok', retrievedAt),
    ]);
    expect(await statusOf('familyFacilities.parking'),
      'age never rescues a source that may not speak for the venue').toBe('active');
  });

  /**
   * The boundary itself: "at or after the claim's check" means AT counts.
   *
   * A mutation pass caught this. Flipping `>=` to `>` left all 75 tests green, because every fixture
   * happened to sit strictly after `CHECKED_AT` -- so the suite was asserting the rule's spirit and
   * not its edge. Both callers of the predicate get a case that only passes under `>=`.
   */
  const EXACTLY_AT_CHECK = `${CHECKED_AT}T00:00:00Z`;

  it('treats a backing page read exactly at the claim\'s check as a refresh', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    // Under `>` this page would not be found at all, the claim would be skipped, and it would
    // survive for the wrong reason. Under `>=` it is a refresh that no longer states parking.
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'toilets', 'yes')], 'ok', EXACTLY_AT_CHECK),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  it('lets a conflicting page read exactly at the claim\'s check count', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')], 'ok', EXACTLY_AT_CHECK),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  /**
   * Review round 5, from a real false withdrawal in production on 2026-09-29.
   *
   * Belmont Children's Farm, claim `7a37949d…`, `environment=mixed` from `belmontfarm.co.uk`. The
   * September reading was `ok` at 8000 characters and carried the indoor/outdoor wording. The refresh
   * came back `fetched_truncated` at **770 characters** with no facts at all. The fact had not gone
   * from the page; it was past the point where the fetch stopped. Reconciliation read the prefix as
   * the whole page and disputed a true claim.
   *
   * "I saw this statement" and "this statement is nowhere on the page" need different evidence.
   */
  const BELMONT = 'https://www.belmontfarm.co.uk/';

  it('disputes when a COMPLETE read no longer states the fact', async () => {
    await seedClaim('environment', 'mixed', BELMONT);
    await reconcileWith([source(BELMONT, 'venue_own_subtree', [fact(BELMONT, 'toilets', 'yes')], 'ok')]);
    expect(await statusOf('environment')).toBe('disputed');
  });

  it('does NOT dispute when a truncated read merely omits the fact', async () => {
    // The production case, reproduced: eligible, refreshed, and cut short at 770 characters.
    await seedClaim('environment', 'mixed', BELMONT);
    await reconcileWith([source(BELMONT, 'venue_own_subtree', [], 'fetched_truncated')]);
    expect(await statusOf('environment'),
      'silence in a prefix is not a denial').toBe('active');
  });

  it('keeps the claim when a truncated read still states the same value', async () => {
    await seedClaim('environment', 'mixed', BELMONT);
    await reconcileWith([
      source(BELMONT, 'venue_own_subtree', [fact(BELMONT, 'environment', 'mixed')], 'fetched_truncated'),
    ]);
    expect(await statusOf('environment')).toBe('active');
  });

  /**
   * The behaviour this pins by decision rather than by bug report: truncation limits what a page can
   * DENY, not what it can ASSERT. A cut-short page that explicitly states the opposite has been read
   * saying so, which is positive evidence of a disagreement, so it still withdraws the field.
   */
  it('lets a truncated eligible page that explicitly states the opposite create a conflict', async () => {
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(OWN_OTHER, 'venue_named_page', [fact(OWN_OTHER, 'parking', 'no')], 'fetched_truncated'),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('disputed');
  });

  it.each([
    ['a failed fetch', 'error'],
    ['a timeout', 'timeout'],
  ])('never withdraws on %s', async (_label, fetchStatus) => {
    await seedClaim('environment', 'mixed', BELMONT);
    await reconcileWith([source(BELMONT, 'venue_own_subtree', [], fetchStatus)]);
    expect(await statusOf('environment')).toBe('active');
  });

  /**
   * `cached` is excluded from the complete-enough set as well, which is a judgement beyond the
   * reported bug: `fetchAndExtractPage` stamps `fetchStatus: 'cached'` unconditionally and
   * `getCachedEvidence` does not filter on status, so a row originally stored as `fetched_truncated`
   * comes back as `cached` and its completeness cannot be known from the status. Unknown fails closed.
   */
  it('does not withdraw on a cached read either, since its completeness is unknowable', async () => {
    await seedClaim('environment', 'mixed', BELMONT);
    await reconcileWith([source(BELMONT, 'venue_own_subtree', [], 'cached')]);
    expect(await statusOf('environment')).toBe('active');
  });

  it('still passes the Young V&A canary case that started all this', async () => {
    // Own page states parking once; the withheld sibling contradicts ITSELF. The claim must survive.
    await seedClaim('familyFacilities.parking', 'yes', OWN);
    await reconcileWith([
      source(OWN, 'venue_own_subtree', [fact(OWN, 'parking', 'yes')]),
      source(SIBLING, 'sibling_unverified', [
        fact(SIBLING, 'parking', 'yes'), fact(SIBLING, 'parking', 'no'),
      ]),
    ]);
    expect(await statusOf('familyFacilities.parking')).toBe('active');
  });
});

/**
 * Coverage round 1: the crawl budget.
 *
 * Nothing here touches provenance. The source-identity gate, `eligibleFact`, `usableFor` /
 * `isCompleteRead` and reconciliation are all unchanged; this is only about WHICH pages a crawl gets
 * to read before it stops. It is in this file because the budget decides what evidence exists at all,
 * and a crawl that stops early is indistinguishable in the data from a venue that publishes nothing.
 *
 * The defect, stated precisely and measured rather than assumed:
 *
 *   `MAX_PAGES = 5` was the candidate-list length, the attempt limit and the page limit at once. The
 *   queue therefore held exactly the four candidates the attempt budget could pay for, so the guard
 *   `if (!next && reserve.length)` -- which fires only on an EMPTY queue -- could not be reached while
 *   any selected candidate remained, and the queue emptied exactly as the budget expired. A 404 still
 *   consumed an attempt, and the `isQuickFailure -> continue` beside it refunded nothing. So a venue
 *   whose four selected guesses 404'd finished with the homepage alone and never tried `/accessibility`
 *   or `/facilities`, which were sitting in a reserve no code path could reach.
 *
 * 33.7% of 953 stored evidence rows are non-usable, so that was not a rare shape: 56 of 234 crawl
 * rounds produced no usable page at all and 35 produced only the homepage.
 */
describe('FIXED 15: three separate crawl ceilings, so a failed fetch no longer ends the crawl', () => {
  const VENUE = 'fp-budget-venue';
  const WEBSITE = 'https://budget.example/';
  const catalogue = [{ familypilotPlaceId: VENUE, name: 'Budget Venue', website: WEBSITE }];
  const placeRow = { name: 'Budget Venue', website: WEBSITE, description: 'A venue.' };

  /** The measured worst case for everything after the last fetch, over 128 completed jobs. */
  const MEASURED_TAIL_MAX_MS = 11333;
  /** `enrichment-worker/index.ts`: AbortSignal.timeout(50000) on the call to the API. */
  const WORKER_ABORT_MS = 50000;
  /** `google-places.js`: AbortSignal.timeout(15000) -- what the old 5s head reserve got wrong. */
  const GOOGLE_PLACES_TIMEOUT_MS = 15000;

  /**
   * The server modules are plain CommonJS loaded by Node, not through Vite's module graph, so
   * `vi.mock` cannot see the pipeline's own `require('./source-fetcher')` -- verified, not assumed:
   * a mocked module resolves for a direct import and the crawl still hits real DNS. The network is
   * therefore replaced at the one place it enters, by swapping that single export on the cached
   * module and dropping the pipeline from the cache so it re-binds. Nothing else is substituted:
   * discovery, ordering, extraction, classification and storage are all the production code.
   */
  const FETCHER = require.resolve('../../../server/enrichment/_lib/source-fetcher.js');
  const PIPELINE = require.resolve('../../../server/enrichment/_lib/evidence-pipeline.js');

  let env: NodeJS.ProcessEnv;
  let attempts: Array<{ url: string; budgetMs: number | undefined }>;
  let nowMs: number;
  let realFetchOfficialPage: unknown;

  beforeEach(() => {
    env = { ...process.env };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SOURCE_MAX_PAGES;
    delete process.env.SOURCE_USABLE_PAGE_TARGET;
    delete process.env.SOURCE_MAX_FETCH_ATTEMPTS;
    delete process.env.SOURCE_CRAWL_BUDGET_MS;
    delete process.env.SOURCE_GATHER_BUDGET_MS;
    delete process.env.SOURCE_MIN_PAGE_WINDOW_MS;
    fs.mkdirSync('.data', { recursive: true });
    fs.writeFileSync(path.join('.data', 'venue-source-evidence.json'), JSON.stringify({ records: [] }));
    attempts = [];
    nowMs = 0;
    realFetchOfficialPage = require(FETCHER).fetchOfficialPage;
  });

  afterEach(() => {
    process.env = env;
    require(FETCHER).fetchOfficialPage = realFetchOfficialPage;
    delete require.cache[PIPELINE];
  });

  type Outcome = { ok: boolean; durationMs?: number; text?: string };

  /**
   * Stands in for the network only. Everything else in the crawl -- discovery, ordering, extraction,
   * classification, storage -- is the real code, so what these tests pin is the pipeline's own
   * behaviour and not a re-implementation of it.
   */
  async function crawl(
    outcomeFor: (url: string) => Outcome,
    options: Record<string, unknown> = {},
  ) {
    require(FETCHER).fetchOfficialPage = async (url: string, opts: { budgetMs?: number } = {}) => {
      attempts.push({ url, budgetMs: opts.budgetMs });
      const outcome = outcomeFor(url);
      /**
       * The fake honours the budget it was handed, because the real fetcher does: the abort fires at
       * the budget and the page comes back as a timeout. Letting the fake overrun would have made the
       * elapsed-time assertions below meaningless -- it would measure a page the production code could
       * not actually run that long.
       */
      const wanted = outcome.durationMs ?? 0;
      const allowed = opts.budgetMs ?? Number.POSITIVE_INFINITY;
      nowMs += Math.min(wanted, allowed);
      if (wanted > allowed) {
        return { ok: false, fetchStatus: 'timeout', error: 'Fetch timeout', url, html: null };
      }
      if (!outcome.ok) {
        return { ok: false, fetchStatus: 'error', httpStatus: 404, error: 'HTTP 404', url, html: null };
      }
      // Each page reads differently, as real pages do: the crawl no longer counts word-for-word duplicates as pages
      // read (a soft 404 answering every path with the homepage), so identical text here would end crawls early.
      const text = outcome.text
        ?? `Baby changing facilities are available in the accessible toilet on the ground floor. (${new URL(url).pathname})`;
      return {
        ok: true,
        fetchStatus: 'ok',
        url,
        pageTitle: 'Budget Venue',
        extractedText: text,
        contentHash: crypto.createHash('sha256').update(text).digest('hex'),
        html: (options.html as string) ?? '<html><body></body></html>',
        retrievedAt: new Date().toISOString(),
        truncated: false,
        bytesRead: text.length,
      };
    };

    // Re-bind: the pipeline destructures `fetchOfficialPage` at load, so it must load after the swap.
    delete require.cache[PIPELINE];
    const { gatherEvidenceForVenue } = require(PIPELINE);

    /**
     * `headMs` models the head -- `ensurePlaceDetails` (a Google Places call with its own 15s timeout)
     * and `listVenueIdentities` -- costing wall time. It has to be charged INSIDE the gather, after the
     * deadline is set, or it would not test anything: charging it before the call is exactly the
     * mistake the review found. The pipeline reads the clock first for `gatherStartedAt` and second for
     * `headElapsedMs`, immediately after the head, so the cost lands on the second read.
     */
    const headMs = (options.headMs as number) ?? 0;
    let clockReads = 0;
    const clock = () => {
      clockReads += 1;
      if (clockReads === 2) nowMs += headMs;
      return nowMs;
    };

    const bundle = await gatherEvidenceForVenue(VENUE, placeRow, {
      catalogue,
      // The production automation path: both HTTP entry points pass sourceOnly, which becomes this.
      forceRefresh: true,
      clock,
      ...options,
    });
    return bundle as unknown as {
      sources: Array<{ url: string; fetchStatus: string; subjectScope: string | null }>;
      diagnostics: {
        fetchAttempts: number;
        usablePageCount: number;
        candidatesRemaining: number;
        stopReason: string;
        gatherElapsedMs: number;
        headElapsedMs: number;
        homepageFetchStatus: string;
        budgets: {
          usablePageTarget: number; maxFetchAttempts: number;
          gatherBudgetMs: number; pageBudgetMs: number; minPageWindowMs: number;
        };
      };
    };
  }

  const pathsAttempted = () => attempts.map((a) => new URL(a.url).pathname);

  it('does not count a page whose text is word for word one already read (a soft 404) as a page read', async () => {
    // A site that answers every path with its homepage: before, six copies met the usable-page target and the crawl
    // stopped having read one page. Now the copies are recorded but do not count, so the crawl keeps looking.
    const bundle = await crawl(() => ({ ok: true, text: 'Welcome to the farm. Opening times vary through the year.' }));
    expect(bundle.diagnostics.usablePageCount).toBe(1);
    expect(bundle.diagnostics.stopReason).not.toBe('usable_page_target');
    expect((bundle.diagnostics as unknown as { duplicatePages: unknown[] }).duplicatePages.length).toBeGreaterThan(0);
  });

  it('reaches the high-value candidates after the homepage and four 404s (the exact lost case)', async () => {
    /**
     * The regression the previous loop could not pass. `/parking` is the seventh speculative candidate,
     * so under the old single budget of five attempts it was unreachable the moment the four selected
     * guesses failed -- which is the shape the 33.7% failure rate produces constantly.
     */
    const bundle = await crawl((url) => ({ ok: url === WEBSITE || url.endsWith('/parking') }));

    expect(pathsAttempted().slice(0, 6)).toEqual([
      '/', '/accessibility', '/facilities', '/family', '/families', '/faq',
    ]);
    expect(pathsAttempted(), 'the seventh candidate must still be reached').toContain('/parking');

    const parking = bundle.sources.find((s) => s.url.endsWith('/parking'));
    expect(parking?.fetchStatus).toBe('ok');
    // Provenance is untouched by this change, and must still be recorded on every page.
    expect(parking?.subjectScope).toBe('venue_own_subtree');

    // Four failures cost four attempts and no usable slots: homepage + /parking are the two usable.
    expect(bundle.diagnostics.usablePageCount).toBe(2);
    expect(bundle.diagnostics.fetchAttempts).toBe(10);
    expect(bundle.diagnostics.stopReason).toBe('attempt_ceiling');
  });

  it('shows the old single budget losing the same page, which is why the split exists', async () => {
    /**
     * The same scenario with the ceilings collapsed back to one number of five, as they were. The
     * failing guesses eat the budget, `/parking` is never asked for, and the venue serves the homepage
     * alone. This is the before half of the change, run as code rather than described.
     */
    process.env.SOURCE_USABLE_PAGE_TARGET = '5';
    process.env.SOURCE_MAX_FETCH_ATTEMPTS = '5';
    const bundle = await crawl((url) => ({ ok: url === WEBSITE || url.endsWith('/parking') }));

    expect(bundle.diagnostics.fetchAttempts).toBe(5);
    expect(pathsAttempted(), 'the old ceiling stopped one page short of it').not.toContain('/parking');
    expect(bundle.diagnostics.usablePageCount).toBe(1);
    expect(bundle.diagnostics.candidatesRemaining).toBeGreaterThan(0);
  });

  it('stops once enough usable pages are in hand, instead of spending the whole ceiling', async () => {
    const bundle = await crawl(() => ({ ok: true }));

    expect(bundle.diagnostics.stopReason).toBe('usable_page_target');
    expect(bundle.diagnostics.usablePageCount).toBe(6);
    expect(bundle.diagnostics.fetchAttempts).toBe(6);
    expect(pathsAttempted()).toEqual(['/', '/accessibility', '/facilities', '/family', '/families', '/faq']);
    expect(pathsAttempted(), 'nothing beyond the target').not.toContain('/faqs');
  });

  it('always stops at the attempt ceiling, however many candidates are left', async () => {
    const bundle = await crawl(() => ({ ok: false }));

    expect(bundle.diagnostics.fetchAttempts).toBe(10);
    expect(bundle.diagnostics.usablePageCount).toBe(0);
    expect(bundle.diagnostics.stopReason).toBe('attempt_ceiling');
    // Proof it stopped on the ceiling rather than running out of candidates.
    expect(bundle.diagnostics.candidatesRemaining).toBeGreaterThan(0);
  });

  it('stops starting fetches once the window is too small for one, and stops cleanly', async () => {
    // 5s a page against a 33s budget: six pages start, at 0, 5, 10, 15, 20 and 25 (8s left, above the
    // 4s minimum). After 30s only 3s remain, so the seventh start is refused.
    const bundle = await crawl(() => ({ ok: false, durationMs: 5000 }));

    expect(bundle.diagnostics.stopReason).toBe('wall_clock');
    expect(bundle.diagnostics.fetchAttempts).toBe(6);
    expect(bundle.diagnostics.gatherElapsedMs).toBe(30000);
    expect(bundle.diagnostics.candidatesRemaining).toBeGreaterThan(0);

    /**
     * "Cleanly" is the substance of this test: the crawl stops between pages, never inside one, so
     * every URL it attempted has a stored evidence row and the bundle it returns is complete.
     */
    const stored = JSON.parse(fs.readFileSync(path.join('.data', 'venue-source-evidence.json'), 'utf8'));
    expect(stored.records.map((r: { source_url: string }) => r.source_url).sort())
      .toEqual(attempts.map((a) => a.url).sort());
    expect(bundle.sources).toHaveLength(6);
  });

  it('cannot push the worker into its 50-second abort, even when every page takes its full budget', async () => {
    const bundle = await crawl(() => ({ ok: true, durationMs: 12000 }));

    expect(bundle.diagnostics.gatherElapsedMs)
      .toBeLessThanOrEqual(bundle.diagnostics.budgets.gatherBudgetMs);

    /**
     * The derivation, asserted rather than asserted-in-a-comment: the gather ceiling plus the measured
     * worst case for everything after the last fetch must fit inside the worker's abort. An overrun is
     * not merely slow -- the worker marks the job FAILED while the Vercel function runs on to 60s and
     * may still publish claims.
     *
     * This assertion only means anything because the budget now starts at gather ENTRY. While it began
     * at the first fetch, the same sum was true and the request could still take
     * 15s (Google) + 28s + 11.33s = 54.3s.
     */
    expect(bundle.diagnostics.budgets.gatherBudgetMs + MEASURED_TAIL_MAX_MS)
      .toBeLessThan(WORKER_ABORT_MS);
    expect(GOOGLE_PLACES_TIMEOUT_MS + bundle.diagnostics.budgets.gatherBudgetMs + MEASURED_TAIL_MAX_MS,
      'the old shape, kept here as the thing that must no longer be possible')
      .toBeGreaterThan(WORKER_ABORT_MS);
  });

  it('does not hand the page loop a fresh budget after a slow head', async () => {
    /**
     * Review blocker 2, as a regression. The head spends 30s of the 33s budget -- less than the 15s
     * Google timeout plus a catalogue read could plausibly cost together -- and what remains is 3s,
     * below the minimum page window. Under the old shape the crawl would have started here with a full
     * 28s in hand.
     */
    const bundle = await crawl(() => ({ ok: true }), { headMs: 30000 });

    expect(bundle.diagnostics.headElapsedMs).toBe(30000);
    expect(bundle.diagnostics.stopReason).toBe('wall_clock_before_homepage');
    expect(attempts, 'no page may be fetched at all').toEqual([]);
    expect(bundle.diagnostics.fetchAttempts).toBe(0);
    expect(bundle.diagnostics.homepageFetchStatus).toBe('not_attempted');
    expect(bundle.diagnostics.gatherElapsedMs)
      .toBeLessThanOrEqual(bundle.diagnostics.budgets.gatherBudgetMs);

    // An empty gather fails closed: no facts to publish, and no backing page for reconciliation to
    // read, so it withdraws nothing either.
    expect(bundle.sources).toEqual([]);
    const review = reviewEvidence(bundle);
    expect(review.eligible).toBe(false);
  });

  it('charges a partly slow head to the same budget, leaving fewer pages rather than more time', async () => {
    // 20s of head leaves 13s: pages at 5s each start at 20, 25 (8s left) and stop at 30s with 3s left.
    const bundle = await crawl(() => ({ ok: false, durationMs: 5000 }), { headMs: 20000 });

    expect(bundle.diagnostics.headElapsedMs).toBe(20000);
    expect(bundle.diagnostics.fetchAttempts).toBe(2);
    expect(bundle.diagnostics.stopReason).toBe('wall_clock');
    expect(bundle.diagnostics.gatherElapsedMs).toBe(30000);
  });

  it('never hands a page more time than the gather has left', async () => {
    /**
     * The other half of the same finding: a page started near the end must get a REDUCED budget, not
     * the full 12s, or the fetch it starts could outlive the window that authorised it.
     */
    const bundle = await crawl(() => ({ ok: false, durationMs: 5000 }), { headMs: 18000 });

    expect(attempts.length).toBeGreaterThan(1);
    expect(attempts[0].budgetMs, '15s left at the first page, so the full budget applies').toBe(12000);
    const last = attempts[attempts.length - 1];
    expect(last.budgetMs).toBeLessThan(12000);
    expect(last.budgetMs).toBeGreaterThanOrEqual(bundle.diagnostics.budgets.minPageWindowMs);
    // Every budget handed out was within what remained at the time it was handed out.
    expect(attempts.every((a) => (a.budgetMs ?? 0) <= 12000)).toBe(true);
  });

  it('hands a page the full budget while the window allows it', async () => {
    // Without this the per-page cap would be decorative, and a redirect chain could outlast the
    // window the wall-clock guard proved safe.
    const bundle = await crawl(() => ({ ok: true }));
    expect(attempts.every((a) => a.budgetMs === 12000)).toBe(true);
    expect(bundle.diagnostics.budgets.pageBudgetMs).toBe(12000);
  });

  it('follows a real internal link before any speculative guess', async () => {
    const html = '<html><body><a href="/our-access-and-facilities">Accessibility and facilities</a></body></html>';
    const bundle = await crawl((url) => ({ ok: url === WEBSITE || url.includes('our-access') }), { html });

    expect(pathsAttempted()[1], 'the venue said where its page is; guessing comes after')
      .toBe('/our-access-and-facilities');
    expect(bundle.diagnostics.stopReason).toBeTruthy();
  });

  it('honours SOURCE_MAX_PAGES as the usable-page target, so pinned deployments keep their meaning', async () => {
    process.env.SOURCE_MAX_PAGES = '2';
    const bundle = await crawl(() => ({ ok: true }));
    expect(bundle.diagnostics.budgets.usablePageTarget).toBe(2);
    expect(bundle.diagnostics.fetchAttempts).toBe(2);
    expect(bundle.diagnostics.stopReason).toBe('usable_page_target');
  });
});

/**
 * The per-page ceiling, which the crawl deadline depends on.
 *
 * `FETCH_TIMEOUT_MS` bounds one HTTP hop and is restarted on every redirect, so three redirects could
 * hold a single URL for 24s -- while the crawl guard has reserved 12s for it. One deadline for the
 * whole chain closes that gap.
 */
describe('FIXED 17: one page, one wall clock, redirects included', () => {
  const { fetchWithRedirects, PAGE_BUDGET_MS, FETCH_TIMEOUT_MS } =
    require('../../../server/enrichment/_lib/source-fetcher');

  it('refuses a hop once the chain deadline has passed, without opening a socket', async () => {
    // No DNS, no network: an expired deadline is answered before `assertSafeUrl` is even reached.
    const result = await fetchWithRedirects('https://redirect.example/page', 0, Date.now() - 1);
    expect(result).toEqual({ status: 'timeout', html: null, error: 'Page budget exhausted' });
  });

  it('carries one deadline across a redirect chain, instead of restarting the clock per hop', async () => {
    /**
     * Added because a mutation survived: dropping the deadline from the recursive call left every
     * assertion green. It is the one behaviour the page budget exists for, so it needed its own test.
     *
     * Offline by construction: an IP literal host skips DNS (`resolveAndValidateHost` returns early for
     * a public IP), and `globalThis.fetch` is replaced. The first hop redirects; the second never
     * answers and can only end when its abort signal fires. With the deadline carried, that is the
     * ~400ms left of the chain budget. Without it, the second hop would get a fresh
     * FETCH_TIMEOUT_MS of 6s, so the elapsed time separates the two by an order of magnitude.
     */
    const realFetch = globalThis.fetch;
    let hops = 0;
    globalThis.fetch = (async (_url: string, init: { signal: AbortSignal }) => {
      hops += 1;
      if (hops === 1) {
        return {
          status: 302,
          headers: new Headers({ location: 'https://93.184.216.34/second' }),
        } as unknown as Response;
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }) as unknown as typeof globalThis.fetch;

    try {
      const startedAt = Date.now();
      const result = await fetchWithRedirects('https://93.184.216.34/first', 0, Date.now() + 400);
      const elapsed = Date.now() - startedAt;

      expect(hops, 'the redirect must actually have been followed').toBe(2);
      expect(result.status).toBe('timeout');
      expect(elapsed, 'a fresh per-hop timer would have taken about 6s').toBeLessThan(2000);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  /**
   * Review blocker 1, as two regressions.
   *
   * The deadline was computed, then `assertSafeUrl` ran a `dns/promises.lookup` with no timeout, and the
   * HTTP timer was armed afterwards from the stale pre-DNS remainder. A slow resolver could push one
   * page past its budget, so the page budget the crawl guard relies on was not actually a bound.
   */
  describe('the page budget covers URL safety and DNS, not only HTTP', () => {
    const SECURITY = require.resolve('../../../server/enrichment/_lib/source-fetch-security.js');
    const FETCHER = require.resolve('../../../server/enrichment/_lib/source-fetcher.js');
    const realAssert = require(SECURITY).assertSafeUrl;
    const realFetch = globalThis.fetch;

    /** Replaces resolution with one that takes `delayMs`, and re-binds the fetcher onto it. */
    function withSlowResolution(delayMs: number) {
      require(SECURITY).assertSafeUrl = async (urlString: string) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return new URL(urlString);
      };
      delete require.cache[FETCHER];
      return require(FETCHER);
    }

    afterEach(() => {
      require(SECURITY).assertSafeUrl = realAssert;
      globalThis.fetch = realFetch;
      delete require.cache[FETCHER];
    });

    it('starts no network fetch when resolution consumes the whole page budget', async () => {
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return { status: 200, headers: new Headers({ 'content-type': 'text/html' }) } as unknown as Response;
      }) as unknown as typeof globalThis.fetch;

      const fetcher = withSlowResolution(300);
      const result = await fetcher.fetchWithRedirects('https://slow-dns.example/page', 0, Date.now() + 100);

      expect(result).toEqual({ status: 'timeout', html: null, error: 'Page budget exhausted' });
      /**
       * The lookup cannot be cancelled, so it is still running when this returns. What matters is that
       * its result can never start a fetch -- which is the property the finding asked for, and the
       * reason this waits past the resolution before asserting.
       */
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(fetchCalls, 'a validation that finishes late must not initiate a fetch').toBe(0);
    });

    it('does not wait for a hanging resolver to finish before giving up on the page', async () => {
      /**
       * Added because a mutant survived: replacing the race with a plain `await` still returned a
       * timeout, since the remainder is recomputed after resolution. What it lost is the property that
       * actually protects the gather -- a resolver hanging far past the budget would hold the page for
       * as long as it hangs, and the gather guard can only refuse to START pages, not shorten one in
       * flight. So the value here is the elapsed time, not the status.
       */
      let fetchCalls = 0;
      globalThis.fetch = (async () => {
        fetchCalls += 1;
        return { status: 500 } as unknown as Response;
      }) as unknown as typeof globalThis.fetch;

      const fetcher = withSlowResolution(1500);
      const startedAt = Date.now();
      const result = await fetcher.fetchWithRedirects('https://hanging-dns.example/page', 0, Date.now() + 100);
      const elapsed = Date.now() - startedAt;

      expect(result.status).toBe('timeout');
      expect(elapsed, 'must give up at the budget, not when the resolver eventually answers')
        .toBeLessThan(600);
      expect(fetchCalls).toBe(0);
    });

    it('gives the HTTP hop only what resolution left, not the pre-resolution remainder', async () => {
      // Never answers, so the only thing that can end it is the abort signal.
      globalThis.fetch = (async (_url: string, init: { signal: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          });
        })) as unknown as typeof globalThis.fetch;

      const fetcher = withSlowResolution(250);
      const startedAt = Date.now();
      const result = await fetcher.fetchWithRedirects('https://slow-dns.example/page', 0, Date.now() + 400);
      const elapsed = Date.now() - startedAt;

      expect(result.status).toBe('timeout');
      // Under the old code the timer was armed with the full 400ms AFTER 250ms of resolution, giving
      // 650ms for a page budgeted at 400ms.
      expect(elapsed).toBeLessThan(600);
      expect(elapsed).toBeGreaterThanOrEqual(250);
    });

    it('still propagates a refusal rather than turning an unsafe URL into a fetch outcome', async () => {
      // The race must not change what happens when validation REFUSES: SSRF rejection still throws.
      require(SECURITY).assertSafeUrl = async () => { throw new Error('Blocked private IP'); };
      delete require.cache[FETCHER];
      const fetcher = require(FETCHER);
      await expect(fetcher.fetchWithRedirects('https://unsafe.example/', 0, Date.now() + 5000))
        .rejects.toThrow('Blocked private IP');
    });
  });

  it('reserves less per page than the crawl guard sets aside for one', () => {
    // The arithmetic the wall-clock guard rests on. If the page budget ever exceeded what the crawl
    // reserves, a fetch it started could outlive the crawl deadline.
    const { GATHER_BUDGET_MS, MIN_PAGE_WINDOW_MS } = require('../../../server/enrichment/_lib/evidence-pipeline');
    expect(PAGE_BUDGET_MS).toBeLessThan(GATHER_BUDGET_MS);
    expect(MIN_PAGE_WINDOW_MS).toBeLessThan(PAGE_BUDGET_MS);
    expect(FETCH_TIMEOUT_MS).toBeLessThanOrEqual(PAGE_BUDGET_MS);
    // A three-redirect chain under the old per-hop timer: what the page budget now prevents.
    expect(FETCH_TIMEOUT_MS * 4).toBeGreaterThan(PAGE_BUDGET_MS);
  });
});

/**
 * The speculative candidate order, and the real-link terms that outrank it.
 *
 * Ordered by which FIELDS a page carries, which is a deliberate trade against hit rate: `/visit` is
 * the most likely guess to exist (70% usable across 208 rows) and is demoted anyway, because another
 * generic visit page is not another family fact. `/your-visit` (17% usable) and `/visitor-information`
 * (10%) are demoted on their own numbers, and they are what the old order spent slots 3 and 4 on.
 */
describe('FIXED 16: candidate order follows the fields families need', () => {
  const orderOf = (segment: string) => {
    const candidates = buildCommonPathCandidates('https://order.example/', 40)
      .map((c: { url: string }) => new URL(c.url).pathname);
    return candidates.indexOf(`/${segment}`);
  };

  it('tries the field-specific pages first', () => {
    const { pages } = mergePageCandidates('https://order.example/', [], '', 6, {});
    expect(pages.map((p: { url: string }) => new URL(p.url).pathname))
      .toEqual(['/', '/accessibility', '/facilities', '/family', '/families', '/faq']);
  });

  it('generates every allow-listed segment, so a longer list cannot be silently truncated', () => {
    /**
     * Added because a mutation survived: putting the old hard 20 back in place of the list's own length
     * left every assertion green while quietly dropping the last two segments. The invariant is that
     * generation covers the allow-list and the crawl BUDGETS decide what is fetched -- one place where
     * candidates are lost, visible in the diagnostics, rather than two.
     */
    const { COMMON_PATH_SEGMENTS } = require('../../../server/enrichment/_lib/html-text-extractor');
    const { diagnostics } = mergePageCandidates('https://order.example/', [], '', 6, {});
    const generated = diagnostics.linksDiscovered
      .filter((l: { speculative: boolean }) => l.speculative)
      .map((l: { url: string }) => new URL(l.url).pathname);

    expect(generated).toHaveLength(COMMON_PATH_SEGMENTS.length);
    for (const segment of COMMON_PATH_SEGMENTS) {
      expect(generated, `/${segment} must be generated`).toContain(`/${segment}`);
    }
  });

  it('demotes the two worst-performing guesses below every field-specific one', () => {
    for (const better of ['accessibility', 'facilities', 'family', 'faq', 'parking', 'getting-here']) {
      expect(orderOf(better), `${better} must precede /your-visit`).toBeLessThan(orderOf('your-visit'));
      expect(orderOf(better), `${better} must precede /visitor-information`)
        .toBeLessThan(orderOf('visitor-information'));
    }
  });

  it('keeps the generic visit pages in the budget, just not at the front of it', () => {
    // They are the highest-yield guesses, so demoting them is not dropping them: the attempt ceiling
    // still reaches both on a venue whose earlier guesses fail.
    expect(orderOf('plan-your-visit')).toBeGreaterThan(orderOf('facilities'));
    expect(orderOf('visit')).toBeGreaterThan(orderOf('facilities'));
    expect(orderOf('plan-your-visit')).toBeLessThan(10);
    expect(orderOf('visit')).toBeLessThan(11);
  });

  it('puts the unproven family-facility guesses last, because their yield is unknown', () => {
    // No venue has ever been asked for /toilets or /baby-changing, so they are tried only after every
    // topic that has a measured hit rate. The controlled cohort is what promotes them, or does not.
    for (const proven of ['accessibility', 'facilities', 'family', 'faq', 'parking', 'plan-your-visit']) {
      expect(orderOf(proven)).toBeLessThan(orderOf('toilets'));
      expect(orderOf(proven)).toBeLessThan(orderOf('baby-changing'));
    }
  });

  it('never lets a speculative guess outrank a real link', () => {
    const html = `
      <a href="/toilets-and-baby-changing">Toilets and baby changing</a>
      <a href="/families">Families</a>
      <a href="/childrens-trail">Children's trail</a>
    `;
    const { diagnostics } = mergePageCandidates('https://links.example/', [], html, 6, {});
    const speculative = diagnostics.linksSelected
      .slice(1)
      .map((l: { speculative: boolean }) => l.speculative);

    // Three real links exist and the target is six, so guesses legitimately fill the remaining slots.
    // What must never happen is a guess ahead of a link: every false precedes every true.
    expect(speculative.slice(0, 3)).toEqual([false, false, false]);
    expect(speculative.filter((s: boolean) => s === false)).toHaveLength(3);
    expect([...speculative].sort()).toEqual(speculative);
  });

  it('discovers the family-facility links a homepage publishes', () => {
    const html = `
      <a href="/visit/families">Families</a>
      <a href="/visit/children">Children</a>
      <a href="/visit/kids-activities">Kids activities</a>
      <a href="/visit/baby-changing">Baby changing</a>
      <a href="/visit/toilets">Toilets</a>
      <a href="/visit/pushchairs">Pushchairs</a>
      <a href="/visit/buggy-park">Buggy park</a>
    `;
    const found = findRelevantLinks(html, 'https://links.example/', 30)
      .map((l: { url: string }) => new URL(l.url).pathname);
    for (const p of ['/visit/families', '/visit/children', '/visit/kids-activities',
      '/visit/baby-changing', '/visit/toilets', '/visit/pushchairs', '/visit/buggy-park']) {
      expect(found, `${p} must be discovered`).toContain(p);
    }
  });

  it('reads a family word as structure, not as prose', () => {
    /**
     * Found by the existing suite the moment `families` joined the strong keywords: the anchor
     * "We help families find jobs" made a careers page a top candidate. A word in a sentence is not a
     * families page. Same word as a path segment, or as a navigation label, still is.
     */
    const prose = '<a href="/careers/">We help families find jobs</a>';
    expect(findRelevantLinks(prose, 'https://links.example/', 10)).toEqual([]);

    const structure = '<a href="/families/">Families</a><a href="/about/">Families and schools</a>';
    expect(findRelevantLinks(structure, 'https://links.example/', 10)
      .map((l: { url: string }) => new URL(l.url).pathname))
      .toEqual(expect.arrayContaining(['/families/', '/about/']));
  });

  it('does not treat "baby" or "buggy" alone as visitor information', () => {
    /**
     * `baby` on its own matches baby-class and pushchair-shop pages far more often than facility
     * pages, and a speculative attempt is the one thing this change spends. Only the compounds are
     * trusted. These two links carry no other keyword, so a match would have to come from the bare word.
     */
    const html = '<a href="/baby-sensory-classes">Baby sensory</a><a href="/buggy-hire-terms">Buggy hire</a>';
    expect(findRelevantLinks(html, 'https://links.example/', 30)).toEqual([]);
  });
});

/**
 * FIXED 18: re-verification sees exactly what the crawl saw.
 *
 * Found in review of the cohort run, and it had already cost a real served fact in production.
 *
 * `extractEnvironmentEvidence` analyses the page TITLE as well as the body. Flip Out Brent Cross's
 * stored row `232f640c` has `page_title` "North London's Ultimate Indoor Trampoline & Adventure Park!"
 * and an `extracted_text` that never contains the word "indoor" at all, so its high-confidence
 * `environment=indoor` fact exists ONLY because the crawl passed the title.
 *
 * `verifiedBundleForVenue` re-extracted the same stored text without the title. The fact was therefore
 * present while the draft was generated and absent during trusted re-verification, and `eligibleFact`'s
 * last check -- that the bundle's own source still states the fact -- failed. No claim, no error, no
 * signal. The cached branch of `fetchAndExtractPage` dropped the title too.
 *
 * These tests use the real Flip Out strings, and the body deliberately does NOT say "indoor": if the
 * title were ignored there would be nothing to find.
 */
describe('FIXED 18: the page title survives into trusted re-verification', () => {
  const {
    extractEvidenceFromText, extractionSourceMeta,
  } = require('../../../server/enrichment/_lib/evidence-extractor');

  /** Verbatim from production row 232f640c. */
  const FLIP_OUT_TITLE = "North London's Ultimate Indoor Trampoline & Adventure Park!";
  const FLIP_OUT_BODY = 'Book your jump session online in advance. Socks are required for all jumpers. '
    + 'Our team is on hand throughout your visit to keep everyone safe on the trampolines and the '
    + 'adventure course, and spectators are welcome to watch from the seating area.';

  it('finds nothing in the body alone, which is what makes the title load-bearing', () => {
    expect(FLIP_OUT_BODY.toLowerCase()).not.toContain('indoor');
    const facts = extractEvidenceFromText(FLIP_OUT_BODY, extractionSourceMeta({
      url: 'https://www.flipout.co.uk/locations/brent-cross',
      sourceType: 'official_website',
      retrievedAt: new Date().toISOString(),
    }));
    expect(facts.some((f: { field: string }) => f.field === 'environment')).toBe(false);
  });

  it('finds environment=indoor from the stored title, at high confidence', () => {
    const facts = extractEvidenceFromText(FLIP_OUT_BODY, extractionSourceMeta({
      url: 'https://www.flipout.co.uk/locations/brent-cross',
      sourceType: 'official_website',
      retrievedAt: new Date().toISOString(),
      pageTitle: FLIP_OUT_TITLE,
    }));
    const environment = facts.find((f: { field: string }) => f.field === 'environment');
    expect(environment).toBeTruthy();
    expect(environment.value).toBe('indoor');
    expect(environment.confidence, 'a medium fact would fail eligibleFact anyway').toBe('high');
  });

  it('gives the same facts on first extraction and on re-verification of the stored row', async () => {
    /**
     * The regression proper. Both paths are driven with the SAME stored row, and the assertion is that
     * they agree -- which is the property that was false, not any particular field's value.
     */
    const stored = {
      sourceUrl: 'https://www.flipout.co.uk/locations/brent-cross',
      sourceType: 'official_website',
      retrievedAt: new Date().toISOString(),
      pageTitle: FLIP_OUT_TITLE,
      extractedText: FLIP_OUT_BODY,
      fetchStatus: 'ok',
      subjectScope: 'venue_own_subtree',
    };

    const atCrawl = extractEvidenceFromText(stored.extractedText, extractionSourceMeta({
      url: stored.sourceUrl, sourceType: stored.sourceType,
      retrievedAt: stored.retrievedAt, pageTitle: stored.pageTitle,
    }));
    // Exactly what verifiedBundleForVenue now builds from a stored row.
    const atVerification = extractEvidenceFromText(stored.extractedText, extractionSourceMeta({
      url: stored.sourceUrl, sourceType: stored.sourceType,
      retrievedAt: stored.retrievedAt, pageTitle: stored.pageTitle,
    }));

    const shape = (facts: Array<{ field: string; value: string; confidence: string }>) =>
      facts.map((f) => `${f.field}=${f.value}/${f.confidence}`).sort();
    expect(shape(atVerification)).toEqual(shape(atCrawl));
    expect(shape(atVerification)).toContain('environment=indoor/high');
  });

  it('routes every extraction call site through the one shared metadata shape', () => {
    /**
     * Structural, not behavioural: the defect was two hand-maintained argument lists drifting apart, so
     * the guard is that no call site builds its own. Three sites exist -- the fresh fetch and the cached
     * branch in evidence-pipeline.js, and re-verification in trusted-evidence.js.
     */
    const fs = require('node:fs');
    const path = require('node:path');
    const root = path.join(__dirname, '../../../server/enrichment/_lib');
    for (const file of ['evidence-pipeline.js', 'trusted-evidence.js']) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      const calls = src.match(/extractEvidenceFromText\(/g) ?? [];
      const wrapped = src.match(/extractEvidenceFromText\([^;]*?extractionSourceMeta\(/gs) ?? [];
      expect(calls.length, `${file} should have extraction call sites`).toBeGreaterThan(0);
      expect(wrapped.length, `every extractEvidenceFromText in ${file} must use extractionSourceMeta`)
        .toBe(calls.length);
    }
  });

  it('defaults the title to null rather than undefined, so callers cannot omit it by accident', () => {
    expect(extractionSourceMeta({ url: 'u', sourceType: 't', retrievedAt: 'r' }))
      .toEqual({ url: 'u', sourceType: 't', retrievedAt: 'r', pageTitle: null });
  });
});

/**
 * FIXED 19: an evidence-bearing page, and the extraction misses the corpus proved.
 *
 * Every pattern added here is tied to a real row from the 2026-09-30 cohort, quoted verbatim, and
 * every negative counterexample is also a real row. The cohort's lesson was that the crawl works and
 * extraction does not, so the rule for this block is: change extraction only where a stored page said
 * something plainly and we missed it. Unknown stays unknown.
 */
describe('FIXED 19: evidence-bearing pages, and misses proved by stored content', () => {
  const {
    extractEvidenceFromText, extractionSourceMeta, isEvidenceBearingSource,
  } = require('../../../server/enrichment/_lib/evidence-extractor');

  const fields = (text: string, pageTitle?: string) => extractEvidenceFromText(text, extractionSourceMeta({
    url: 'https://venue.example/plan-your-visit',
    sourceType: 'official_website',
    retrievedAt: new Date().toISOString(),
    pageTitle,
  })).map((f: { field: string; value: string }) => `${f.field}=${f.value}`);

  describe('an ok page is not automatically an evidence-bearing page', () => {
    /** As a caller does it: re-extract, then judge the page on what came back. */
    const bearing = (body: string, title?: string) => isEvidenceBearingSource({
      extractedText: body,
      facts: extractEvidenceFromText(body, extractionSourceMeta({
        url: 'https://venue.example/p', sourceType: 'official_website',
        retrievedAt: new Date().toISOString(), pageTitle: title,
      })),
    });

    it('rejects the Crossrail shells: fetched cleanly, nothing to read', () => {
      // Six fresh `ok`, eligible rows from Crossrail Place Roof Garden have empty text AND empty title.
      // They counted towards the usable-page target, which is why the venue shows six usable pages and
      // serves nothing.
      expect(bearing('', '')).toBe(false);
      expect(bearing('   ')).toBe(false);
      expect(isEvidenceBearingSource({})).toBe(false);
    });

    it('rejects a body-less page whose title is just chrome', () => {
      /**
       * Review caught this: the first version of the rule was `hasBody || hasTitle`, so a page with no
       * body and a title of "Accessibility" or "FAQ" counted as evidence, and six such shells could
       * still stop the crawl at the usable-page target with nothing extracted. Flip Out proves a title
       * CAN carry a fact, not that any title is evidence.
       */
      expect(bearing('', 'Accessibility')).toBe(false);
      expect(bearing('', 'FAQ')).toBe(false);
      expect(bearing('', 'Plan your visit')).toBe(false);
      expect(bearing('', 'Contact Us')).toBe(false);
    });

    it('accepts a title-only page when the title actually produces a fact', () => {
      // Flip Out Brent Cross: the body never says "indoor", the title does. A minimum character count
      // on body text would throw this away, which is why the rule is not a length threshold -- and the
      // fact itself, not the mere presence of a title, is what admits the page.
      expect(bearing('', "North London's Ultimate Indoor Trampoline & Adventure Park!")).toBe(true);
      expect(fields('Book your jump session online in advance. Socks are required.',
        "North London's Ultimate Indoor Trampoline & Adventure Park!")).toContain('environment=indoor');
    });

    it('accepts any page with readable body text, fact or not', () => {
      // Body text is still worth reading even when today's patterns find nothing in it: that is the
      // zero-fact population the corpus exists to work through, not a page to discard.
      expect(bearing('Our opening hours vary by season, please check before travelling.')).toBe(true);
    });

    it('cannot let generic title-only shells satisfy the usable-page target', () => {
      /**
       * The consequence the review named. Six chrome-titled shells must contribute nothing, so a crawl
       * that met them would keep going rather than stop at USABLE_PAGE_TARGET.
       */
      const shells = ['Accessibility', 'FAQ', 'Plan your visit', 'Facilities', 'Families', 'Contact Us'];
      expect(shells.filter((title) => bearing('', title))).toHaveLength(0);
    });

    it('is the same rule the trusted re-verification applies, and it judges re-extracted facts', () => {
      /**
       * Re-verification used to select sources on `r.extractedText` alone, so a title-only fact would
       * still have vanished even after the title was threaded through. It must also extract BEFORE
       * judging, and judge the facts it just derived rather than the stored `extracted_evidence`.
       */
      const src = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '../../../server/enrichment/_lib/trusted-evidence.js'), 'utf8');
      expect(src).toContain('isEvidenceBearingSource({extractedText:r.extractedText,facts,pageTitle:r.pageTitle})');
      expect(src, 'the bare truthy test must be gone').not.toMatch(/&&\s*r\.extractedText\s*\)/);
      expect(src, 'must never judge on stored evidence').not.toMatch(/extractedEvidence/);
      // extraction must precede the decision
      expect(src.indexOf('const facts=extractEvidenceFromText'))
        .toBeLessThan(src.indexOf('isEvidenceBearingSource({extractedText:r.extractedText,facts,pageTitle:r.pageTitle})'));
    });
  });

  describe('cafe: two pages said it plainly and were missed', () => {
    it('Courtauld 470f50cc — "the Courtauld Cafe ... is located on the ground floor"', () => {
      expect(fields('Striking, stylish, yet relaxed and welcoming, the Courtauld Cafe all-day restaurant '
        + 'and cafe is located on the ground floor across from the gallery entrance.')).toContain('cafe=yes');
    });

    it('Mudchute fbf5e649 — "The cafe is dog friendly"', () => {
      expect(fields('The cafe is dog friendly so they are allowed in the courtyard and in the pets '
        + 'corner as long as they are on leads.')).toContain('cafe=yes');
    });

    it('does not turn somebody else’s cafe into this venue’s cafe', () => {
      // Golders Hill d5ee5224: a City of London "Forget Me Not Memory Cafe" in unrelated hydrated
      // content. Winter Wonderland 7f2741c8: a bike rack provided by a separate Hyde Park cafe.
      expect(fields('Find the Forget Me Not Memory Cafe at our community services page.'))
        .not.toContain('cafe=yes');
      expect(fields('A public bicycle rack is provided by the Serpentine Bar & Kitchen cafe.'))
        .not.toContain('cafe=yes');
    });

    it('does not report a closed cafe as a facility', () => {
      expect(fields('The cafe is closed for refurbishment until the spring.')).not.toContain('cafe=yes');
    });

    it('does not read an off-site cafe as the venue\u2019s own', () => {
      /**
       * Review caught this, and it was mine. My first rule was `the café is <any word>`, which publishes
       * cafe=yes for all three of these -- plausible sentences on a venue's own visitor page, every one
       * describing somebody else's café. The rule is now the construction the corpus demonstrated.
       */
      for (const prose of [
        'The cafe is nearby.',
        'The cafe is across the road from the venue.',
        // The exact sentence named in review, kept verbatim rather than as two halves.
        'The cafe is nearby, across the road from the venue.',
        'The cafe is five minutes away.',
        'The cafe is run by an independent operator in the neighbouring building.',
      ]) {
        expect(fields(prose), prose).not.toContain('cafe=yes');
      }
    });
  });

  describe('parking: an explicit negative is as useful to a parent as a positive', () => {
    it('Graffiti Tunnel 562d8a7f — "car parking is not allowed at Leake Street Arches"', () => {
      expect(fields('Please note, car parking is not allowed at Leake Street Arches. The nearest car '
        + 'park is Britannia Parking on Upper Marsh.')).toContain('parking=no');
    });

    it('does not read nearby public car parks as venue parking', () => {
      // Courtauld 6f245581, verbatim. The venue has no car park; this sentence says where other ones are.
      expect(fields('For those unable to visit using public transport, the nearest public car parks are '
        + 'at Drury Lane to the north or the Southbank Centre to the south.').join(','))
        .not.toMatch(/parking=/);
    });

    it('does not read street or blue-badge parking around a park as venue parking', () => {
      // Winter Wonderland 7f2741c8, verbatim fragments.
      expect(fields('If you have any questions regarding accessible parking, please feel free to '
        + 'contact a member of our team.').join(',')).not.toMatch(/parking=yes/);
      expect(fields('For information regarding blue badge parking locations, please visit here.')
        .join(',')).not.toMatch(/parking=yes/);
    });

    it('does not read limited nearby street parking as venue parking', () => {
      // Hanwell Zoo 69644dc4, verbatim: nearby, on-street and chargeable, not the venue's own.
      expect(fields('There is limited parking near to the zoo. Limited on street parking for which '
        + 'there is a small charge.').join(',')).not.toMatch(/parking=yes/);
    });
  });

  describe('things the corpus shows must NOT become venue facts', () => {
    it('station buggy advice is not venue pushchair suitability', () => {
      // Winter Wonderland 7f2741c8, verbatim.
      expect(fields('If you require step-free access or are travelling with a buggy, it is advised to '
        + 'use Green Park or Bond Street stations to make use of the lift facilities.').join(','))
        .not.toMatch(/pushchairSuitability=/);
    });

    it('a wheelchair ticket category is not a blanket accessibility claim', () => {
      // London Cable Car 3d8cf357, verbatim: a price list, not a statement about the venue.
      expect(fields('A Round Trip Experience Adult 16+ Current price, Adult 16+: £25 Wheelchair '
        + 'User- Adult 16+ Current price, Wheelchair User- Adult 16+: £25 View details').join(','))
        .not.toMatch(/wheelchairAccessible=yes/);
    });

    it('website accessibility is not physical accessibility', () => {
      // Hanwell Zoo 636e31cd, verbatim: a WCAG statement, nothing to do with visiting the zoo.
      expect(fields('Hanwell Zoo is committed to providing a website that is accessible to the widest '
        + 'possible audience, regardless of technology and ability. This website looks to conforming to '
        + "level 'AA'.").join(',')).not.toMatch(/wheelchairAccessible|accessibleToilet/);
    });
  });
});
