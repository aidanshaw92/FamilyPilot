import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { familyPhrase } from '@/src/services/planning/meet-halfway';
import { subjectPhrase } from '@/src/services/planning/routine-advice';
import { familyDisplayName } from '@/src/utils/family-title';

/**
 * Another family's name, as the person using the app sees it.
 *
 * The real-device test showed a bare first name as a family on Meet halfway ("Aidans"): a family added by postcode is
 * labelled with the first name typed for them, and that string was printed as if it were the family. A connection's label
 * is already a family ("Alex’s family"), so the sentences that added "’s family" to every label also read
 * "Alex’s family’s family". One helper decides, and both directions are pinned here.
 */
describe('a family label becomes a family name', () => {
  it('a first name typed for a family added by postcode is shown as their family', () => {
    expect(familyDisplayName('Hannah')).toBe('Hannah’s family');
    expect(familyDisplayName('Aidan')).toBe('Aidan’s family');
    expect(familyDisplayName('  Aidan  ')).toBe('Aidan’s family');
  });

  it('a name ending in s takes the plain apostrophe, matching the Profile title', () => {
    expect(familyDisplayName('James')).toBe('James’ family');
  });

  it('a name typed already possessive is not doubled', () => {
    expect(familyDisplayName('Aidan’s')).toBe('Aidan’s family');
    expect(familyDisplayName("Aidan's")).toBe('Aidan’s family');
    expect(familyDisplayName('James’')).toBe('James’ family');
  });

  it('a label that is already a family (a connection’s, a household’s, a fixed one) is shown as given', () => {
    expect(familyDisplayName('Alex’s family')).toBe('Alex’s family');
    expect(familyDisplayName("Alex's family")).toBe("Alex's family");
    expect(familyDisplayName('Shaw family')).toBe('Shaw family');
    expect(familyDisplayName('A FamilyPilot family')).toBe('A FamilyPilot family');
    expect(familyDisplayName('Our family')).toBe('Our family');
    // A household the parent named in their own words keeps them.
    expect(familyDisplayName('The Hills')).toBe('The Hills');
  });

  it('a legacy connection with no label still reads as a family, never as blank', () => {
    expect(familyDisplayName(undefined)).toBe('Another family');
    expect(familyDisplayName('')).toBe('Another family');
    expect(familyDisplayName('   ')).toBe('Another family');
  });

  it('never prints a bare first name, and never “family’s family”', () => {
    for (const label of ['Hannah', 'Aidan', 'James', 'Alex’s family', "Alex's family", 'Shaw family', 'Aidan’s', 'The Hills', '']) {
      const shown = familyDisplayName(label);
      expect(shown, label).toMatch(/family$|^The /);
      expect(shown, label).not.toMatch(/family[’']s family/i);
    }
  });
});

describe('sentences that name the other family use the same rule', () => {
  it('Meet halfway: a connection and a postcode family both read “X’s family”', () => {
    expect(familyPhrase('other', 'Hannah’s family')).toBe('Hannah’s family');
    expect(familyPhrase('other', 'Hannah')).toBe('Hannah’s family');
    expect(familyPhrase('mine', 'Our family')).toBe('your family');
  });

  it('routine advice: “the nap for Hannah’s family”, never “Hannah’s family’s family”', () => {
    const subject = (familyLabel: string) => ({ name: null, noun: 'nap' as const, familyLabel, yours: false });
    expect(subjectPhrase(subject('Hannah’s family'), 'nap')).toBe('the nap for Hannah’s family');
    expect(subjectPhrase(subject('Hannah'), 'nap')).toBe('the nap for Hannah’s family');
    expect(subjectPhrase(subject('Shaw family'), 'nap')).toBe('the nap for Shaw family');
  });
});

describe('every screen that shows another family by name goes through the helper', () => {
  const root = join(__dirname, '..', '..');
  const read = (path: string) => readFileSync(join(root, path), 'utf8');

  it('Meet halfway shows chips and journeys by family name, not the raw label', () => {
    const source = read('app/(tabs)/halfway.tsx');
    expect(source).toContain('label={familyDisplayName(candidate.label)}');
    expect(source).toContain("journey.role === 'mine' ? 'Your family' : familyDisplayName(journey.label)");
    expect(source).not.toMatch(/label=\{candidate\.label\}/);
  });

  it('Profile, the plan sheet and the Plans tab do too', () => {
    expect(read('src/components/profile/FamilySections.tsx')).not.toMatch(/<Text variant="heading3">\{family\.label\}<\/Text>/);
    expect(read('src/components/planning/ConnectedFamiliesPicker.tsx')).toContain('familyDisplayName(family.label)');
    expect(read('src/components/planning/PlanningAccount.tsx')).toContain('familyDisplayName(c.family?.label)');
    expect(read('app/(tabs)/trips.tsx')).toContain('familyDisplayName(f.label)');
  });

  it('adding a family by postcode asks for their first name and says how it will be shown', () => {
    const source = read('src/components/planning/AddFamilyByPostcode.tsx');
    expect(source).toContain('label="Their first name"');
    expect(source).toContain('They’ll show as “Hannah’s family”');
  });
});
