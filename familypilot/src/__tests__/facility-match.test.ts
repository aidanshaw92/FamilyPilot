import { describe, expect, it } from 'vitest';

import { createEmptyProfile } from '@/src/utils/profile-defaults';
import { buildFacilityMissingCaution } from '@/src/utils/facility-match';

describe('buildFacilityMissingCaution', () => {
  it('returns null when the family has no must-haves set', () => {
    expect(buildFacilityMissingCaution(createEmptyProfile(), ['toilets'])).toBeNull();
  });

  it('returns null when the venue’s facilities are not yet known', () => {
    const profile = { ...createEmptyProfile(), mustHaveFacilities: ['toilets' as const] };
    expect(buildFacilityMissingCaution(profile, [])).toBeNull();
    expect(buildFacilityMissingCaution(profile, undefined)).toBeNull();
  });

  it('returns null when every must-have is present', () => {
    const profile = {
      ...createEmptyProfile(),
      mustHaveFacilities: ['toilets' as const, 'parking' as const],
    };
    expect(buildFacilityMissingCaution(profile, ['toilets', 'parking', 'cafe'])).toBeNull();
  });

  it('names a single missing must-have', () => {
    const profile = { ...createEmptyProfile(), mustHaveFacilities: ['baby_changing' as const] };
    expect(buildFacilityMissingCaution(profile, ['toilets', 'parking'])).toBe(
      'Missing baby changing, which you said your family needs',
    );
  });

  it('joins multiple missing must-haves', () => {
    const profile = {
      ...createEmptyProfile(),
      mustHaveFacilities: ['toilets' as const, 'pushchair_friendly' as const],
    };
    expect(buildFacilityMissingCaution(profile, ['cafe'])).toBe(
      'Missing toilets and pushchair access, which you said your family needs',
    );
  });
});
