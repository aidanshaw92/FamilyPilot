import { describe, expect, it } from 'vitest';

import { HalfwayFit, HalfwayJourney, HalfwayOption } from '@/src/services/planning/meet-halfway';
import { chipName, chipsFitBeside, journeyBars, journeysKnown, journeysUneven, listCardMeta, missingJourneyNotice, startingPointLabel, optionLabel, otherFitProvenance, positionLine, shortFamilyName } from '@/src/services/planning/halfway-view';

const journey = (role: 'mine' | 'other', minutes: number, label = role === 'mine' ? 'Our family' : 'Kevin’s family'): HalfwayJourney => ({ role, familyId: role, label, minutes, leave: 0, home: 0 });
const fit = (over: Partial<HalfwayFit> = {}): HalfwayFit => ({ verdict: 'good', label: 'Good fit', qualified: false, ...over });

describe('Meet halfway v2: what the screen says', () => {
  it('names the other family by its first name on the chip, and yours "You"', () => {
    expect(shortFamilyName('Kevin’s family')).toBe('Kevin’s');
    expect(shortFamilyName('Hannah')).toBe('Hannah’s');
    expect(shortFamilyName('The Hills')).toBe('The Hills');
    expect(chipName('mine', 'anything')).toBe('You');
    expect(chipName('other', 'James')).toBe('James’');
  });

  it('draws the journeys as bars proportional to each other: the longer one is full, none is invented', () => {
    const bars = journeyBars([journey('mine', 4), journey('other', 11)]);
    expect(bars.map((b) => b.time)).toEqual(['about 4 min', 'about 11 min']);
    expect(bars[1].share).toBe(1);
    expect(bars[0].share).toBeCloseTo(4 / 11, 5);
    expect(bars.map((b) => b.who)).toEqual(['Your family', 'Kevin’s family']);
  });

  it('a journey that could not be worked out is shown as not worked out, and no fairness is claimed', () => {
    const journeys: [HalfwayJourney, HalfwayJourney] = [journey('mine', 4), journey('other', Number.NaN)];
    const bars = journeyBars(journeys);
    expect(bars[1]).toMatchObject({ missing: true, share: 0, time: 'not worked out yet' });
    expect(journeysKnown({ journeys })).toBe(false);
    expect(missingJourneyNotice({ journeys })).toEqual({
      title: 'We couldn’t work out Kevin’s journey',
      body: 'Check the postcode you added, then try again. No fairness is claimed until both are known.',
    });
    expect(missingJourneyNotice({ journeys: [journey('mine', 4), journey('other', 6)] })).toBeNull();
  });

  it('calls the journeys uneven only past the engine’s own "close" line', () => {
    expect(journeysUneven({ gap: 10 })).toBe(false);
    expect(journeysUneven({ gap: 11 })).toBe(true);
  });

  it('uses the engine’s label and never claims "for both" where it is not supported', () => {
    expect(optionLabel({ checks: 2, supported: false })).toBe('Promising option · 2 things to check');
    expect(optionLabel({ checks: 1, supported: false })).toBe('Promising option · 1 thing to check');
    expect(optionLabel({ checks: 0, supported: false })).toBe('Best compromise');
    expect(optionLabel({ checks: 0, supported: true })).toBe('Best for both');
  });

  it('words a card’s meta and the sheet’s position line', () => {
    const option = { venue: { category: 'farm' }, checks: 2 } as unknown as HalfwayOption;
    expect(listCardMeta(option)).toBe('Farm · 2 things to check');
    expect(listCardMeta({ ...option, checks: 0 } as HalfwayOption)).toBe('Farm');
    expect(positionLine(option, 0, 5)).toBe('Farm · 1 of 5');
  });

  it('says "Not assessed" for a family that shared too little, and names nothing about them', () => {
    const words = otherFitProvenance(fit({ verdict: 'not_assessed', label: 'Not assessed' }), 'Kevin’s family');
    expect(words.headline).toBe('Not assessed');
    expect(words.note).toContain('Kevin’s family hasn’t shared enough');
  });

  it('the other family’s words rest only on what they chose to share, and say nothing of what that was', () => {
    for (const verdict of ['excellent', 'good', 'possible', 'poor', 'not_reviewed'] as const) {
      for (const qualified of [false, true]) {
        const { headline, note } = otherFitProvenance(fit({ verdict, qualified }), 'Kevin’s family');
        const text = `${headline} ${note}`;
        expect(text).not.toMatch(/\bage[ds]?\b|year-old|child|baby|toddler|toilet|pushchair|buggy|nap|feed|routine|allerg|wheelchair|step-free|parking|postcode|\d/i);
        if (verdict !== 'not_reviewed') expect(note).toBe('Based only on what Kevin’s family chose to share. Nothing else is shown or known about them.');
      }
    }
    expect(otherFitProvenance(fit({ verdict: 'poor' }), 'Kevin’s family').headline).toBe('Family Fit says this probably isn’t right for Kevin’s family');
  });

  it('shows a starting point only as a postcode district or an area name, the same word a connection is shown', () => {
    expect(startingPointLabel('NW5 2AB')).toBe('NW5');
    expect(startingPointLabel('nw52ab')).toBe('NW5');
    expect(startingPointLabel('E8 3PN')).toBe('E8');
    expect(startingPointLabel('SW1A 1AA')).toBe('SW1A');
    expect(startingPointLabel('Camden, London')).toBe('Camden');
    expect(startingPointLabel('12 High St, Bushey')).toBe('Bushey');
    expect(startingPointLabel('')).toBe('Nearby');
  });
});

describe('Meet halfway v2: where the Family Fit chips sit on the card', () => {
  it('short grades sit side by side beside the photo, long ones go under it', () => {
    // 393 wide: 393 - 40 margins - 80 photo - 12 gap = 261 for the column.
    expect(chipsFitBeside([{ name: 'You', grade: 'Good fit' }, { name: 'Kevin’s', grade: 'Good fit' }], 261)).toBe(true);
    expect(chipsFitBeside([{ name: 'You', grade: 'Not yet reviewed' }, { name: 'Kevin’s', grade: 'Not assessed' }], 261)).toBe(false);
    expect(chipsFitBeside([{ name: 'You', grade: 'Looks practical' }, { name: 'Kevin’s', grade: 'Good fit' }], 261)).toBe(false);
  });
});
