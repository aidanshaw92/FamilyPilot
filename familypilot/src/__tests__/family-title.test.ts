import { describe, expect, it } from 'vitest';

import { familyTitle } from '@/src/utils/family-title';

/** The Profile card used to print "The  Family" for an empty name and "The Aidan Shaw Family" for a full one. */
describe('the family title on Profile', () => {
  it('is possessive on the first name', () => {
    expect(familyTitle('Aidan')).toBe('Aidan’s family');
    expect(familyTitle('Aidan Shaw')).toBe('Aidan’s family');
  });

  it('handles a name ending in s without a double s', () => {
    expect(familyTitle('James')).toBe('James’ family');
  });

  it('never prints an empty possessive', () => {
    expect(familyTitle('')).toBe('Your family');
    expect(familyTitle('   ')).toBe('Your family');
    expect(familyTitle(undefined)).toBe('Your family');
  });
});
