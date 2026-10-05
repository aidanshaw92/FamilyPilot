import { describe, expect, it } from 'vitest';

import { documentTitleFor } from '@/src/utils/document-title';

describe('documentTitleFor', () => {
  it('names each top-level screen', () => {
    expect(documentTitleFor('/')).toBe('Home · FamilyPilot');
    expect(documentTitleFor('/explore')).toBe('Explore London · FamilyPilot');
    expect(documentTitleFor('/saved')).toBe('Saved places · FamilyPilot');
    expect(documentTitleFor('/welcome')).toBe('Welcome · FamilyPilot');
    expect(documentTitleFor('/venue/abc')).toBe('Place details · FamilyPilot');
    expect(documentTitleFor('/plan')).toBe('Your plan · FamilyPilot');
  });

  it('does not let a prefix claim a different route', () => {
    expect(documentTitleFor('/planner-tools')).toBe('FamilyPilot');
    expect(documentTitleFor('/explorer')).toBe('FamilyPilot');
    expect(documentTitleFor('/trips-archive')).toBe('FamilyPilot');
  });

  it('falls back to the product name for a route it does not know', () => {
    expect(documentTitleFor('/something/else')).toBe('FamilyPilot');
  });
});
