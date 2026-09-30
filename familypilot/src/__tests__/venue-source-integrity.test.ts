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
