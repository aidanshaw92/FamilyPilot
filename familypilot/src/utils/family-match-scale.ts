import { EnrichmentStatus } from '@/src/types';
import { getMatchClassification, MatchClassification } from '@/src/utils/family-match-classification';
import { isUnreviewedEnrichmentStatus } from '@/src/utils/enrichment-rules';

/**
 * ONE presentation of the Family Match number, everywhere.
 *
 * The score is computed on 0–100. The approved Home frame shows it as a rating out of five
 * ("★ 4.0 Family Match", node 8:13) because that is the shape parents already read. Before this
 * module the same 76 was "3.8 Family Fit" on Home, "76 Good match" on Venue Detail and "76% Family
 * Match" under the explanation — three scales for one number, which a parent cannot tell are the
 * same thing. This is the single place the scale lives; flip the constant and every surface moves.
 */
export const FAMILY_MATCH_SCALE: 'five-star' | 'percent' = 'five-star';

export const FAMILY_MATCH_LABEL = 'Family Match';

/** What an unreviewed place says instead of a number. The product does not invent a score it has
 * not earned, so this is a status, not a verdict. */
export const FAMILY_MATCH_UNREVIEWED = 'Not yet reviewed';

/** Honest reason the unreviewed badge carries no number. */
export const FAMILY_MATCH_UNREVIEWED_DETAIL = 'Based on location and category only';

/**
 * The number as the badge prints it, or null when there is no number to print. A non-finite score
 * (a restored Saved place whose score has not been recomputed yet) is unknown, not zero, so it gets
 * no digits rather than "NaN" or "0.0".
 */
export function formatFamilyMatchNumber(score: number): string | null {
  if (!Number.isFinite(score)) return null;
  const clamped = Math.min(100, Math.max(0, score));
  if (FAMILY_MATCH_SCALE === 'percent') return `${Math.round(clamped)}%`;
  return (Math.round((clamped / 20) * 10) / 10).toFixed(1);
}

/** The scale's ceiling, for "4.0 out of 5" in accessibility labels. */
export function familyMatchOutOf(): string {
  return FAMILY_MATCH_SCALE === 'percent' ? '100' : '5';
}

export interface FamilyMatchDescription {
  /** FamilyPilot has not reviewed this place: no number is shown anywhere. */
  unreviewed: boolean;
  /** Printed digits, or null when unknown (non-finite) or unreviewed. */
  number: string | null;
  /** The word that leads: "Good match", "Worth considering", or the unreviewed status. */
  classification: MatchClassification;
  /** Text inside the badge, e.g. "4.0 Family Match" (the star is drawn, not typed) or the status. */
  badgeLabel: string;
  /** Spoken form for screen readers, e.g. "4.0 out of 5 Family Match, Good match". */
  spoken: string;
  /** The quiet line under an explanation: the number with its scale, or why there is none. */
  secondary: string;
}

export function describeFamilyMatch(
  score: number,
  enrichmentStatus?: EnrichmentStatus,
): FamilyMatchDescription {
  const unreviewed = isUnreviewedEnrichmentStatus(enrichmentStatus);
  const classification = getMatchClassification(score, enrichmentStatus);
  const number = unreviewed ? null : formatFamilyMatchNumber(score);

  if (unreviewed) {
    return {
      unreviewed,
      number: null,
      classification,
      badgeLabel: FAMILY_MATCH_UNREVIEWED,
      spoken: `Family suitability ${FAMILY_MATCH_UNREVIEWED.toLowerCase()}`,
      secondary: FAMILY_MATCH_UNREVIEWED_DETAIL,
    };
  }
  if (number === null) {
    return {
      unreviewed,
      number: null,
      classification,
      badgeLabel: `${FAMILY_MATCH_LABEL} not worked out yet`,
      spoken: `${FAMILY_MATCH_LABEL} not worked out yet`,
      secondary: `${FAMILY_MATCH_LABEL} not worked out yet`,
    };
  }
  const withScale = FAMILY_MATCH_SCALE === 'percent' ? number : `${number} out of ${familyMatchOutOf()}`;
  return {
    unreviewed,
    number,
    classification,
    badgeLabel: `${number} ${FAMILY_MATCH_LABEL}`,
    spoken: `${withScale} ${FAMILY_MATCH_LABEL}, ${classification}`,
    secondary: `${withScale} ${FAMILY_MATCH_LABEL}`,
  };
}
