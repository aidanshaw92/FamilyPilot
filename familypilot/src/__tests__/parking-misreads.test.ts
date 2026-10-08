import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractEvidenceFromText, EXTRACTOR_VERSION } = require('../../../server/enrichment/_lib/evidence-extractor.js');

/**
 * The two wrong parking facts the existing-facts audit found among 24 sampled served facts (8 Oct 2026), and a third the
 * investigation found beside one of them. Every string is the stored page text, verbatim (whitespace collapsed).
 */

const meta = (url: string) => ({ url, sourceType: 'official_website' as const, retrievedAt: '2026-10-01T00:00:00.000Z' });
function parking(text: string, url = 'https://venue.example/visit'): string[] {
  const out = extractEvidenceFromText(text, meta(url));
  const facts = Array.isArray(out) ? out : (out?.facts ?? []);
  return [...new Set<string>(facts
    .filter((f: { field: string }) => f.field === 'parking' || f.field === 'freeParking')
    .map((f: { field: string; value: string }) => `${f.field}=${f.value}`))].sort();
}

const COLNE =
  'How to Find Us Colne Valley Regional Park Visitor Centre (temporarily closed) Denham Court Drive Denham Bucks UB9 5PG ' +
  'Directions: We can be found in Denham Country Park, follow the brown signs from the M40 Junction 1 or the A40 Denham ' +
  'roundabout. Sat Nav: UB9 5PG Parking There are two carparks run by Bucks County Council . Parking charges apply year ' +
  'round. Parking is not permitted on Denham Court Drive. For a full breakdown of parking and permit charges click here .';

const QEOP =
  'Venue parking London Stadium There is no general parking at London Stadium. To apply for a space, email ' +
  'accessibility@westhamunited.co.uk . Six spaces will be allocated to blue badge holders from the visiting team at every ' +
  'match. Lee Valley VeloPark Venue car parking is available for up to 3 hours for facility users and is payable online or ' +
  'by phone, following the instructions on the signs throughout the car park. Lee Valley Hockey and Tennis Centre Venue car ' +
  'parking is available for up to 3 hours for facility users and is payable online or by phone, following the instructions ' +
  'on the signs throughout the car park. Car Parking Tariffs Please refer to venue specific car park signage for parking ' +
  'tariffs. Any vehicles using the car parks without visiting a venue will be subject to the full charge of up to £49.50.';
const QEOP_STREET = 'Timber Lodge Cafe The nearby Olympic Park Avenue has on-street pay and display spaces and Blue Badge spaces with easy access to the Park.';

describe('Colne Valley Regional Park: a road rule read as "no parking on site"', () => {
  it('reads the venue’s own car parks and their charge, and not the road’s rule', () => {
    expect(parking(COLNE)).toEqual(['freeParking=no', 'parking=yes']);
  });
  it('the road sentence alone says nothing about the venue', () => {
    expect(parking('Parking is not permitted on Denham Court Drive.')).toEqual([]);
  });
});

describe('Queen Elizabeth Olympic Park: a venue’s car park for its own users read as the park’s parking', () => {
  it('neither VeloPark nor the hockey centre’s user parking is the park’s parking', () => {
    expect(parking(QEOP)).not.toContain('parking=yes');
  });
  it('on-street pay and display on a nearby avenue is not the park’s charge', () => {
    expect(parking(QEOP_STREET)).not.toContain('freeParking=no');
  });
});

describe('what must not change', () => {
  it.each([
    ['car parking is not allowed at Leake Street Arches.', 'parking=no'], // the Graffiti Tunnel's own rule, AT the venue
    ['There is no parking onsite but there are numerous car parks near to Madame Tussauds.', 'parking=no'],
    ['There are no parking facilities at Tate Modern or in the surrounding streets.', 'parking=no'],
    ['We have a large car park with dedicated disabled parking.', 'parking=yes'],
    ['Parking charges apply year round.', 'freeParking=no'],
    ['There is a small car park at the top of Streatham Common South', 'parking=yes'],
  ])('%s -> %s', (text, expected) => {
    expect(parking(text)).toContain(expected);
  });

  it.each([
    'Double yellow lines mean no parking at any time.',
    'Parking is available at the Harlequin Shopping Centre car parks.',
    'Parking is reserved for residents only.',
    'Free parking for hotel guests.',
  ])('still not the venue’s parking: %s', (text) => {
    expect(parking(text).filter((f) => f.endsWith('=yes') || f === 'parking=no')).toEqual([]);
  });

  it('the rules version moved, so a re-read knows these drafts used the new rules', () => {
    expect(EXTRACTOR_VERSION).toBe('official-source-rules-v5');
  });
});
