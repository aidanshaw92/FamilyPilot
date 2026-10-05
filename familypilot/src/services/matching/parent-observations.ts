import type { VenueTrust, VenueTrustField, VisitField } from '@/src/services/planning/feedback';

/**
 * What parents have reported about a venue, in the only form Family Fit may see it.
 *
 * THE CONFIDENCE CONTRACT (the server decides, `server/feedback/_lib/rules.js` `confidenceOf`):
 *   official             authoritative; Family Fit uses the venue's own fact
 *   needs_recheck        a recent report contradicts the official fact, or parents disagree with each other:
 *                        the fact is treated as unknown and the line says it needs rechecking
 *   parent_corroborated  two or more INDEPENDENT accounts agree and nothing official exists: the explanation may say
 *                        so, labelled "parent-reported"; it stays an unknown, never a fact, never a reason
 *   parent_single        ONE report: never reaches Family Fit at all
 *   none                 nothing to say
 *
 * Parent reports never change a verdict upward, never become a "reason" with a tick, and never produce an age range
 * (the five observable fields are facilities; there is no age field).
 */
export interface ParentObservation {
  basis: 'parent_corroborated' | 'needs_recheck';
  /** Independent accounts behind it. */
  families: number;
  /** The agreed answers (one for corroborated; possibly several when contested). */
  observed: string[];
  /** There is an official claim being questioned (needs_recheck) rather than parents disagreeing among themselves. */
  hadOfficial: boolean;
}

export type ParentObservations = Partial<Record<VisitField, ParentObservation>>;

/** Only what the contract allows through: corroborated and needs-recheck fields. One report, or none, is dropped. */
export function parentObservationsFromTrust(trust: Pick<VenueTrust, 'fields'> | null | undefined): ParentObservations {
  const out: ParentObservations = {};
  if (!trust?.fields) return out;
  for (const [key, field] of Object.entries(trust.fields) as [VisitField, VenueTrustField][]) {
    const c = field?.confidence;
    if (!c || !c.influencesFit) continue;
    if (c.basis === 'needs_recheck') {
      out[key] = { basis: 'needs_recheck', families: field.reportCount, observed: field.observations, hadOfficial: field.sourceUrl !== null || field.checkedAt !== null };
    } else if (c.basis === 'parent_corroborated' && field.reportCount >= 2) {
      out[key] = { basis: 'parent_corroborated', families: field.reportCount, observed: field.observations, hadOfficial: false };
    }
  }
  return out;
}

const PHRASE: Record<VisitField, Record<string, string>> = {
  babyChanging: { yes: 'it is available', no: 'none was available', unavailable: 'it was closed or out of use' },
  toilets: { yes: 'they are available', no: 'none were available', unavailable: 'they were closed or out of use' },
  parking: { yes: 'parking is available', no: 'no parking was available', unavailable: 'parking was full or closed' },
  cafe: { yes: 'the café was open', no: 'the café was not open', unavailable: 'the café was closed' },
  pushchair: { good: 'buggy access is comfortable', mixed: 'buggy access is mixed', difficult: 'buggy access is difficult' },
};

const LABEL: Record<VisitField, string> = {
  babyChanging: 'Baby changing',
  toilets: 'Toilets',
  parking: 'Parking',
  cafe: 'Café',
  pushchair: 'Buggy access',
};

/**
 * The words for a field Family Fit would otherwise call "still to be checked". Always says who said it, never says
 * "confirmed", and for a contradiction says "needs rechecking".
 */
export function observationLine(field: VisitField, obs: ParentObservation, lead: string = LABEL[field]): string {
  if (obs.basis === 'needs_recheck') {
    return obs.hadOfficial
      ? `${lead} needs rechecking: recent parent reports differ from the venue’s own information`
      : `${lead} needs rechecking: parents have reported different things`;
  }
  const phrase = PHRASE[field][obs.observed[0] ?? ''] ?? 'something about it';
  return `${lead}: ${obs.families} families report ${phrase} (parent-reported, not confirmed by the venue)`;
}
