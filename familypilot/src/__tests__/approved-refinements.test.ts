import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { placeUnreviewed } from '@/src/services/planning/halfway-view';

/**
 * The refinements approved after the iPhone review: say "not yet reviewed" once, invite a family that is only on this phone to
 * connect, change the outing without starting again, and a venue action that continues an outing instead of starting one.
 */

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/.*$/gm, '');

const fit = (verdict: string) => ({ fits: { mine: { verdict }, other: { verdict } } });

describe('Meet halfway says "not yet reviewed" once', () => {
  it('a place that has not been reviewed for families is one fact, not a grade per family', () => {
    expect(placeUnreviewed(fit('not_reviewed'))).toBe(true);
  });

  it('a reviewed place, or one family not assessed, keeps a grade per family', () => {
    expect(placeUnreviewed(fit('good'))).toBe(false);
    expect(placeUnreviewed({ fits: { mine: { verdict: 'not_reviewed' }, other: { verdict: 'not_assessed' } } })).toBe(false);
    expect(placeUnreviewed({ fits: { mine: { verdict: 'good' }, other: { verdict: 'not_reviewed' } } })).toBe(false);
  });

  it('the collapsed card, the list and the details sheet all go through the one chip rule', () => {
    expect(code('src/components/halfway/Sheet.tsx')).toContain('<FitChips option={option} otherLabel={otherLabel} />');
    expect(code('src/components/halfway/ListCard.tsx')).toContain('<FitChips option={option} otherLabel={otherLabel} />');
    expect(code('src/components/halfway/Sheet.tsx')).toMatch(/placeUnreviewed\(option\) \?[\s\S]*<FamilyFitUnreviewed/);
  });

  it('the combined card keeps uncertainty visible and claims nothing about the other family', () => {
    const parts = code('src/components/halfway/parts.tsx');
    const start = parts.indexOf('export function FamilyFitUnreviewed');
    const card = parts.slice(start, parts.indexOf('\n}\n', start));
    expect(card).toContain('We haven’t reviewed this place for families yet');
    expect(card).toContain('So neither family is graded.');
    // Your own family's lines (confirmed, expected, still to check, and the meter) are still drawn, by the one component that may read them.
    expect(card).toContain('<FamilyFitMine option={option} bare />');
    // Nothing is read from the other family here at all.
    expect(card).not.toMatch(/fits\.other|familyMatch|ages|required|pushchair|routines|children/);
  });
});

describe('a family only on this phone can be invited to connect, with the existing consent', () => {
  const families = code('src/components/profile/FamilySections.tsx');

  it('uses the existing invitation: the same create call, routines NOT shared, and the same link card with its terms', () => {
    expect(families).toContain("void families.create('friend', false);");
    expect(families).toContain('<InviteLinkCard url={invite.url} relationship={invite.relationship} />');
    expect(families).not.toMatch(/families\.create\('friend', true\)/);
  });

  it('needs an account like every invitation, and says nothing is shared until they accept', () => {
    const start = families.indexOf('local-family-invite');
    const around = families.slice(Math.max(0, start - 900), start + 900);
    expect(around).toContain('accountsAvailable ?');
    expect(families).toContain('can’t see or receive anything: plans stay on your phone.');
  });

  it('only a family on this phone has the button: a connected family does not', () => {
    const connectedRow = families.slice(families.indexOf('connected-family-row'), families.indexOf('testID="local-family-row"'));
    expect(connectedRow).not.toContain('local-family-invite');
  });
});

describe('the outing can be changed in place, and the venue action matches the situation', () => {
  const venue = code('app/venue/[id].tsx');
  const plan = code('app/plan.tsx');

  it('the venue’s action continues an outing and starts a plan otherwise', () => {
    expect(venue).toContain("label={outing ? 'Plan this day' : 'Create a plan'}");
  });

  it('the outing line has a Change that opens the sheet here, on the same place', () => {
    expect(venue).toMatch(/testID="venue-outing-change"/);
    expect(venue).toMatch(/onPress=\{\(\) => setPlanSheetOpen\(true\)\}[\s\S]{0,200}venue-outing-change/);
  });

  it('the plan can change the day, arrival or who is coming without starting again, and keeps the chosen lunch', () => {
    expect(read('src/components/planning/PlanScreenView.tsx')).toContain('testID="plan-change-outing"');
    expect(plan).toContain("...(lunchParam ? { lunch: lunchParam } : {})");
    expect(plan).toContain("...(lunchPlaceParam ? { lunchPlace: lunchPlaceParam } : {})");
    expect(venue).toContain('...(lunch ? { lunch } : {})');
    expect(venue).toContain('...(lunchPlace ? { lunchPlace } : {})');
  });

  it('changing the outing from the plan does not turn it into the next default: only what is changed is remembered', () => {
    expect(venue).toContain('optionsToRemember(next, outing ?? reopenedDraft ?? planDefaults.draft)');
  });

  it('the bar measures itself, so a wrapped outing line at larger text never covers the page’s last line', () => {
    expect(venue).toContain('setPlanBarHeight(Math.ceil(event.nativeEvent.layout.height))');
  });
});
