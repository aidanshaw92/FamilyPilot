/**
 * Removes what only this family knows from text that is about to leave the device in a crash report: the names in the
 * profile, the home area or postcode, and the account email. Case-insensitive, whole words. The server scrubs again for
 * the shapes it can recognise (emails, tokens, postcodes, coordinates, dates); this covers the free text it cannot.
 */
export function personalTerms(
  profile: { parentName?: string; familyName?: string; homeLocation?: string; members?: Array<{ name?: string }> } | null | undefined,
  email?: string | null,
  /** Other free text the family typed: the labels of the families in their plans (their own, and connected families' first names). */
  labels: Array<string | undefined> = [],
): string[] {
  const raw: string[] = [...labels.map((l) => l ?? '')];
  if (profile) {
    raw.push(profile.parentName ?? '', profile.familyName ?? '', profile.homeLocation ?? '');
    for (const m of profile.members ?? []) raw.push(m.name ?? '');
  }
  if (email) raw.push(email, email.split('@')[0] ?? '');
  const terms = new Set<string>();
  for (const value of raw) {
    const t = value.trim();
    if (t.length >= 2) terms.add(t);
    // "Ida Shaw" also hides "Ida" and "Shaw"; a postcode "NW7 2AB" also hides "NW7".
    for (const part of t.split(/\s+/)) if (part.length >= 2) terms.add(part);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function scrubPersonal(text: string, terms: string[]): string {
  let out = text;
  for (const term of terms) out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, 'giu'), '[private]');
  return out;
}
