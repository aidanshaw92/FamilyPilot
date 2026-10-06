import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { blankAdult, blankChild, buildOnboardingProfile } from '@/src/utils/onboarding-draft';

/**
 * "Who else is in your household?" must ask for a PERSON first.
 *
 * Real-device test: under that question the first (and, until "+ Add another adult" was tapped, the only) field was
 * labelled "Family name". It is the household's surname ("Shaw" → "Shaw family"), but sitting under a question about
 * people it read as "their name", and a parent typed their partner's first name into it. The model was right; the
 * screen asked the wrong thing first. These pin the wording and the order, and that nothing about the model changed.
 */
const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('the household step asks for their first name, not a family name', () => {
  const setup = read('app/(onboarding)/setup.tsx');
  const household = setup.slice(setup.indexOf("{step === 'household' ? ("), setup.indexOf("{step === 'children' ? ("));

  it('labels the other person’s field “Their first name”, with how they’re connected underneath', () => {
    expect(household).toContain('label="Their first name"');
    expect(household).toContain('How they’re connected to you');
    expect(household.indexOf('label="Their first name"')).toBeLessThan(household.indexOf('ADULT_RELATIONSHIP_LABEL[relationship]'));
  });

  it('never calls any field on the step a “Family name”', () => {
    expect(household).not.toMatch(/Family name/i);
  });

  it('keeps the household’s own name as a separate, optional, later field that says what it is', () => {
    expect(household).toContain('label="Household name (optional)"');
    expect(household).toContain('Your family’s surname, shown as “Shaw family”');
    expect(household.indexOf('label="Their first name"')).toBeLessThan(household.indexOf('label="Household name (optional)"'));
  });

  it('opens with one person card, so the first field under the question is a person', () => {
    expect(setup).toContain("useState<DraftAdult[]>(() => [blankAdult('partner')])");
  });

  it('a card left blank means “just me”, not an error to clear', () => {
    expect(setup).not.toContain('Add a name for each adult, or remove them');
  });
});

describe('Edit profile uses the same words', () => {
  const edit = read('app/profile/edit.tsx');
  it('“Their first name” for another adult, “Household name” for the surname, no “Family name”', () => {
    expect(edit).toContain('label="Their first name"');
    expect(edit).toContain('label="Household name (optional)"');
    expect(edit).not.toMatch(/label="Family name/);
  });
});

describe('the household model is unchanged', () => {
  const base = {
    parentName: 'Aidan',
    homeLocation: 'WD23',
    home: { latitude: 51.64, longitude: -0.36 },
    children: [{ ...blankChild(), name: 'Ozzie', day: '1', month: '3', year: '2025' }],
    now: new Date('2026-10-06T12:00:00'),
  };

  it('a blank person card is never saved as a person', () => {
    const profile = buildOnboardingProfile({ ...base, adults: [blankAdult('partner')] });
    expect(profile.members!.filter((m) => m.role !== 'child').map((m) => m.name)).toEqual(['Aidan']);
    expect(profile.familyName).toBeUndefined();
  });

  it('a first name is a person with their relationship; the household name stays a household label', () => {
    const profile = buildOnboardingProfile({ ...base, familyName: 'Shaw', adults: [{ ...blankAdult('partner'), name: 'Ellie' }] });
    const ellie = profile.members!.find((m) => m.name === 'Ellie');
    expect(ellie).toEqual(expect.objectContaining({ relationship: 'partner' }));
    expect(profile.familyName).toBe('Shaw');
    // No surname is asked of anyone: a household with no name is complete.
    expect(buildOnboardingProfile({ ...base }).familyName).toBeUndefined();
  });
});
