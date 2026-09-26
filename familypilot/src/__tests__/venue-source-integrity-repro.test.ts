import { describe, expect, it } from 'vitest';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  buildCommonPathCandidates,
  mergePageCandidates,
} = require('../../../server/enrichment/_lib/source-discovery');
const { findRelevantLinks } = require('../../../server/enrichment/_lib/html-text-extractor');

/**
 * P0 Venue Source Integrity — Phase 2: reproduce the defect before fixing it.
 *
 * Production serves facility facts read off a DIFFERENT venue's page. Tate Britain and Tate Modern
 * each serve three facts from the Tate Liverpool page; the South Kensington V&A serves a toilets
 * fact from the Wedgwood Collection in Stoke-on-Trent.
 *
 * These tests are CHARACTERISATION, not aspiration: every assertion below describes what the code
 * does today, so the defect is versioned and undeniable rather than argued about. The fix inverts
 * them in the same commit, which makes the behaviour change legible in the diff. They are driven by
 * the real crawl recorded in production, replayed from a checksummed corpus, so none of this rests
 * on a fixture invented to make a point.
 *
 * Root cause, in one line: `findRelevantLinks` scopes the crawl with
 *
 *     if (resolved.hostname !== base.hostname) continue;
 *
 * The crawl is bounded by HOST, never by VENUE. On the 16 domains that carry more than one
 * catalogue venue, that is not a bound at all.
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

describe('DEFECT 1: candidate pages are rooted at the origin, discarding the venue', () => {
  /**
   * `buildCommonPathCandidates` takes `new URL(homepageUrl).origin` and appends `/visit`,
   * `/accessibility`, `/facilities` and so on. For a venue whose website has a path of its own,
   * that throws the venue away and asks the site for its ORGANISATION-level pages.
   */
  it('asks tate.org.uk for organisation pages when crawling Tate Britain', () => {
    const candidates = buildCommonPathCandidates('https://www.tate.org.uk/visit/tate-britain', 20)
      .map((c: { url: string }) => c.url);

    // Every candidate has dropped `/visit/tate-britain` and sits at the site root.
    expect(candidates).toContain('https://www.tate.org.uk/visit');
    expect(candidates).toContain('https://www.tate.org.uk/accessibility');
    expect(candidates.every((u: string) => !u.includes('tate-britain'))).toBe(true);

    // Production confirms the consequence: `/visit` was fetched and stored for Tate Britain, and
    // the page calls itself "Plan Your Visit | Tate" -- the organisation, not the gallery.
    const stored = CRAWL.find(
      (r) => r.venue === 'Tate Britain' && r.sourceUrl === 'https://www.tate.org.uk/visit',
    );
    expect(stored?.pageTitle).toBe('Plan Your Visit | Tate');
  });

  it('does the same to the V&A, whose website is one site of four on that host', () => {
    const candidates = buildCommonPathCandidates('https://www.vam.ac.uk/south-kensington', 20)
      .map((c: { url: string }) => c.url);
    expect(candidates.every((u: string) => !u.includes('south-kensington'))).toBe(true);
  });

  it('is harmless only when the venue owns the whole host', () => {
    // Horniman's website is the bare origin, so there is no venue path to discard.
    const candidates = buildCommonPathCandidates('https://www.horniman.ac.uk/', 20)
      .map((c: { url: string }) => c.url);
    expect(candidates).toContain('https://www.horniman.ac.uk/visit');
  });
});

describe('DEFECT 2: link-following is bounded by host, so it walks into sibling venues', () => {
  /**
   * The real V&A and Tate sites carry a global nav listing every sister site. `findRelevantLinks`
   * accepts any same-host anchor, and the sister sites' URLs score highly because they match the
   * `/visit` path priority. The anchors below are the exact URLs production stored.
   */
  const tateNav = `
    <a href="/visit/tate-britain">Tate Britain</a>
    <a href="/visit/tate-modern">Tate Modern</a>
    <a href="/visit/tate-liverpool">Tate Liverpool</a>
    <a href="/visit/accessibility">Accessibility</a>
  `;

  it('offers Tate Liverpool as a source while crawling Tate Britain', () => {
    const links = findRelevantLinks(tateNav, 'https://www.tate.org.uk/visit/tate-britain', 30)
      .map((l: { url: string }) => l.url);
    expect(links).toContain('https://www.tate.org.uk/visit/tate-liverpool');
    expect(links).toContain('https://www.tate.org.uk/visit/tate-modern');
  });

  it('selects it into the fetch queue, not merely the discovery list', () => {
    const { pages, reserveCandidates } = mergePageCandidates(
      'https://www.tate.org.uk/visit/tate-britain',
      [],
      tateNav,
      5,
    );
    const queued = [...pages, ...reserveCandidates].map((p: { url: string }) => p.url);
    expect(queued).toContain('https://www.tate.org.uk/visit/tate-liverpool');
  });

  it('has exactly one scope rule, and it is the hostname', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/html-text-extractor.js'),
      'utf8',
    );
    expect(source).toContain('if (resolved.hostname !== base.hostname) continue;');
    // No rule anywhere in discovery consults the venue this crawl is for.
    const discovery = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/source-discovery.js'),
      'utf8',
    );
    expect(discovery.includes('familypilotPlaceId')).toBe(false);
    expect(discovery.includes('place_records')).toBe(false);
  });
});

describe('DEFECT 3: the stored evidence asserts a venue it never checked', () => {
  /**
   * `saveEvidenceRecord({ familypilotPlaceId, sourceUrl, ... })` stamps the row with the venue
   * whose crawl fetched it. Nothing compares the page to that venue, and no column records what
   * the page is actually about -- so downstream the stamp IS the only evidence of identity, and
   * `verifiedBundleForVenue(id)` reads it straight back as truth.
   */
  it('has no column for the subject of the page, only for the crawl target', () => {
    const store = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/evidence-store.js'),
      'utf8',
    );
    expect(store).toContain('familypilot_place_id: record.familypilotPlaceId');
    for (const absent of ['subject_venue_id', 'subject_place_id', 'evidence_subject']) {
      expect(store.includes(absent), `evidence-store should not yet know ${absent}`).toBe(false);
    }
  });

  it('publishes a fact without ever asking whether the page is about this venue', () => {
    const trusted = fs.readFileSync(
      path.join(__dirname, '../../../server/enrichment/_lib/trusted-evidence.js'),
      'utf8',
    );
    // eligibleFact gates on field, conflict, confidence, source TYPE, excerpt length, recency and
    // URL protocol. Venue identity is not among them.
    expect(trusted).toContain('function eligibleFact');
    expect(trusted.includes('venueMatches')).toBe(false);
    expect(trusted.includes('subjectVenue')).toBe(false);
  });
});

describe('the three named failures, replayed from production', () => {
  const namedFailure = (venue: string, sourceUrl: string) =>
    CRAWL.find((r) => r.venue === venue && r.sourceUrl === sourceUrl);

  it.each([
    ['Tate Britain', 'https://www.tate.org.uk/visit/tate-liverpool', 'Tate Liverpool + RIBA North | Tate'],
    ['Tate Modern', 'https://www.tate.org.uk/visit/tate-liverpool', 'Tate Liverpool + RIBA North | Tate'],
    ['Victoria and Albert Museum', 'https://www.vam.ac.uk/wedgwood/visit', 'Visit V&A Wedgwood Collection'],
  ])('%s stored a page titled "%s"', (venue, sourceUrl, expectedTitle) => {
    const row = namedFailure(venue as string, sourceUrl as string);
    expect(row, `${venue} should have stored ${sourceUrl}`).toBeDefined();
    // The page announced whose it was, in a column the pipeline already writes.
    expect(row!.pageTitle).toBe(expectedTitle);
    expect(row!.pageTitle.toLowerCase()).not.toContain((venue as string).toLowerCase());
  });

  it('the page was outside the venue\'s own subtree in every case', () => {
    for (const [venue, sourceUrl] of [
      ['Tate Britain', 'https://www.tate.org.uk/visit/tate-liverpool'],
      ['Tate Modern', 'https://www.tate.org.uk/visit/tate-liverpool'],
      ['Victoria and Albert Museum', 'https://www.vam.ac.uk/wedgwood/visit'],
    ]) {
      const row = namedFailure(venue, sourceUrl)!;
      expect(pathOf(row.sourceUrl).startsWith(pathOf(row.venueWebsite))).toBe(false);
    }
  });
});

describe('the counter-examples that stop the fix over-reaching', () => {
  /**
   * Royal Museums Greenwich is the case that rules out "same host, different path => wrong venue".
   * Three catalogue venues share rmg.co.uk, and the crawl mostly got it RIGHT, because RMG names
   * its pages. It also has genuinely shared organisation pages that legitimately apply to all
   * three. A fix that rejected every out-of-subtree page would throw those away.
   */
  it('keeps a venue-named page on a shared host', () => {
    const row = CRAWL.find(
      (r) => r.venue === 'Cutty Sark'
        && r.sourceUrl === 'https://www.rmg.co.uk/plan-your-visit/accessibility-cutty-sark',
    );
    expect(row?.pageTitle).toBe('Accessibility at Cutty Sark | Royal Museums Greenwich');
    // Outside the venue's subtree, yet unambiguously about the venue.
    expect(pathOf(row!.sourceUrl).startsWith(pathOf(row!.venueWebsite))).toBe(false);
  });

  it('keeps an organisation-wide page that applies to every site on the host', () => {
    const shared = CRAWL.filter(
      (r) => r.sourceUrl === 'https://www.rmg.co.uk/plan-your-visit/facilities-access',
    );
    expect(shared.map((r) => r.venue).sort())
      .toEqual(['Cutty Sark', 'National Maritime Museum', "Queen's House"]);
    // It names the organisation, not any one venue. This is a legitimately shared source, and the
    // user's instruction is explicit that such pages must not be mass-invalidated.
    expect(new Set(shared.map((r) => r.pageTitle)))
      .toEqual(new Set(['Accessibility at Royal Museums Greenwich | Royal Museums Greenwich']));
  });

  it("keeps a venue's own deeper page", () => {
    const row = CRAWL.find(
      (r) => r.venue === 'Flip Out Watford'
        && r.sourceUrl === 'https://www.flipout.co.uk/locations/watford/frequently-asked-questions',
    );
    expect(row?.pageTitle).toBe('Frequently Asked Questions About Flip Out Watford | FAQs');
  });
});
