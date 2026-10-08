import { describe, expect, it } from 'vitest';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { extractEvidenceFromText, EXTRACTOR_VERSION } = require('../../../server/enrichment/_lib/evidence-extractor.js');

/**
 * The extraction pilot (rules v6, 8 Oct 2026): facts the venues' own stored pages state plainly and the rules missed, and
 * the look-alikes that must stay unknown. Every string is stored page text, verbatim (whitespace collapsed).
 */

const facts = (text: string): string[] => {
  const out = extractEvidenceFromText(text, { url: 'https://venue.example/visit', sourceType: 'official_website', retrievedAt: new Date().toISOString() });
  return [...new Set<string>(out.filter((f: { confidence: string }) => f.confidence === 'high').map((f: { field: string; value: string }) => `${f.field}=${f.value}`))].sort();
};

describe('recovered: stated plainly, missed before v6', () => {
  it.each([
    ['Step-free access is available throughout the museum, with some ramps and slopes', 'wheelchairAccessible=yes'], // Gunnersbury
    ['Step-free access is available to the Museum and to our galleries.', 'wheelchairAccessible=yes'], // Museum of the Home
    ['General Access Around the Museum We have step-free access around our site.', 'wheelchairAccessible=yes'], // RAF Museum
    ['Wheelchair users and physically disabled visitors All floors of the Queen’s House have lift access.', 'wheelchairAccessible=yes'],
    ['Getting around the National Maritime Museum Lifts The building has accessible lifts to every floor.', 'wheelchairAccessible=yes'],
    ['All floors have lifts and there is level access between the galleries on each floor.', 'wheelchairAccessible=yes'], // Saatchi
    ['Lift access is available to all floors.', 'wheelchairAccessible=yes'], // Wallace Collection
    ['The London Eye is a wheelchair-friendly attraction with full accessibility throughout.', 'wheelchairAccessible=yes'],
    ['Toilets The main toilets are next to the cafe in the Dry Berth at level –1, underneath the ship.', 'toilets=yes'], // Cutty Sark
    ['Toilets The main toilets are next to the cafe in the Dry Berth at level –1, underneath the ship.', 'cafe=yes'],
    ['Toilets Toilets, including a disabled toilet, are available in the courtyard and extensive hand washing facilities are available throughout the farm.', 'toilets=yes'], // Mudchute
    ['Buy tickets Baby changing Baby changing is available in the toilets by the Café and pushchairs are welcome throughout the grounds.', 'toilets=yes'], // Chiswick
    ['Toilets and baby changing There is an accessible toilet and baby changing facilities in the cafe.', 'toilets=yes'], // Hackney City Farm
    ['Main Café 10.00 to 17.00', 'cafe=yes'], // V&A
    ['Tate Modern Corner Cafe, Bar, Venue Opening times Sunday to Monday 10.00–18.00 Tuesday to Saturday 10.00–23.00', 'cafe=yes'],
    ['car parks are locked in accordance with park locking times number of bicycle locking stands located throughout the park', 'parking=yes'], // Northala
  ])('%s -> %s', (text, expected) => {
    expect(facts(text)).toContain(expected);
  });
});

describe('must stay unknown', () => {
  it.each([
    // Somebody else's step-free access.
    ['Hoxton Station has step-free access and London Overground staff are available to assist passengers during museum opening times.', 'wheelchairAccessible'],
    ['Our nearest step-free station is Paddington Station, where you can catch local buses to the museum.', 'wheelchairAccessible'],
    ['Both our community buildings offer step-free access.', 'wheelchairAccessible'],
    ['The toilets located in the Homestead Courtyard which was renovated and reopened in 2019 are step-free, with sensor taps and soap dispenser.', 'wheelchairAccessible'],
    ['Wheelchair accessible picnic tables will be added, and the waterplay and sand area will have raised tables.', 'wheelchairAccessible'],
    // Another place's accessible toilet: Sydenham Hill Wood served "accessible toilet: yes" from this until v6.
    ['Changing Places Toilet The nearest Changing Places Toilet can be found in Dulwich Park, College Road (College Gate Entrance).', 'accessibleToilet'],
    // Somebody else's café, and a day-only kiosk.
    ['A public bicycle rack is provided by the Serpentine Bar & Kitchen cafe.', 'cafe'],
    ['The Kiosk Community Café: every Saturday 9am to 2pm', 'cafe'],
    // Somebody else's car park.
    ['For other parking, Jack Straws car park is a 10 minute walk.', 'parking'],
  ])('%s (no %s)', (text, field) => {
    expect(facts(text).filter((f) => f.startsWith(`${field}=yes`))).toEqual([]);
  });

  it('a page that says its café is closed for now publishes no café, whatever else it says about it', () => {
    const colne = 'Please note, The Riverside Café is temporarily closed for business. In the cafe itself there is an open kitchen, so please keep dogs outside.';
    expect(facts(colne)).not.toContain('cafe=yes');
    const faq = 'We have not heard when exactly it will be reopened; in the meantime the future operators are selling refreshments in the car park. In the cafe itself there is an open kitchen, so please keep dogs outside.';
    expect(facts(faq)).not.toContain('cafe=yes');
  });

  it('a café with a seasonal schedule is still a café', () => {
    const hackney = 'The cafe is usually closed from 20th December and usually reopens 3 January. Yes, one outside near the cafe entrance and there are two inside the cafe (one of these has disabled access).';
    expect(facts(hackney)).toContain('cafe=yes');
  });

  it('records the rules version', () => {
    expect(EXTRACTOR_VERSION).toBe('official-source-rules-v6');
  });
});
