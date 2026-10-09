import { FamilyProfile } from '@/src/types';
import { activityEvidenceFor, evidenceCovers } from '@/src/services/matching/activity-evidence';
import { childAgeMonths } from '@/src/services/matching/age-suitability';
import { plannerRequirements } from '@/src/services/planning/plan-parties';
import { evaluateVenueRules, ruleAppliesOn } from '@/src/services/matching/venue-rules';
import { familyNeedsStepFree, familyUsesBuggy } from '@/src/utils/family-mobility';
import type { VenueRule } from '@/src/types/venue-rules';

/**
 * What Venue Detail says in "Before you go" and "For children": the venue's own reviewed rules and age-specific provision,
 * as rows a parent can scan. Pure, so the same rows can be checked without drawing a screen.
 *
 * Nothing here is invented or inferred: a row exists only because a reviewed rule or a reviewed activity reading exists, each
 * with the page it came from. A venue with neither shows neither section (never "no restrictions").
 */

export interface BeforeYouGoRow {
  key: string;
  text: string;
  /** `important` needs action or changes the visit; `info` is worth knowing. */
  tone: 'important' | 'info';
  /** True when this household's own needs (a buggy, a mobility aid, a listed must-have) are what make it important. */
  forYou: boolean;
  /** Where it applies, when it is one part of the venue: "Nature Gallery". */
  area: string | null;
  /** The day the source page was read, for the caption. */
  checkedAt: string | null;
  sourceUrl: string | null;
}

const KIND_ORDER: Record<VenueRule['kind'], number> = { closure: 0, pushchair: 1, step_free: 2, booking: 3, caution: 4 };

const todayIn = (now: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts;
};

/** The rules a parent should read now: in force today or still to come, this household's first, then by kind. */
export function beforeYouGoRows(
  rules: readonly VenueRule[] | null | undefined,
  profile: FamilyProfile | null | undefined,
  now: Date = new Date(),
): BeforeYouGoRow[] {
  if (!rules?.length) return [];
  const today = todayIn(now);
  const required = plannerRequirements(profile?.mustHaveFacilities);
  const mustHaves = required.filter((f): f is 'toilets' | 'babyChanging' | 'parking' => f !== 'pushchair');
  const visit = {
    date: today,
    usesPushchair: familyUsesBuggy(profile),
    requiresPushchair: required.includes('pushchair'),
    requiredFacilities: mustHaves,
    needsStepFree: familyNeedsStepFree(profile),
  };
  const mine = new Set(evaluateVenueRules(rules, visit).notes.filter((n) => n.severity === 'important').map((n) => n.ruleId));

  const rows = rules
    // Over: a closure or restriction whose last day has passed is not news. Not yet started: shown, because a parent
    // planning ahead needs to see "closed from 20 October".
    .filter((rule) => !(rule.until && rule.until < today) && (ruleAppliesOn(rule, today) || Boolean(rule.from && rule.from > today) || Boolean(rule.weekdays?.length)))
    .map((rule): BeforeYouGoRow => {
      const forYou = mine.has(rule.id);
      const tone: BeforeYouGoRow['tone'] =
        forYou || (rule.kind === 'closure' && rule.scope === 'venue') || (rule.kind === 'pushchair' && rule.coversCoreVisit) ? 'important' : 'info';
      return { key: rule.id, text: rule.text, tone, forYou, area: rule.scope === 'area' ? rule.area ?? null : null, checkedAt: rule.checkedAt ?? null, sourceUrl: rule.sourceUrl ?? null };
    });

  const kindOf = new Map(rules.map((r) => [r.id, r.kind]));
  return rows.sort(
    (a, b) =>
      Number(b.forYou) - Number(a.forYou) ||
      Number(b.tone === 'important') - Number(a.tone === 'important') ||
      KIND_ORDER[kindOf.get(a.key)!] - KIND_ORDER[kindOf.get(b.key)!] ||
      a.key.localeCompare(b.key),
  );
}

export interface ChildProvisionRow {
  key: string;
  /** The venue's own description, which already carries the ages it states ("Playground for children 4 to 14"). */
  label: string;
  /** Classes or sessions on set days, as opposed to something there on any ordinary visit. */
  onSetDays: boolean;
  /** Names of this household's children the stated ages cover. Empty when none are covered or no ages are known. */
  suits: string[];
  readOn: string;
}

/** What the venue's own pages say children of an age can do there, with the household's children matched to it. */
export function childProvisionRows(venueId: string | undefined, profile: FamilyProfile | null | undefined, now: Date = new Date()): ChildProvisionRow[] {
  if (!venueId) return [];
  const children = (profile?.members ?? []).filter((m) => m.role === 'child');
  return activityEvidenceFor(venueId, now)
    .map((item) => ({
      key: `${item.kind}-${item.label}`,
      label: item.label,
      onSetDays: item.kind === 'programme',
      suits: children.filter((c) => c.name.trim() && evidenceCovers(item, childAgeMonths(c))).map((c) => c.name.trim()),
      readOn: item.readOn,
    }))
    // What suits this household first, then permanent provision before programmes.
    .sort((a, b) => b.suits.length - a.suits.length || Number(a.onSetDays) - Number(b.onSetDays) || a.label.localeCompare(b.label));
}
