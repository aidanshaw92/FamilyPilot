import { describe, expect, it } from 'vitest';

import {
  FAMILY_MATCH_UNREVIEWED,
  describeFamilyMatch,
  familyMatchOutOf,
  formatFamilyMatchNumber,
} from '@/src/utils/family-match-scale';

/**
 * One number, one scale. Before this helper the same 76 was "3.8 Family Fit" on Home, "76 Good
 * match" on Venue Detail and "76% Family Match" under the explanation.
 */
describe('Family Match scale', () => {
  it('prints the 0–100 score as a rating out of five, to one decimal', () => {
    expect(formatFamilyMatchNumber(76)).toBe('3.8');
    expect(formatFamilyMatchNumber(100)).toBe('5.0');
    expect(formatFamilyMatchNumber(0)).toBe('0.0');
    expect(formatFamilyMatchNumber(89)).toBe('4.5'); // 4.45 rounds half up
    expect(familyMatchOutOf()).toBe('5');
  });

  it('clamps an out-of-range score instead of printing more than the scale allows', () => {
    expect(formatFamilyMatchNumber(120)).toBe('5.0');
    expect(formatFamilyMatchNumber(-5)).toBe('0.0');
  });

  it('prints nothing for a score it does not have', () => {
    expect(formatFamilyMatchNumber(Number.NaN)).toBeNull();
    expect(formatFamilyMatchNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('describes a reviewed place with the same number in the badge, the spoken form and the secondary line', () => {
    const match = describeFamilyMatch(76, 'enriched');
    expect(match.unreviewed).toBe(false);
    expect(match.number).toBe('3.8');
    expect(match.classification).toBe('Good match');
    expect(match.badgeLabel).toBe('3.8 Family Match');
    expect(match.spoken).toBe('3.8 out of 5 Family Match, Good match');
    expect(match.secondary).toBe('3.8 out of 5 Family Match');
  });

  it('never prints a percentage anywhere', () => {
    for (const score of [0, 12, 50, 76, 99, 100]) {
      const match = describeFamilyMatch(score);
      expect(`${match.badgeLabel} ${match.spoken} ${match.secondary}`).not.toContain('%');
    }
  });

  it('gives an unreviewed place a status and no number, whatever its score says', () => {
    for (const status of ['provider_only', 'ai_draft'] as const) {
      const match = describeFamilyMatch(95, status);
      expect(match.unreviewed).toBe(true);
      expect(match.number).toBeNull();
      expect(match.badgeLabel).toBe(FAMILY_MATCH_UNREVIEWED);
      expect(match.classification).toBe('Not yet reviewed');
      expect(match.badgeLabel).not.toMatch(/\d/);
      expect(match.spoken).not.toMatch(/\d/);
      expect(match.secondary).toBe('Based on location and category only');
    }
  });

  it('treats an unknown score as unknown, not as unreviewed and not as zero', () => {
    const match = describeFamilyMatch(Number.NaN, 'enriched');
    expect(match.unreviewed).toBe(false);
    expect(match.number).toBeNull();
    expect(match.badgeLabel).not.toMatch(/NaN|0\.0/);
    expect(match.badgeLabel).toContain('not worked out yet');
  });

  it('uses the badge vocabulary for the unreviewed classification too, so one place never carries two statuses', () => {
    expect(describeFamilyMatch(80, 'provider_only').classification).toBe(FAMILY_MATCH_UNREVIEWED);
  });
});
